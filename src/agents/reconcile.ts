/**
 * Managed artifact reconciler — workflow/runtime를 모르는 file/directory write primitive
 * (specs/044 FR-6). rollback 가능한 same-parent staged swap, 고아 상태 복구, marker 결합
 * prune/retirement을 소유한다. skills/commands adapter가 이 primitive를 호출하고 자체
 * 복사-삭제 구현을 중복하지 않는다.
 *
 * 안전 규율:
 * - Generated target root와 immediate runtime parent는 real directory만 허용(symlink/
 *   dangling/non-directory는 caller가 target-level problem으로 격리).
 * - mutation 직전 parent (dev,ino) identity와 target 상태(부재/동일 inode)를 재확인한다(R1-08).
 * - stage/backup/retired는 `.localmind-*` hidden prefix + 이름 결합 + hex nonce로 정확 매칭한다
 *   (접두 이름 오귀속 금지, R1-08).
 * - prune은 direct delete하지 않는다 — retired로 rename해 runtime-visible name을 먼저 제거.
 * - cleanup 실패(backup/retired/recovery)는 success로 숨기지 않고 `problem`으로 올린다(R1-04).
 * - 복구는 target을 absent / managed-complete / present-other로 3분하고 present-other에는
 *   rename/삭제를 하지 않는다(R1-01). 여러 backup·incomplete 고아는 삭제 없이 `problem`, 완성
 *   stage는 결정적으로 승격한다(R1-07).
 * - fault injection은 FsOps seam으로만 주입한다. production과 test가 같은 control flow.
 * - beforeMutate는 test가 rename 직전 race를 주입하는 seam이다(production은 미지정 → no-op).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// ── filesystem operation seam(테스트 fault injection 지점) ────────────────

export interface FsOps {
  mkdir(dir: string): void;
  writeFile(file: string, data: string | Buffer): void;
  copyFile(src: string, dest: string, mode: number): void;
  rename(from: string, to: string): void;
  rm(target: string, recursive: boolean): void;
  chmod(file: string, mode: number): void;
}

export const defaultFsOps: FsOps = {
  mkdir: (dir) => fs.mkdirSync(dir, { recursive: true }),
  writeFile: (file, data) => fs.writeFileSync(file, data),
  copyFile: (src, dest, mode) => {
    fs.copyFileSync(src, dest);
    fs.chmodSync(dest, mode);
  },
  rename: (from, to) => fs.renameSync(from, to),
  rm: (target, recursive) => fs.rmSync(target, { recursive, force: true }),
  chmod: (file, mode) => fs.chmodSync(file, mode),
};

export type ReconcileStatus =
  | "created"
  | "updated"
  | "unchanged"
  | "pruned"
  | "recovered"
  | "skipped-unmanaged"
  | "problem";

export interface ReconcileResult {
  status: ReconcileStatus;
  reason?: string;
}

type OrphanKind = "stage" | "backup" | "retired";
const HIDDEN = (kind: OrphanKind, name: string, nc: string) => `.localmind-${kind}-${name}-${nc}`;
const nonce = () => crypto.randomBytes(6).toString("hex");

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** best-effort 정리(error 경로 — 이미 problem을 반환하는 지점에서만). */
function safeRm(ops: FsOps, p: string, recursive: boolean): void {
  try {
    ops.rm(p, recursive);
  } catch {
    /* best-effort cleanup */
  }
}

/** 성공 경로의 cleanup — 실패를 boolean으로 알려 caller가 problem으로 올릴 수 있게 한다(R1-04). */
function tryRm(ops: FsOps, p: string, recursive: boolean): boolean {
  try {
    ops.rm(p, recursive);
    return true;
  } catch {
    return false;
  }
}

