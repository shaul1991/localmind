/**
 * 공급자 중립 AI workflow 자산의 정본 관리·다중 target 배포 (specs/044, 018 FR-8 계승).
 *
 * 행동 정본은 Agent Skills 표준 `SKILL.md` 하나(데이터 폴더 skills/<name>/)이고, runtime 차이는
 * 세 adapter로 제한한다: Claude skill 경로, 공용 `.agents/skills` 경로, Gemini command wrapper.
 * source discovery/validation은 skill-contract, marker 결합 swap/recovery/prune는 reconcile,
 * activation metadata는 workflow-policy, Gemini wrapper는 commands 모듈이 소유한다.
 * 이 모듈은 seed와 skill-directory target 배포를 조율하고 결과를 집계한다.
 * 불변식: brain.ts를 import하지 않는다(순환 방지). 실제 $HOME는 override/temp로만 접근한다.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { firstNotesDir } from "./registry.js";
import {
  loadSkillRegistry,
  loadManifest,
  inspectSkillDir,
  hasSkillMarker,
  isCompleteManagedSkill,
  skillMarkerComment,
  splitFrontmatter,
  TARGET_METADATA_FILES,
  type SkillPackage,
  type SkillProblem,
  type WorkflowPolicy,
} from "./skill-contract.js";
import {
  replaceManagedDirectory,
  recoverManagedDirectory,
  pruneManagedDirectory,
  defaultFsOps,
  realDirIdentity,
  revalidateRootGuard,
  type FsOps,
  type RootGuard,
} from "./reconcile.js";
import { claudeInvocationFrontmatter, codexPolicyYaml, isDenyImplicit, enforcementFor, type EnforcementLevel } from "./workflow-policy.js";
import { syncGeminiCommands, invocationsFor, resolveCodexRepoSkill, type GeminiSyncItem, type WorkspaceContext } from "./commands.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(MODULE_DIR, "..", "..", "templates", "skills");

function expandHome(p: string): string {
  return p.replace(/^~(?=$|\/)/, process.env.HOME ?? "~");
}

/** 스킬 정본(canonical source) 위치 — 노트 폴더 하위 기본(백업 편입). LOCALMIND_SKILLS_DIR override. */
export function skillsDir(): string {
  const env = process.env.LOCALMIND_SKILLS_DIR?.trim();
  if (env) return path.resolve(expandHome(env));
  return path.join(firstNotesDir(), "skills");
}

export function claudeSkillsDir(): string {
  const env = process.env.LOCALMIND_CLAUDE_SKILLS_DIR?.trim();
  if (env) return path.resolve(expandHome(env));
  return path.join(process.env.HOME ?? ".", ".claude", "skills");
}

export function agentSkillsDir(): string {
  const env = process.env.LOCALMIND_AGENT_SKILLS_DIR?.trim();
  if (env) return path.resolve(expandHome(env));
  return path.join(process.env.HOME ?? ".", ".agents", "skills");
}

export function geminiCommandsDir(): string {
  const env = process.env.LOCALMIND_GEMINI_COMMANDS_DIR?.trim();
  if (env) return path.resolve(expandHome(env));
  return path.join(process.env.HOME ?? ".", ".gemini", "commands");
}

export type WorkflowTargetId = "canonical-seed" | "claude-skill" | "agent-skill" | "gemini-command";
export type WorkflowStatus =
  | "created"
  | "updated"
  | "unchanged"
  | "pruned"
  | "recovered"
  | "skipped-unmanaged"
  | "skipped-unavailable"
  | "skipped-dependency"
  | "problem";

export interface WorkflowSyncItem {
  logicalId: string;
  target: WorkflowTargetId;
  artifactKind: "skill-directory" | "command-file";
  status: WorkflowStatus;
  invocation?: string;
  reason?: string;
  resolution?: "resolved" | "equivalent-shadow" | "ambiguous-shadow" | "unmanaged-shadow" | "unverified";
  /** 이 target에서 activation 강제 수준 — packaged explicit workflow에만 의미가 있다(R1-14). */
  enforcement?: EnforcementLevel;
}

export interface WorkflowDeployResult {
  outcome: "success" | "partial" | "failed";
  exitCode: 0 | 1;
  pruneSuppressed: boolean;
  items: WorkflowSyncItem[];
  sourceProblems: SkillProblem[];
}

const RESERVED_FORK_REASON = "reserved-id-fork: 예약된 packaged 이름과 같지만 정본과 다릅니다 — 다른 이름으로 rename하세요";

// ── SKILL.md 렌더 helper ─────────────────────────────────────────────────

/** markerless custom source에 이름 결합 marker를 결정적으로 삽입한다(이미 있으면 그대로). */
function ensureSkillMarker(content: string, name: string): string {
  if (hasSkillMarker(content, name)) return content;
  const split = splitFrontmatter(content);
  if ("error" in split) return content; // frontmatter 없는 건 상위에서 걸러짐
  return `---\n${split.fm}\n---\n${skillMarkerComment(name)}\n${split.body}`;
}

/**
 * Claude explicit workflow용 deny-implicit frontmatter 키를 결정적으로 추가한다.
 * 기존 disable-model-invocation 줄은 값과 무관하게 제거하고 정확히 `true`를 넣는다 —
 * `false`나 다른 표기를 보존해 execution guard를 무력화하지 않는다(R1-02).
 */
function injectClaudeFrontmatter(content: string): string {
  const split = splitFrontmatter(content);
  if ("error" in split) return content;
  const fm = split.fm
    .split("\n")
    .filter((l) => !/^disable-model-invocation\s*:/.test(l))
    .join("\n");
  return `---\n${fm}\ndisable-model-invocation: true\n---\n${split.body}`;
}

/** target용 SKILL.md 본문을 렌더한다(marker 보장 + Claude deny-implicit). */
function renderSkillMd(source: SkillPackage, targetId: WorkflowTargetId, policy?: WorkflowPolicy): string {
  let content = fs.readFileSync(path.join(source.root, "SKILL.md"), "utf8").replace(/\r\n/g, "\n");
  content = ensureSkillMarker(content, source.name);
  if (targetId === "claude-skill" && policy && Object.keys(claudeInvocationFrontmatter(policy)).length > 0) {
    content = injectClaudeFrontmatter(content);
  }
  return content;
}

/**
 * source의 파일을 stage로 복사하며 target metadata를 렌더한다(fault injection은 ops 경유).
 * packaged workflow의 agents/openai.yaml는 adapter가 재생성하므로 source 잔여를 건너뛰지만,
 * **custom skill(정책 없음)의 agents/openai.yaml는 사용자 자원이므로 그대로 복사한다**(R1-12).
 */
function renderTargetInto(source: SkillPackage, targetId: WorkflowTargetId, policy: WorkflowPolicy | undefined, stageDir: string, ops: FsOps): void {
  const isPackaged = !!policy;
  for (const rel of source.files) {
    if (isPackaged && TARGET_METADATA_FILES.has(rel)) continue; // packaged generated metadata는 재생성
    const dest = path.join(stageDir, rel);
    ops.mkdir(path.dirname(dest));
    if (rel === "SKILL.md") {
      ops.writeFile(dest, renderSkillMd(source, targetId, policy));
      // 렌더된 SKILL.md에도 source mode를 적용한다 — target-normalized hash가 SKILL.md의 실행
      // 비트를 포함하므로, mode를 안 맞추면 실행 SKILL.md가 매 배포 드리프트로 잡힌다(R4-03).
      // chmod는 ops 경유라 fault-injectable하고, 실패 시 stage 단계에서 problem으로 격리된다.
      ops.chmod(dest, fs.statSync(path.join(source.root, rel)).mode & 0o777);
    } else {
      const mode = fs.statSync(path.join(source.root, rel)).mode & 0o777;
      ops.copyFile(path.join(source.root, rel), dest, mode);
    }
  }
  if (targetId === "agent-skill" && policy) {
    const yaml = codexPolicyYaml(source.name, policy, source.canonicalPayloadHash);
    if (yaml) {
      ops.mkdir(path.join(stageDir, "agents"));
      ops.writeFile(path.join(stageDir, "agents", "openai.yaml"), yaml);
    }
  }
}

/**
 * 기존 managed target이 이미 최신인가. 정본과 target 모두 **target-normalized** payload로 비교하고
 * (custom skill의 openai.yaml도 양쪽에서 동일하게 제외 → 멱등 안정), packaged workflow에 한해
 * generated invocation-control metadata(disable-model-invocation / openai.yaml)를 exact 검증한다.
 */
function targetUpToDate(dir: string, source: SkillPackage, targetId: WorkflowTargetId, policy?: WorkflowPolicy): boolean {
  const insp = inspectSkillDir(dir);
  if ("error" in insp) return false;
  const srcInsp = inspectSkillDir(source.root); // 정본의 target-normalized hash로 비교(양쪽 동일 정규화)
  if ("error" in srcInsp) return false;
  if (insp.hash !== srcInsp.hash) return false;
  let skillMd: string;
  try {
    skillMd = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8").replace(/\r\n/g, "\n");
  } catch {
    return false;
  }
  if (!hasSkillMarker(skillMd, source.name)) return false;
  // custom skill(정책 없음)의 agents/openai.yaml 등 target metadata 파일은 generated가 아니라
  // 사용자 소유 payload다 — target-normalized hash가 양쪽에서 제외하므로 여기서 byte 단위로 drift를
  // 직접 검출한다. 그러지 않으면 소스 변경이 재배포에서 조용히 무시된다(R2-01).
  if (!policy) {
    for (const rel of TARGET_METADATA_FILES) {
      const srcPath = path.join(source.root, rel);
      const dstPath = path.join(dir, rel);
      const srcExists = source.files.includes(rel);
      const dstExists = fs.existsSync(dstPath);
      if (srcExists !== dstExists) return false;
      if (srcExists) {
        try {
          if (!fs.readFileSync(srcPath).equals(fs.readFileSync(dstPath))) return false;
          // exec-bit도 exact detection 축이다 — payload hash가 다른 모든 파일에 대해 실행 비트를
          // 프레임하듯, 제외된 이 파일도 실행 상태 변경을 drift로 본다(R2-01 exact detection).
          if (((fs.statSync(srcPath).mode & 0o111) !== 0) !== ((fs.statSync(dstPath).mode & 0o111) !== 0)) return false;
        } catch {
          return false;
        }
      }
    }
  }
  const fmSplit = splitFrontmatter(skillMd);
  const fm = "error" in fmSplit ? "" : fmSplit.fm;
  // generated invocation-control metadata의 exact 검증은 packaged workflow(policy 존재)에만 적용한다.
  // custom skill의 자체 frontmatter/자원은 검열하지 않는다(FR-1/FR-6).
  if (targetId === "claude-skill" && policy) {
    const need = isDenyImplicit(policy);
    const hasKey = /^disable-model-invocation\s*:/m.test(fm);
    const hasTrue = /^disable-model-invocation\s*:\s*true\s*$/m.test(fm);
    if (need ? !hasTrue : hasKey) return false;
  }
  if (targetId === "agent-skill" && policy) {
    const yaml = codexPolicyYaml(source.name, policy, source.canonicalPayloadHash);
    const yamlPath = path.join(dir, "agents", "openai.yaml");
    if (yaml) {
      try {
        if (fs.readFileSync(yamlPath, "utf8") !== yaml) return false;
      } catch {
        return false;
      }
    } else if (fs.existsSync(yamlPath)) {
      return false;
    }
  }
  return true;
}