/** parent가 real directory인지 확인하고 (dev,ino) identity를 반환한다. */
function parentIdentity(parent: string): { id: string } | { error: string } {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(parent);
  } catch {
    return { error: `대상 부모 폴더가 없습니다: ${parent}` };
  }
  if (st.isSymbolicLink()) return { error: `대상 부모가 심볼릭 링크입니다(실제 폴더 필요): ${parent}` };
  if (!st.isDirectory()) return { error: `대상 부모가 폴더가 아닙니다: ${parent}` };
  return { id: `${st.dev}:${st.ino}` };
}

function reCheckIdentity(parent: string, expected: string): boolean {
  try {
    const st = fs.lstatSync(parent);
    return `${st.dev}:${st.ino}` === expected;
  } catch {
    return false;
  }
}

/** no-follow로 실제 디렉토리인지 확인하고 (dev,ino) id를 반환한다(symlink/비디렉토리/부재는 null). */
export function realDirIdentity(p: string): string | null {
  try {
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink() || !st.isDirectory()) return null;
    return `${st.dev}:${st.ino}`;
  } catch {
    return null;
  }
}

/** prepareRoot가 포착한 runtime parent/root 신원(중간 경로 symlink 재지향 방지, R4-02). */
export interface RootGuard {
  rootDir: string;
  parentDir: string;
  /** root 생성 전에 포착한 immediate runtime parent의 (dev,ino) — 이후 교체를 감지한다. */
  parentId: string;
  rootId: string;
}

/**
 * runtime parent/root 신원을 mutation 직전 재검한다(R4-02). immediate parent를 **no-follow(lstat)**로
 * 직접 확인해 중간 경로 요소가 symlink로 바뀌거나 다른 디렉토리로 (dev,ino) 교체된 경우를 잡는다 —
 * lstat이 최종 경로만 검사하면 중간 symlink를 따라가 재지향된 트리에 쓰게 된다. 위반 시 사유 문자열,
 * 정상이면 null.
 */
export function revalidateRootGuard(g: RootGuard): string | null {
  const pid = realDirIdentity(g.parentDir);
  if (pid === null) return `runtime 부모가 실제 폴더가 아닙니다(심링크/교체 감지): ${g.parentDir}`;
  if (pid !== g.parentId) return `runtime 부모 식별자가 바뀌었습니다(교체 감지): ${g.parentDir}`;
  const rid = realDirIdentity(g.rootDir);
  if (rid === null) return `target root가 실제 폴더가 아닙니다(심링크/교체 감지): ${g.rootDir}`;
  if (rid !== g.rootId) return `target root 식별자가 바뀌었습니다(교체 감지): ${g.rootDir}`;
  return null;
}

/** target의 (dev,ino) — 없으면 null. */
function targetInode(target: string): string | null {
  try {
    const st = fs.lstatSync(target);
    return `${st.dev}:${st.ino}`;
  } catch {
    return null;
  }
}

/** 이름 결합 + hex nonce로 정확히 매칭하는 고아 목록(접두 오귀속 금지, R1-08). */
function orphansFor(parent: string, kind: OrphanKind, name: string): string[] {
  const re = new RegExp(`^\\.localmind-${kind}-${escapeRegex(name)}-[0-9a-f]+$`);
  try {
    return fs
      .readdirSync(parent)
      .filter((n) => re.test(n))
      .map((n) => path.join(parent, n))
      .sort();
  } catch {
    return [];
  }
}

type TargetKind = "absent" | "managed-complete" | "present-other";

function classifyTargetDir(target: string, ownedBy: (d: string) => boolean, isComplete: (d: string) => boolean): TargetKind {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(target);
  } catch {
    return "absent";
  }
  if (st.isSymbolicLink() || !st.isDirectory()) return "present-other";
  return ownedBy(target) && isComplete(target) ? "managed-complete" : "present-other";
}

function classifyTargetFile(target: string, ownedBy: (f: string) => boolean, isComplete: (f: string) => boolean): TargetKind {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(target);
  } catch {
    return "absent";
  }
  if (st.isSymbolicLink() || !st.isFile()) return "present-other";
  return ownedBy(target) && isComplete(target) ? "managed-complete" : "present-other";
}