const skillOwnedBy = (name: string) => (dir: string) => {
  try {
    return hasSkillMarker(fs.readFileSync(path.join(dir, "SKILL.md"), "utf8"), name);
  } catch {
    return false;
  }
};
/** 복구 완전성 판정은 "marker만 있음"이 아니라 유효한 exact managed artifact여야 한다(R1-07.4). */
const skillCompleteFor = (name: string) => (dir: string) => isCompleteManagedSkill(dir, name);

// ── target root 준비/안전 ─────────────────────────────────────────────────

type RootPrep = { ok: true; guard: RootGuard } | { ok: false; unavailable?: string; problem?: string };

function prepareRoot(rootDir: string, parentDir: string, alwaysCreate: boolean, ops: FsOps): RootPrep {
  // runtime parent 안전 + **root 생성 전** 신원 포착(pre-mutation → 이후 교체/symlink 재지향 감지, R4-02)
  let parentStat: fs.Stats | null = null;
  try {
    parentStat = fs.lstatSync(parentDir);
  } catch {
    parentStat = null;
  }
  let parentId: string | null = null;
  if (parentStat) {
    if (parentStat.isSymbolicLink()) return { ok: false, problem: `runtime 부모가 심볼릭 링크입니다: ${parentDir}` };
    if (!parentStat.isDirectory()) return { ok: false, problem: `runtime 부모가 폴더가 아닙니다: ${parentDir}` };
    parentId = `${parentStat.dev}:${parentStat.ino}`;
  } else if (!alwaysCreate) {
    return { ok: false, unavailable: `${parentDir} 폴더가 없습니다` };
  }
  // target root 안전
  try {
    const st = fs.lstatSync(rootDir);
    if (st.isSymbolicLink()) return { ok: false, problem: `target root가 심볼릭 링크입니다: ${rootDir}` };
    if (!st.isDirectory()) return { ok: false, problem: `target root가 폴더가 아닙니다: ${rootDir}` };
  } catch {
    try {
      ops.mkdir(rootDir);
    } catch (err) {
      return { ok: false, problem: `target root 생성 실패: ${(err as Error).message}` };
    }
  }
  // 부모가 없던(alwaysCreate) 경우엔 생성 이후 신원을 포착한다(이때는 사전 존재 공격이 없음).
  if (parentId === null) {
    parentId = realDirIdentity(parentDir);
    if (parentId === null) return { ok: false, problem: `runtime 부모를 실제 폴더로 확정할 수 없습니다: ${parentDir}` };
  }
  const rootId = realDirIdentity(rootDir);
  if (rootId === null) return { ok: false, problem: `target root를 실제 폴더로 확정할 수 없습니다: ${rootDir}` };
  return { ok: true, guard: { rootDir, parentDir, parentId, rootId } };
}

// ── 분류 ─────────────────────────────────────────────────────────────────

interface Deployable {
  source: SkillPackage;
  policy?: WorkflowPolicy;
}

interface Classified {
  deployables: Deployable[]; // 정상 배포(managed packaged 또는 custom)
  reservedForks: string[]; // 예약 ID인데 non-equivalent/markerless — fail-closed
}