// ── directory replace ─────────────────────────────────────────────────────

export interface ReplaceDirOptions {
  parent: string;
  name: string;
  /** 기존 target 디렉토리가 우리 managed인가(marker) */
  ownedBy: (dir: string) => boolean;
  /** 기존 managed target이 이미 최신인가(payload/metadata 동일) */
  isUpToDate: (dir: string) => boolean;
  /** stage 디렉토리를 완성한다(모든 write는 ops 경유 — fault injection) */
  render: (stageDir: string, ops: FsOps) => void;
  ops?: FsOps;
  /** test race seam(production 미지정). rename 직전에 호출된다. */
  beforeMutate?: () => void;
  /** R4-02: mutation 직전 runtime parent/root 신원 재검(위반 시 problem으로 중단). */
  guard?: () => string | null;
}

/**
 * managed directory를 rollback 가능한 swap으로 교체한다.
 * create/update/unchanged/skipped-unmanaged/problem 중 하나를 반환한다.
 */
export function replaceManagedDirectory(o: ReplaceDirOptions): ReconcileResult {
  const ops = o.ops ?? defaultFsOps;
  const target = path.join(o.parent, o.name);

  const parent = parentIdentity(o.parent);
  if ("error" in parent) return { status: "problem", reason: parent.error };
  // R4-02: 어떤 write보다 먼저 runtime parent/root 신원을 재검한다(중간 경로 symlink 재지향 차단).
  if (o.guard) {
    const gErr = o.guard();
    if (gErr) return { status: "problem", reason: gErr };
  }

  let targetStat: fs.Stats | null = null;
  try {
    targetStat = fs.lstatSync(target);
  } catch {
    targetStat = null;
  }
  if (targetStat) {
    if (targetStat.isSymbolicLink() || !targetStat.isDirectory()) {
      return { status: "skipped-unmanaged", reason: "동명 비디렉토리/심볼릭 링크 보존" };
    }
    if (!o.ownedBy(target)) return { status: "skipped-unmanaged", reason: "동명 unmanaged 디렉토리 보존" };
    if (o.isUpToDate(target)) return { status: "unchanged" };
  }
  const inodeBefore = targetStat ? `${targetStat.dev}:${targetStat.ino}` : null;

  const n = nonce();
  const stage = path.join(o.parent, HIDDEN("stage", o.name, n));
  const backup = path.join(o.parent, HIDDEN("backup", o.name, n));

  try {
    ops.mkdir(stage);
    o.render(stage, ops);
  } catch (err) {
    safeRm(ops, stage, true);
    return { status: "problem", reason: `스테이지 생성 실패: ${(err as Error).message}` };
  }

  // rename 직전 race 재확인(R1-08): parent identity + target 상태.
  o.beforeMutate?.();
  if (!reCheckIdentity(o.parent, parent.id)) {
    safeRm(ops, stage, true);
    return { status: "problem", reason: "대상 부모 식별자가 바뀌었습니다(중단)" };
  }

  if (inodeBefore === null) {
    // create: target이 그 사이 생겼으면(선점) 덮어쓰지 않는다.
    if (targetInode(target) !== null) {
      safeRm(ops, stage, true);
      return { status: "problem", reason: "생성 직전 동명 항목이 생겨 중단(덮어쓰기 금지)" };
    }
    try {
      ops.rename(stage, target);
      return { status: "created" };
    } catch (err) {
      safeRm(ops, stage, true);
      return { status: "problem", reason: `생성 rename 실패: ${(err as Error).message}` };
    }
  }

  // update: target identity가 검증 시점과 다르면 중단(race).
  if (targetInode(target) !== inodeBefore) {
    safeRm(ops, stage, true);
    return { status: "problem", reason: "교체 직전 대상 식별자가 바뀌었습니다(중단)" };
  }

  // target → backup, stage → target
  try {
    ops.rename(target, backup);
  } catch (err) {
    safeRm(ops, stage, true);
    return { status: "problem", reason: `백업 rename 실패: ${(err as Error).message}` };
  }
  try {
    ops.rename(stage, target);
  } catch (err) {
    // placement 전 실패 → old backup을 원위치로 복구
    try {
      ops.rename(backup, target);
    } catch {
      /* 복구 실패: backup은 hidden으로 남아 다음 recovery가 처리 */
    }
    safeRm(ops, stage, true);
    return { status: "problem", reason: `교체 rename 실패(백업 복구 시도): ${(err as Error).message}` };
  }
  // complete-new 배치 완료 — backup cleanup 실패는 success로 숨기지 않는다(R1-04).
  if (!tryRm(ops, backup, true)) {
    return { status: "problem", reason: "새 target 배치 후 백업 정리 실패 — 다음 실행이 정리(new 유지)" };
  }
  return { status: "updated" };
}