function classify(dataReg: { skills: SkillPackage[]; problems: SkillProblem[] }, templates: SkillPackage[], reservedIds: Set<string>): Classified {
  const byName = new Map(templates.map((t) => [t.name, t]));
  const deployables: Deployable[] = [];
  const reservedForks: string[] = [];
  const seenReserved = new Set<string>();
  for (const s of dataReg.skills) {
    // 예약 이름은 manifest가 정한다 — template skill이 검증 실패해도(byName 부재) 예약 보호를
    // 유지한다. 이 경우 equivalent 판정 근거가 없으므로 fail-closed(reserved fork)로 처리한다.
    if (reservedIds.has(s.name)) {
      seenReserved.add(s.name);
      const tpl = byName.get(s.name);
      const equivalent = !!tpl && s.managedSource && s.canonicalPayloadHash === tpl.canonicalPayloadHash;
      if (equivalent) deployables.push({ source: s, policy: tpl!.policy });
      else reservedForks.push(s.name);
    } else {
      deployables.push({ source: s }); // custom(markerless면 marker 주입)
    }
  }
  // invalid/unverifiable reserved source(문제로 격리돼 skills에 없지만 이름은 예약) — 오래된 mutating
  // runtime asset을 남기지 않도록 fail-closed retire 대상으로 다룬다(R1-06). unmanaged collision은 보존.
  for (const p of dataReg.problems) {
    if (reservedIds.has(p.nameOrPath) && !seenReserved.has(p.nameOrPath)) {
      seenReserved.add(p.nameOrPath);
      reservedForks.push(p.nameOrPath);
    }
  }
  return { deployables, reservedForks };
}

// ── skill-directory target 배포 ────────────────────────────────────────────

interface TargetDeployOutcomeFlags {
  problem: boolean;
  partial: boolean;
}

function deploySkillDirTarget(
  targetId: "claude-skill" | "agent-skill",
  rootDir: string,
  parentDir: string,
  cls: Classified,
  pruneSuppressed: boolean,
  ops: FsOps,
  flags: TargetDeployOutcomeFlags,
  explicitOverride: boolean,
  workspace?: WorkspaceContext,
): WorkflowSyncItem[] {
  const items: WorkflowSyncItem[] = [];
  const kind = "skill-directory" as const;
  const invOf = (id: string) => (targetId === "claude-skill" ? invocationsFor(id).claude : invocationsFor(id).codex);

  // 공용 target은 명시 deploy에서 항상 생성. Claude는 명시 경로 override가 있으면 생성 허가(R1-13).
  const alwaysCreate = targetId === "agent-skill" || explicitOverride;
  const prep = prepareRoot(rootDir, parentDir, alwaysCreate, ops);
  if (!prep.ok) {
    if (prep.problem) {
      flags.problem = true;
      for (const d of cls.deployables) items.push({ logicalId: d.source.name, target: targetId, artifactKind: kind, status: "problem", reason: prep.problem, invocation: invOf(d.source.name) });
      return items;
    }
    flags.partial = true;
    for (const d of cls.deployables) items.push({ logicalId: d.source.name, target: targetId, artifactKind: kind, status: "skipped-unavailable", reason: prep.unavailable, invocation: invOf(d.source.name) });
    return items;
  }

  const deployNames = new Set(cls.deployables.map((d) => d.source.name));
  const reservedSet = new Set(cls.reservedForks);
  // R4-02: prepareRoot가 포착한 parent/root 신원을 모든 mutation 직전에 재검한다.
  const guard = () => revalidateRootGuard(prep.guard);

  // 고아 복구 — 단, reserved fork 이름은 복구로 재노출하지 않는다(곧 fail-closed retire, R1-07.5).
  for (const name of orphanNames(rootDir)) {
    if (reservedSet.has(name)) continue;
    const rec = recoverManagedDirectory({ parent: rootDir, name, ownedBy: skillOwnedBy(name), isComplete: skillCompleteFor(name), ops, guard });
    if (rec && rec.status !== "unchanged") {
      if (rec.status === "problem") flags.problem = true;
      items.push({ logicalId: name, target: targetId, artifactKind: kind, status: rec.status, reason: rec.reason, invocation: invOf(name) });
    }
  }

  // 정상 배포
  for (const d of cls.deployables) {
    const r = replaceManagedDirectory({
      parent: rootDir,
      name: d.source.name,
      ownedBy: skillOwnedBy(d.source.name),
      isUpToDate: (dir) => targetUpToDate(dir, d.source, targetId, d.policy),
      render: (stageDir, o) => renderTargetInto(d.source, targetId, d.policy, stageDir, o),
      ops,
      guard,
    });
    if (r.status === "problem") flags.problem = true;
    if (r.status === "skipped-unmanaged") flags.partial = true;
    const item: WorkflowSyncItem = { logicalId: d.source.name, target: targetId, artifactKind: kind, status: r.status, reason: r.reason, invocation: invOf(d.source.name) };
    // packaged workflow(정책 존재)에만 enforcement를 붙인다 — custom/비-explicit은 라벨하지 않는다(R1-14).
    if (d.policy) item.enforcement = enforcementFor(targetId, d.policy);
    // Codex는 workspace repo `.agents/skills/<name>`가 user skill을 shadow할 수 있다(agent-skill 한정).
    // exact target validator(생성 deny-implicit policy/fingerprint 포함)로 판정한다 — payload hash만
    // 같고 openai.yaml이 빠진 산출물을 equivalent로 오인하지 않는다(R1-11).
    if (targetId === "agent-skill" && workspace) {
      const res = resolveCodexRepoSkill(d.source.name, workspace, (dir) => targetUpToDate(dir, d.source, "agent-skill", d.policy));
      item.resolution = res;
      if (res === "ambiguous-shadow" || res === "unmanaged-shadow") flags.partial = true;
    }
    items.push(item);
  }

  // 예약 ID fork: fail-closed retire(배포하지 않음)
  for (const name of cls.reservedForks) {
    const pr = pruneManagedDirectory({ parent: rootDir, name, ownedBy: skillOwnedBy(name), ops, guard });
    flags.partial = true;
    if (pr.status === "pruned") items.push({ logicalId: name, target: targetId, artifactKind: kind, status: "pruned", reason: RESERVED_FORK_REASON, invocation: invOf(name) });
    else if (pr.status === "skipped-unmanaged") items.push({ logicalId: name, target: targetId, artifactKind: kind, status: "skipped-unmanaged", reason: "예약 ID 동명 unmanaged 자산 보존", invocation: invOf(name) });
    else if (pr.status === "problem") {
      flags.problem = true;
      items.push({ logicalId: name, target: targetId, artifactKind: kind, status: "problem", reason: pr.reason, invocation: invOf(name) });
    } else items.push({ logicalId: name, target: targetId, artifactKind: kind, status: "skipped-dependency", reason: RESERVED_FORK_REASON, invocation: invOf(name) });
  }

  // source-absence prune(검증 clean일 때만)
  if (!pruneSuppressed) {
    for (const entry of managedDirNames(rootDir)) {
      if (deployNames.has(entry) || reservedSet.has(entry)) continue;
      const pr = pruneManagedDirectory({ parent: rootDir, name: entry, ownedBy: skillOwnedBy(entry), ops, guard });
      if (pr.status === "pruned") items.push({ logicalId: entry, target: targetId, artifactKind: kind, status: "pruned", reason: "정본에서 삭제됨", invocation: invOf(entry) });
      else if (pr.status === "problem") {
        flags.problem = true;
        items.push({ logicalId: entry, target: targetId, artifactKind: kind, status: "problem", reason: pr.reason, invocation: invOf(entry) });
      }
    }
  }
  return items;
}