export interface RecoverDirOptions {
  parent: string;
  name: string;
  ownedBy: (dir: string) => boolean;
  /** 완전한 managed artifact인가(예: 유효한 exact skill/package) */
  isComplete: (dir: string) => boolean;
  ops?: FsOps;
  beforeMutate?: () => void;
  /** R4-02: mutation 직전 runtime parent/root 신원 재검(위반 시 problem으로 중단). */
  guard?: () => string | null;
}

/**
 * 고아 stage/backup을 결정적으로 복구/정리한다. 복구/정리할 것이 없으면 null.
 * 모호한 상태(여러 backup, marker 불일치, incomplete stage, present-other target)는 삭제하지 않고 problem.
 */
export function recoverManagedDirectory(o: RecoverDirOptions): ReconcileResult | null {
  const ops = o.ops ?? defaultFsOps;
  const target = path.join(o.parent, o.name);

  const parent = parentIdentity(o.parent);
  if ("error" in parent) return { status: "problem", reason: parent.error };
  // R4-02: 어떤 write보다 먼저 runtime parent/root 신원을 재검한다(중간 경로 symlink 재지향 차단).
  if (o.guard) {
    const gErr = o.guard();
    if (gErr) return { status: "problem", reason: gErr };
  }

  // retired 고아 정리 — 이름 결합 marker + directory인 것만. cleanup 실패는 problem으로 올린다.
  let retiredCleanupFailed = false;
  for (const r of orphansFor(o.parent, "retired", o.name)) {
    try {
      const st = fs.lstatSync(r);
      if (!st.isSymbolicLink() && st.isDirectory() && o.ownedBy(r)) {
        if (!tryRm(ops, r, true)) retiredCleanupFailed = true;
      }
    } catch {
      /* skip */
    }
  }

  const stages = orphansFor(o.parent, "stage", o.name);
  const backups = orphansFor(o.parent, "backup", o.name);
  if (stages.length === 0 && backups.length === 0) {
    return retiredCleanupFailed ? { status: "problem", reason: "retired 고아 정리 실패 — 다음 실행이 재시도" } : null;
  }

  const isDirOrphanComplete = (d: string): boolean => {
    try {
      const st = fs.lstatSync(d);
      return !st.isSymbolicLink() && st.isDirectory() && o.ownedBy(d) && o.isComplete(d);
    } catch {
      return false;
    }
  };
  const completeStages = stages.filter(isDirOrphanComplete);
  const completeBackups = backups.filter(isDirOrphanComplete);
  const hasIncomplete = completeStages.length !== stages.length || completeBackups.length !== backups.length;

  const tk = classifyTargetDir(target, o.ownedBy, o.isComplete);
  if (tk === "present-other") {
    return { status: "problem", reason: "동명 target이 unmanaged/불완전 — 고아를 복구/삭제하지 않음" };
  }
  if (hasIncomplete) return { status: "problem", reason: "불완전한 고아 stage/backup — 삭제하지 않음" };
  if (completeStages.length > 1 || completeBackups.length > 1) {
    return { status: "problem", reason: "여러 고아 stage/backup(모호) — 삭제하지 않음" };
  }

  if (tk === "managed-complete") {
    // target이 완전하면 stage/backup은 stale 고아 — 정리(실패는 problem).
    let ok = true;
    for (const x of [...completeStages, ...completeBackups]) if (!tryRm(ops, x, true)) ok = false;
    if (retiredCleanupFailed) ok = false;
    return ok ? { status: "recovered", reason: "고아 정리(target 유지)" } : { status: "problem", reason: "고아 정리 실패 — 다음 실행이 재시도" };
  }

  // tk === "absent": 완성 stage만 또는 완성 backup만 결정적으로 복원. 둘 다면 모호 → problem.
  const isStage = completeStages.length === 1 && completeBackups.length === 0;
  const restoreFrom = isStage ? completeStages[0] : completeBackups.length === 1 && completeStages.length === 0 ? completeBackups[0] : null;
  if (!restoreFrom) return { status: "problem", reason: "target 없음 + 유효 고아가 유일하지 않음(모호) — 삭제하지 않음" };

  o.beforeMutate?.();
  if (!reCheckIdentity(o.parent, parent.id)) return { status: "problem", reason: "복구 직전 부모 식별자 변경(중단)" };
  if (targetInode(target) !== null) return { status: "problem", reason: "복구 직전 동명 target 선점 — 덮어쓰기 금지" };
  try {
    ops.rename(restoreFrom, target);
  } catch (err) {
    return { status: "problem", reason: `복구 rename 실패: ${(err as Error).message}` };
  }
  // 복구는 완료했으나 retired 고아 정리가 실패했다면 success로 숨기지 않는다(R1-04) — 다음 실행이 정리.
  if (retiredCleanupFailed) return { status: "problem", reason: "복구했으나 retired 고아 정리 실패 — 다음 실행이 재시도" };
  return { status: "recovered", reason: isStage ? "완성 스테이지 승격" : "backup에서 복구" };
}

export interface PruneDirOptions {
  parent: string;
  name: string;
  ownedBy: (dir: string) => boolean;
  ops?: FsOps;
  beforeMutate?: () => void;
  /** R4-02: mutation 직전 runtime parent/root 신원 재검(위반 시 problem으로 중단). */
  guard?: () => string | null;
}

/**
 * name-bound managed directory를 retire한다. retired로 먼저 rename해 runtime-visible name을
 * 제거한 뒤 삭제한다. unmanaged/부재는 건드리지 않는다. retired cleanup 실패는 problem(R1-04).
 */
export function pruneManagedDirectory(o: PruneDirOptions): ReconcileResult {
  const ops = o.ops ?? defaultFsOps;
  const target = path.join(o.parent, o.name);

  const parent = parentIdentity(o.parent);
  if ("error" in parent) return { status: "problem", reason: parent.error };
  // R4-02: 어떤 write보다 먼저 runtime parent/root 신원을 재검한다(중간 경로 symlink 재지향 차단).
  if (o.guard) {
    const gErr = o.guard();
    if (gErr) return { status: "problem", reason: gErr };
  }

  let st: fs.Stats;
  try {
    st = fs.lstatSync(target);
  } catch {
    return { status: "unchanged" }; // 없음 = 할 일 없음
  }
  if (st.isSymbolicLink() || !st.isDirectory()) return { status: "skipped-unmanaged", reason: "동명 비디렉토리/심볼릭 링크 보존" };
  if (!o.ownedBy(target)) return { status: "skipped-unmanaged", reason: "unmanaged 디렉토리 보존" };
  const inodeBefore = `${st.dev}:${st.ino}`;

  o.beforeMutate?.();
  if (!reCheckIdentity(o.parent, parent.id)) return { status: "problem", reason: "정리 직전 부모 식별자 변경(중단)" };
  if (targetInode(target) !== inodeBefore) return { status: "problem", reason: "정리 직전 대상 식별자 변경 — retire 중단" };

  const retired = path.join(o.parent, HIDDEN("retired", o.name, nonce()));
  try {
    ops.rename(target, retired);
  } catch (err) {
    return { status: "problem", reason: `retire rename 실패: ${(err as Error).message}` };
  }
  if (!tryRm(ops, retired, true)) {
    return { status: "problem", reason: "retire 후 정리 실패 — visible name은 제거됨, 다음 실행이 정리" };
  }
  return { status: "pruned" };
}