/** target 폴더의 visible managed skill 디렉토리 이름들. */
function managedDirNames(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && skillOwnedBy(e.name)(path.join(dir, e.name)))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/** 고아 hidden 항목에서 <name>을 추출한다(.localmind-{stage,backup,retired}-<name>-<nonce>). */
function orphanNames(dir: string): string[] {
  const names = new Set<string>();
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  for (const e of entries) {
    const m = /^\.localmind-(?:stage|backup|retired)-(.+)-[0-9a-f]+$/.exec(e);
    if (m) names.add(m[1]);
  }
  return [...names];
}

// ── seed(templates → data) ───────────────────────────────────────────────

export interface SeedResult {
  items: WorkflowSyncItem[];
  problems: SkillProblem[];
}

/** 두 skill 디렉토리의 regular file 집합·내용·실행 비트가 같은가(seed 멱등 판정, R1-05). */
function dirsByteEqual(a: string, b: string): boolean {
  const insA = inspectSkillDir(a);
  const insB = inspectSkillDir(b);
  if ("error" in insA || "error" in insB) return false;
  if (insA.files.length !== insB.files.length || insA.files.some((f, i) => f !== insB.files[i])) return false;
  if (insA.executable.length !== insB.executable.length || insA.executable.some((f, i) => f !== insB.executable[i])) return false;
  return insA.files.every((f) => {
    try {
      return fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(path.join(b, f)));
    } catch {
      return false;
    }
  });
}