// ── file replace(Gemini command TOML) ─────────────────────────────────────

export interface ReplaceFileOptions {
  parent: string;
  fileName: string;
  content: string;
  ownedBy: (file: string) => boolean;
  ops?: FsOps;
  beforeMutate?: () => void;
  /** R4-02: mutation 직전 runtime parent/root 신원 재검(위반 시 problem으로 중단). */
  guard?: () => string | null;
}

/** managed file을 same-parent temp + backup swap으로 교체한다. */
export function replaceManagedFile(o: ReplaceFileOptions): ReconcileResult {
  const ops = o.ops ?? defaultFsOps;
  const target = path.join(o.parent, o.fileName);

  const parent = parentIdentity(o.parent);
  if ("error" in parent) return { status: "problem", reason: parent.error };
  // R4-02: 어떤 write보다 먼저 runtime parent/root 신원을 재검한다(중간 경로 symlink 재지향 차단).
  if (o.guard) {
    const gErr = o.guard();
    if (gErr) return { status: "problem", reason: gErr };
  }

  let targetStat: fs.Stats | null = null;
  try {
    targetStat = fs.lstatSync(target);
  } catch {
    targetStat = null;
  }
  if (targetStat) {
    if (targetStat.isSymbolicLink() || !targetStat.isFile()) return { status: "skipped-unmanaged", reason: "동명 비파일/심볼릭 링크 보존" };
    if (!o.ownedBy(target)) return { status: "skipped-unmanaged", reason: "동명 unmanaged 파일 보존" };
    try {
      if (fs.readFileSync(target, "utf8") === o.content) return { status: "unchanged" };
    } catch {
      /* 읽기 실패면 갱신 시도 */
    }
  }
  const inodeBefore = targetStat ? `${targetStat.dev}:${targetStat.ino}` : null;

  const n = nonce();
  const stage = path.join(o.parent, HIDDEN("stage", o.fileName, n));
  const backup = path.join(o.parent, HIDDEN("backup", o.fileName, n));

  try {
    ops.writeFile(stage, o.content);
  } catch (err) {
    safeRm(ops, stage, false);
    return { status: "problem", reason: `임시 파일 쓰기 실패: ${(err as Error).message}` };
  }

  o.beforeMutate?.();
  if (!reCheckIdentity(o.parent, parent.id)) {
    safeRm(ops, stage, false);
    return { status: "problem", reason: "대상 부모 식별자가 바뀌었습니다(중단)" };
  }

  if (inodeBefore === null) {
    if (targetInode(target) !== null) {
      safeRm(ops, stage, false);
      return { status: "problem", reason: "생성 직전 동명 항목이 생겨 중단(덮어쓰기 금지)" };
    }
    try {
      ops.rename(stage, target);
      return { status: "created" };
    } catch (err) {
      safeRm(ops, stage, false);
      return { status: "problem", reason: `생성 rename 실패: ${(err as Error).message}` };
    }
  }

  if (targetInode(target) !== inodeBefore) {
    safeRm(ops, stage, false);
    return { status: "problem", reason: "교체 직전 대상 식별자가 바뀌었습니다(중단)" };
  }

  try {
    ops.rename(target, backup);
  } catch (err) {
    safeRm(ops, stage, false);
    return { status: "problem", reason: `백업 rename 실패: ${(err as Error).message}` };
  }
  try {
    ops.rename(stage, target);
  } catch (err) {
    try {
      ops.rename(backup, target);
    } catch {
      /* 복구 실패: backup은 hidden으로 남음 */
    }
    safeRm(ops, stage, false);
    return { status: "problem", reason: `교체 rename 실패(백업 복구 시도): ${(err as Error).message}` };
  }
  if (!tryRm(ops, backup, false)) {
    return { status: "problem", reason: "새 파일 배치 후 백업 정리 실패 — 다음 실행이 정리(new 유지)" };
  }
  return { status: "updated" };
}

export interface RecoverFileOptions {
  parent: string;
  fileName: string;
  ownedBy: (file: string) => boolean;
  /** 완전한(truncated 아님) managed file인가(R1-07: marker 존재만으로 복구 금지) */
  isComplete: (file: string) => boolean;
  ops?: FsOps;
  beforeMutate?: () => void;
  /** R4-02: mutation 직전 runtime parent/root 신원 재검(위반 시 problem으로 중단). */
  guard?: () => string | null;
}

/** 고아 file stage/backup을 복구/정리한다. 없으면 null, 모호하면 problem. */
export function recoverManagedFile(o: RecoverFileOptions): ReconcileResult | null {
  const ops = o.ops ?? defaultFsOps;
  const target = path.join(o.parent, o.fileName);

  const parent = parentIdentity(o.parent);
  if ("error" in parent) return { status: "problem", reason: parent.error };
  // R4-02: 어떤 write보다 먼저 runtime parent/root 신원을 재검한다(중간 경로 symlink 재지향 차단).
  if (o.guard) {
    const gErr = o.guard();
    if (gErr) return { status: "problem", reason: gErr };
  }

  let retiredCleanupFailed = false;
  for (const r of orphansFor(o.parent, "retired", o.fileName)) {
    try {
      const st = fs.lstatSync(r);
      if (!st.isSymbolicLink() && st.isFile() && o.ownedBy(r)) {
        if (!tryRm(ops, r, false)) retiredCleanupFailed = true;
      }
    } catch {
      /* skip */
    }
  }

  const stages = orphansFor(o.parent, "stage", o.fileName);
  const backups = orphansFor(o.parent, "backup", o.fileName);
  if (stages.length === 0 && backups.length === 0) {
    return retiredCleanupFailed ? { status: "problem", reason: "retired 고아 정리 실패 — 다음 실행이 재시도" } : null;
  }

  const isFileOrphanComplete = (f: string): boolean => {
    try {
      const st = fs.lstatSync(f);
      return !st.isSymbolicLink() && st.isFile() && o.ownedBy(f) && o.isComplete(f);
    } catch {
      return false;
    }
  };
  const completeStages = stages.filter(isFileOrphanComplete);
  const completeBackups = backups.filter(isFileOrphanComplete);
  const hasIncomplete = completeStages.length !== stages.length || completeBackups.length !== backups.length;

  const tk = classifyTargetFile(target, o.ownedBy, o.isComplete);
  if (tk === "present-other") {
    return { status: "problem", reason: "동명 target이 unmanaged/불완전 — 고아를 복구/삭제하지 않음" };
  }
  if (hasIncomplete) return { status: "problem", reason: "불완전한 고아 파일 — 삭제하지 않음" };
  if (completeStages.length > 1 || completeBackups.length > 1) {
    return { status: "problem", reason: "여러 고아 파일(모호) — 삭제하지 않음" };
  }

  if (tk === "managed-complete") {
    let ok = true;
    for (const x of [...completeStages, ...completeBackups]) if (!tryRm(ops, x, false)) ok = false;
    if (retiredCleanupFailed) ok = false;
    return ok ? { status: "recovered", reason: "고아 파일 정리(target 유지)" } : { status: "problem", reason: "고아 파일 정리 실패 — 다음 실행이 재시도" };
  }

  const isStage = completeStages.length === 1 && completeBackups.length === 0;
  const restoreFrom = isStage ? completeStages[0] : completeBackups.length === 1 && completeStages.length === 0 ? completeBackups[0] : null;
  if (!restoreFrom) return { status: "problem", reason: "target 없음 + 유효 고아가 유일하지 않음(모호) — 삭제하지 않음" };

  o.beforeMutate?.();
  if (!reCheckIdentity(o.parent, parent.id)) return { status: "problem", reason: "복구 직전 부모 식별자 변경(중단)" };
  if (targetInode(target) !== null) return { status: "problem", reason: "복구 직전 동명 target 선점 — 덮어쓰기 금지" };
  try {
    ops.rename(restoreFrom, target);
  } catch (err) {
    return { status: "problem", reason: `복구 rename 실패: ${(err as Error).message}` };
  }
  if (retiredCleanupFailed) return { status: "problem", reason: "복구했으나 retired 고아 파일 정리 실패 — 다음 실행이 재시도" };
  return { status: "recovered", reason: isStage ? "완성 스테이지 파일 승격" : "backup 파일에서 복구" };
}