/** 패키지 동봉 정본(templates/skills) → 데이터 폴더 정본. prune 없음(사용자 fork 보존). */
export function seedWorkflows(opts: { templatesDir?: string; skillsDir?: string; ops?: FsOps } = {}): SeedResult {
  const templatesDir = opts.templatesDir ?? TEMPLATES_DIR;
  const dataDir = opts.skillsDir ?? skillsDir();
  const ops = opts.ops;
  const templateReg = loadSkillRegistry(templatesDir, { packaged: true });
  if (templateReg.problems.length > 0) {
    return { items: [], problems: templateReg.problems }; // 패키지 정본 문제 → data에 쓰지 않음
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const items: WorkflowSyncItem[] = [];
  for (const tpl of templateReg.skills) {
    const templateSkillDir = tpl.root;
    // 고아 복구 먼저
    const rec = recoverManagedDirectory({ parent: dataDir, name: tpl.name, ownedBy: skillOwnedBy(tpl.name), isComplete: skillCompleteFor(tpl.name), ops });
    if (rec && rec.status !== "unchanged") {
      items.push({ logicalId: tpl.name, target: "canonical-seed", artifactKind: "skill-directory", status: rec.status, reason: rec.reason });
    }
    const r = replaceManagedDirectory({
      parent: dataDir,
      name: tpl.name,
      ownedBy: skillOwnedBy(tpl.name),
      isUpToDate: (dir) => dirsByteEqual(dir, templateSkillDir),
      render: (stageDir, o) => renderVerbatimInto(tpl, stageDir, o),
      ops,
    });
    items.push({ logicalId: tpl.name, target: "canonical-seed", artifactKind: "skill-directory", status: r.status, reason: r.reason });
  }

  // source-absence 정리(D-2①): 이 지점은 위 registry-clean 조기 반환 아래에서만 실행된다(F-18) —
  // template 집합에 없는 이름의 managed(마커 결합) 디렉토리를 은퇴시킨다. 이름 무관(generic),
  // unmanaged(마커 없음)는 managedDirNames가 애초에 걸러 보존한다(I-3).
  const templateNames = new Set(templateReg.skills.map((t) => t.name));
  for (const entry of managedDirNames(dataDir)) {
    if (templateNames.has(entry)) continue;
    const pr = pruneManagedDirectory({ parent: dataDir, name: entry, ownedBy: skillOwnedBy(entry), ops });
    if (pr.status === "pruned") {
      items.push({ logicalId: entry, target: "canonical-seed", artifactKind: "skill-directory", status: "pruned", reason: "packaged 정본에서 은퇴됨" });
    } else if (pr.status === "problem") {
      items.push({ logicalId: entry, target: "canonical-seed", artifactKind: "skill-directory", status: "problem", reason: pr.reason });
    }
  }
  return { items, problems: [] };
}

/** template 파일을 verbatim으로 stage에 복사한다(marker는 template에 이미 포함). */
function renderVerbatimInto(tpl: SkillPackage, stageDir: string, ops: FsOps): void {
  for (const rel of tpl.files) {
    const dest = path.join(stageDir, rel);
    ops.mkdir(path.dirname(dest));
    const mode = fs.statSync(path.join(tpl.root, rel)).mode & 0o777;
    ops.copyFile(path.join(tpl.root, rel), dest, mode);
  }
}

// ── deploy(data → 모든 target) ─────────────────────────────────────────────

export interface DeployOptions {
  templatesDir?: string;
  skillsDir?: string;
  claudeSkillsDir?: string;
  agentSkillsDir?: string;
  geminiCommandsDir?: string;
  targets?: WorkflowTargetId[];
  workspace?: WorkspaceContext;
  ops?: FsOps;
}

export function deployWorkflows(opts: DeployOptions = {}): WorkflowDeployResult {
  const templatesDir = opts.templatesDir ?? TEMPLATES_DIR;
  const dataDir = opts.skillsDir ?? skillsDir();
  const ops = opts.ops ?? undefined;
  const enabled = new Set(opts.targets ?? (["claude-skill", "agent-skill", "gemini-command"] as WorkflowTargetId[]));

  const templateReg = loadSkillRegistry(templatesDir, { packaged: true });
  const dataReg = loadSkillRegistry(dataDir);

  // R4-01: packaged registry/catalog/schema/binding 문제는 **전역 신뢰 실패**다. 손상된 package에서는
  // 안전한 예약 집합도 activation 정책도 증명할 수 없으므로(빈 예약 집합을 추론하거나 packaged ID를
  // custom으로 강등해선 안 된다), 어떤 runtime write(prepareRoot·복구·분류 배포·prune·command 생성)도
  // 하기 전에 즉시 실패로 반환한다. 기존 runtime 자산은 그대로 보존된다. data-source 문제는 여기서
  // gate하지 않고 아래 per-item/prune-suppression 경로로 흐른다.
  if (templateReg.problems.length > 0) {
    return {
      outcome: "failed",
      exitCode: 1,
      pruneSuppressed: true,
      items: [],
      sourceProblems: [...templateReg.problems, ...dataReg.problems],
    };
  }

  const manifestRes = loadManifest(path.join(templatesDir, "catalog.json"));
  const reservedIds = "manifest" in manifestRes ? new Set(Object.keys(manifestRes.manifest.workflows)) : new Set<string>();

  const sourceProblems: SkillProblem[] = [...templateReg.problems, ...dataReg.problems];
  const pruneSuppressed = sourceProblems.length > 0;

  const cls = classify(dataReg, templateReg.skills, reservedIds);
  const items: WorkflowSyncItem[] = [];
  const flags: TargetDeployOutcomeFlags = { problem: sourceProblems.length > 0, partial: false };

  // 명시 경로 override(option 또는 env)는 부모 부재여도 실제 폴더 생성을 허가한다(R1-13).
  const claudeExplicit = opts.claudeSkillsDir !== undefined || !!process.env.LOCALMIND_CLAUDE_SKILLS_DIR?.trim();
  const agentExplicit = opts.agentSkillsDir !== undefined || !!process.env.LOCALMIND_AGENT_SKILLS_DIR?.trim();

  if (enabled.has("claude-skill")) {
    const root = opts.claudeSkillsDir ?? claudeSkillsDir();
    items.push(...deploySkillDirTarget("claude-skill", root, path.dirname(root), cls, pruneSuppressed, ops ?? defaultFsOps, flags, claudeExplicit));
  }
  if (enabled.has("agent-skill")) {
    const root = opts.agentSkillsDir ?? agentSkillsDir();
    items.push(...deploySkillDirTarget("agent-skill", root, path.dirname(root), cls, pruneSuppressed, ops ?? defaultFsOps, flags, agentExplicit, opts.workspace));
  }
  if (enabled.has("gemini-command")) {
    items.push(...deployGeminiTarget(opts, templateReg.skills, cls, reservedIds, dataReg, flags, pruneSuppressed));
  }

  // 집계
  let outcome: WorkflowDeployResult["outcome"];
  if (flags.problem) outcome = "failed";
  else if (flags.partial) outcome = "partial";
  else outcome = "success";
  const exitCode: 0 | 1 = flags.problem ? 1 : 0;
  return { outcome, exitCode, pruneSuppressed, items, sourceProblems };
}

function deployGeminiTarget(
  opts: DeployOptions,
  templates: SkillPackage[],
  cls: Classified,
  reservedIds: Set<string>,
  dataReg: { skills: SkillPackage[] },
  flags: TargetDeployOutcomeFlags,
  pruneSuppressed: boolean,
): WorkflowSyncItem[] {
  const root = opts.geminiCommandsDir ?? geminiCommandsDir();
  const parent = path.dirname(root);
  const ops = opts.ops ?? defaultFsOps;
  // 명시 경로 override(option/env)는 부모 부재여도 생성을 허가한다(R1-13).
  const geminiExplicit = opts.geminiCommandsDir !== undefined || !!process.env.LOCALMIND_GEMINI_COMMANDS_DIR?.trim();
  const prep = prepareRoot(root, parent, geminiExplicit, ops);
  const available = prep.ok;
  const dataByName = new Map(dataReg.skills.map((s) => [s.name, s]));
  const templateByName = new Map(templates.map((t) => [t.name, t]));

  if (prep.ok === false && prep.problem) {
    flags.problem = true;
    return templates.map((t) => ({ logicalId: t.name, target: "gemini-command", artifactKind: "command-file", status: "problem", reason: prep.problem, invocation: `/${t.name}` }));
  }

  const eligible = (id: string): boolean => {
    const d = dataByName.get(id);
    const t = templateByName.get(id);
    return !!d && !!t && d.managedSource && d.canonicalPayloadHash === t.canonicalPayloadHash;
  };
  const ineligibleReason = (id: string): string => {
    const d = dataByName.get(id);
    if (!d) return "source-non-equivalent: 데이터 정본이 없습니다";
    if (reservedIds.has(id)) return RESERVED_FORK_REASON;
    return "source-non-equivalent: 정본과 다릅니다";
  };

  // R4-02: prepareRoot가 포착한 신원을 command mutation 직전에 재검한다(중간 경로 symlink 재지향 차단).
  const guard = prep.ok ? () => revalidateRootGuard(prep.guard) : undefined;
  const gitems: GeminiSyncItem[] = syncGeminiCommands({
    templates,
    eligible,
    ineligibleReason,
    commandsDir: root,
    available,
    pruneSuppressed,
    ops: opts.ops,
    workspace: opts.workspace,
    guard,
  });

  const items: WorkflowSyncItem[] = [];
  for (const g of gitems) {
    if (g.status === "problem") flags.problem = true;
    if (g.status === "skipped-unavailable" || g.status === "skipped-unmanaged" || g.status === "skipped-dependency" || (g.status === "pruned" && g.reason === RESERVED_FORK_REASON)) {
      flags.partial = true;
    }
    // workspace shadow/ambiguity는 user-level install을 arbitrary-workspace parity로 볼 수 없음 → partial
    if (g.resolution === "unmanaged-shadow" || g.resolution === "ambiguous-shadow" || g.skillShadowUnverified) {
      flags.partial = true;
    }
    let reason = g.reason;
    if (g.skillShadowUnverified) reason = `${reason ? reason + "; " : ""}workspace skill shadow: auto-activation parity 미검증`;
    const gPolicy = templateByName.get(g.logicalId)?.policy;
    items.push({
      logicalId: g.logicalId,
      target: "gemini-command",
      artifactKind: "command-file",
      status: g.status,
      invocation: invocationsFor(g.logicalId).gemini,
      reason,
      resolution: g.resolution,
      enforcement: gPolicy ? enforcementFor("gemini-command", gPolicy) : undefined,
    });
  }
  return items;
}

// ── seed + deploy 통합 CLI 진입 ────────────────────────────────────────────

export interface RunResult {
  seed: SeedResult;
  deploy: WorkflowDeployResult;
}

export function runSkillsDeploy(opts: DeployOptions = {}): RunResult {
  const seed = seedWorkflows({ templatesDir: opts.templatesDir, skillsDir: opts.skillsDir, ops: opts.ops });
  const deploy = deployWorkflows(opts);
  // seed 문제(problems 또는 item status "problem" — 파일시스템 실패 포함)는 통합 결과를
  // failed/exit 1로 만든다. 성공한 다른 작업은 유지하되 실패를 success로 숨기지 않는다(R1-05).
  const seedItemProblems = seed.items.filter((i) => i.status === "problem");
  if (seed.problems.length > 0 || seedItemProblems.length > 0) {
    deploy.sourceProblems.push(...seed.problems);
    for (const it of seedItemProblems) {
      deploy.sourceProblems.push({ nameOrPath: `${it.logicalId} (정본 시드)`, reason: it.reason ?? "정본 시드 실패" });
    }
    deploy.outcome = "failed";
    deploy.exitCode = 1;
  }
  return { seed, deploy };
}

// ── 읽기 전용 카탈로그 (specs/048 FR-3) ────────────────────────────────────

/** SKILL.md의 name·description만 읽는 최소 프론트매터 파서. YAML 의존 없음(specs/010). */
function parseSkillFrontmatter(src: string): { name?: string; description?: string } {
  const normalized = src.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return {};
  const end = normalized.indexOf("\n---", 3);
  if (end < 0) return {};
  const head = normalized.slice(4, end);
  const fm: { name?: string; description?: string } = {};
  for (const rawLine of head.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim().replace(/^["']|["']$/g, "");
    if (key === "name") fm.name = value;
    else if (key === "description") fm.description = value;
  }
  return fm;
}

/** 소스 폴더의 스킬 디렉토리(SKILL.md 보유) 목록 — 관리 여부와 무관하게 전부 열거한다. */
function listSkillDirs(root: string): string[] {
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && fs.existsSync(path.join(root, e.name, "SKILL.md")))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export interface SkillCatalogItem {
  /** 디렉토리명(= 전문 조회 시 skillContent의 name 파라미터 키) */
  name: string;
  description: string;
  managed: boolean;
  /** skillsDir 기준 상대경로 — 문제 보고·표시용 */
  file: string;
}

/** 스킬 카탈로그(read-only) — skillsDir() 하위 SKILL.md 보유 디렉토리를 열거한다.
 *  name은 디렉토리명(전문 조회 시 경로 구성의 키가 되므로 frontmatter name과 무관하게
 *  디렉토리명을 정본으로 삼는다 — RuleDoc의 basename 폴백과 같은 결). */
export function listSkills(dir: string = skillsDir()): SkillCatalogItem[] {
  const items: SkillCatalogItem[] = [];
  for (const name of listSkillDirs(dir)) {
    const file = path.join(name, "SKILL.md");
    let src: string;
    try {
      src = fs.readFileSync(path.join(dir, file), "utf8");
    } catch {
      continue;
    }
    const fm = parseSkillFrontmatter(src);
    items.push({
      name,
      description: fm.description ?? "",
      managed: skillOwnedBy(name)(path.join(dir, name)),
      file,
    });
  }
  return items;
}

// ── 결과 요약(비개발자 한국어) ─────────────────────────────────────────────

const STATUS_LABEL: Record<WorkflowStatus, string> = {
  created: "생성됨",
  updated: "갱신됨",
  unchanged: "변경 없음",
  pruned: "정리됨",
  recovered: "복구됨",
  "skipped-unmanaged": "건너뜀(직접 만든 자산 보호)",
  "skipped-unavailable": "건너뜀(런타임 미설치)",
  "skipped-dependency": "건너뜀(의존 조건 미충족)",
  problem: "문제",
};

const TARGET_LABEL: Record<WorkflowTargetId, string> = {
  "canonical-seed": "정본 시드",
  "claude-skill": "Claude Code 스킬",
  "agent-skill": "공용(.agents) 스킬",
  "gemini-command": "Gemini 명령",
};

const ENFORCEMENT_LABEL: Record<EnforcementLevel, string> = {
  "runtime-enforced": "런타임 강제(runtime-enforced)",
  "instruction-level": "지침 수준(instruction-level)",
  "not-applicable": "해당 없음",
};

export function formatSeedResult(seed: SeedResult): string {
  const lines = ["정본 시드(templates → 데이터 폴더):"];
  if (seed.problems.length) {
    for (const p of seed.problems) lines.push(`  문제: ${p.nameOrPath} — ${p.reason}`);
    return lines.join("\n");
  }
  for (const it of seed.items) lines.push(`  ${it.logicalId}: ${STATUS_LABEL[it.status]}${it.reason ? ` (${it.reason})` : ""}`);
  return lines.join("\n");
}

export function formatDeployResult(r: WorkflowDeployResult): string {
  const lines: string[] = [];
  const outLabel = { success: "성공", partial: "부분 성공", failed: "실패" }[r.outcome];
  lines.push(`배포 결과: ${outLabel} (exit ${r.exitCode})`);
  for (const p of r.sourceProblems) lines.push(`  정본 문제: ${p.nameOrPath} — ${p.reason}`);
  if (r.pruneSuppressed) lines.push("  정본 문제가 있어 정리(prune)는 보류했습니다.");
  const byTarget = new Map<WorkflowTargetId, WorkflowSyncItem[]>();
  for (const it of r.items) byTarget.set(it.target, [...(byTarget.get(it.target) ?? []), it]);
  for (const [target, list] of byTarget) {
    lines.push(`  [${TARGET_LABEL[target]}]`);
    for (const it of list) {
      const inv = it.invocation ? ` 호출: ${it.invocation}` : "";
      const res = it.resolution ? ` 해석: ${it.resolution}` : "";
      const enf = it.enforcement && it.enforcement !== "not-applicable" ? ` 활성화 강제: ${ENFORCEMENT_LABEL[it.enforcement]}` : "";
      const reason = it.reason ? ` — ${it.reason}` : "";
      lines.push(`    ${it.logicalId}: ${STATUS_LABEL[it.status]}${reason}.${inv}${res}${enf}`);
    }
  }
  return lines.join("\n");
}