export interface PruneFileOptions {
  parent: string;
  fileName: string;
  ownedBy: (file: string) => boolean;
  ops?: FsOps;
  beforeMutate?: () => void;
  /** R4-02: mutation 직전 runtime parent/root 신원 재검(위반 시 problem으로 중단). */
  guard?: () => string | null;
}

/** name-bound managed file을 retire한다. */
export function pruneManagedFile(o: PruneFileOptions): ReconcileResult {
  const ops = o.ops ?? defaultFsOps;
  const target = path.join(o.parent, o.fileName);

  const parent = parentIdentity(o.parent);
  if ("error" in parent) return { status: "problem", reason: parent.error };
  // R4-02: 어떤 write보다 먼저 runtime parent/root 신원을 재검한다(중간 경로 symlink 재지향 차단).
  if (o.guard) {
    const gErr = o.guard();
    if (gErr) return { status: "problem", reason: gErr };
  }

  let st: fs.Stats;
  try {
    st = fs.lstatSync(target);
  } catch {
    return { status: "unchanged" };
  }
  if (st.isSymbolicLink() || !st.isFile()) return { status: "skipped-unmanaged", reason: "동명 비파일/심볼릭 링크 보존" };
  if (!o.ownedBy(target)) return { status: "skipped-unmanaged", reason: "unmanaged 파일 보존" };
  const inodeBefore = `${st.dev}:${st.ino}`;

  o.beforeMutate?.();
  if (!reCheckIdentity(o.parent, parent.id)) return { status: "problem", reason: "정리 직전 부모 식별자 변경(중단)" };
  if (targetInode(target) !== inodeBefore) return { status: "problem", reason: "정리 직전 대상 식별자 변경 — retire 중단" };

  const retired = path.join(o.parent, HIDDEN("retired", o.fileName, nonce()));
  try {
    ops.rename(target, retired);
  } catch (err) {
    return { status: "problem", reason: `retire rename 실패: ${(err as Error).message}` };
  }
  if (!tryRm(ops, retired, false)) {
    return { status: "problem", reason: "retire 후 정리 실패 — visible name은 제거됨, 다음 실행이 정리" };
  }
  return { status: "pruned" };
}

/** 지정한 op 호출 중 N번째에서 실패를 주입하는 테스트용 FsOps 래퍼. */
export function faultyOps(base: FsOps, plan: Partial<Record<keyof FsOps, number>>): FsOps {
  const counts: Partial<Record<keyof FsOps, number>> = {};
  const wrap = <K extends keyof FsOps>(k: K): FsOps[K] => {
    return ((...args: unknown[]) => {
      counts[k] = (counts[k] ?? 0) + 1;
      if (plan[k] && counts[k] === plan[k]) {
        throw new Error(`injected failure: ${k}#${counts[k]}`);
      }
      return (base[k] as (...a: unknown[]) => unknown)(...args);
    }) as FsOps[K];
  };
  return {
    mkdir: wrap("mkdir"),
    writeFile: wrap("writeFile"),
    copyFile: wrap("copyFile"),
    rename: wrap("rename"),
    rm: wrap("rm"),
    chmod: wrap("chmod"),
  };
}
