/**
 * reconcile.ts 테스트 — rollback 가능한 swap과 고아 복구의 fault injection
 * (AC-13 directory, AC-20 file). production과 같은 control flow에 FsOps seam만 주입한다.
 *
 * R1 교정(round-1 adversarial review 반영):
 *  - R1-01: recovery는 target을 absent / managed-complete / present-other로 3분한다.
 *           present-other(unmanaged·incomplete·symlink·special)에는 rename/삭제 0회.
 *  - R1-04: cleanup 실패(backup/retired/recovery)는 success로 숨기지 않고 problem으로 올린다.
 *  - R1-07: 여러 backup/incomplete는 problem(삭제 0), 완성 stage는 결정적으로 승격, file recovery는
 *           isComplete로 truncated 복구를 막는다.
 *  - R1-08: 고아 이름은 정확히 매칭하고(접두 오귀속 금지), mutation 직전 parent/target identity를 재확인한다.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import {
  replaceManagedDirectory,
  recoverManagedDirectory,
  pruneManagedDirectory,
  replaceManagedFile,
  recoverManagedFile,
  pruneManagedFile,
  defaultFsOps,
  faultyOps,
} from "./reconcile.js";

let root: string;
let parent: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-reconcile-"));
  parent = path.join(root, "target-parent");
  fs.mkdirSync(parent, { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const MARKER = "managed-by: localmind (skill: demo)";
const skillContent = (tag: string) => `---\nname: demo\ndescription: d\n---\n<!-- ${MARKER} -->\n${tag}\n`;
const ownedBy = (dir: string) => {
  try {
    return fs.readFileSync(path.join(dir, "SKILL.md"), "utf8").includes(MARKER);
  } catch {
    return false;
  }
};
// 완성 판정: marker + 비어 있지 않은 본문(truncated/marker-only는 미완성)
const isComplete = (dir: string) => {
  try {
    const md = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8");
    return md.includes(MARKER) && md.replace(/<!--[^]*?-->/g, "").trim().length > 0;
  } catch {
    return false;
  }
};
const renderDir = (tag: string) => (stageDir: string, ops: ReturnType<typeof faultyOps> | typeof defaultFsOps) => {
  ops.writeFile(path.join(stageDir, "SKILL.md"), skillContent(tag));
};
const readTarget = (name = "demo") => fs.readFileSync(path.join(parent, name, "SKILL.md"), "utf8");
const listHidden = () => fs.readdirSync(parent).filter((n) => n.startsWith(".localmind-"));
const mkBackupDir = (name: string, nonce: string, tag: string) => {
  const b = path.join(parent, `.localmind-backup-${name}-${nonce}`);
  fs.mkdirSync(b);
  fs.writeFileSync(path.join(b, "SKILL.md"), skillContent(tag));
  return b;
};
const mkStageDir = (name: string, nonce: string, tag: string) => {
  const s = path.join(parent, `.localmind-stage-${name}-${nonce}`);
  fs.mkdirSync(s);
  fs.writeFileSync(path.join(s, "SKILL.md"), skillContent(tag));
  return s;
};

describe("workflow-swap-recovery: AC-13", () => {
  it("target 부재 → created", () => {
    const r = replaceManagedDirectory({ parent, name: "demo", ownedBy, isUpToDate: () => false, render: renderDir("v1") });
    assert.equal(r.status, "created");
    assert.match(readTarget(), /v1/);
    assert.equal(listHidden().length, 0, "고아 없음");
  });

  it("managed target 갱신 → updated(backup swap), 옛 내용 대체", () => {
    replaceManagedDirectory({ parent, name: "demo", ownedBy, isUpToDate: () => false, render: renderDir("v1") });
    const r = replaceManagedDirectory({ parent, name: "demo", ownedBy, isUpToDate: () => false, render: renderDir("v2") });
    assert.equal(r.status, "updated");
    assert.match(readTarget(), /v2/);
    assert.equal(listHidden().length, 0, "backup 정리됨");
  });

  it("isUpToDate이면 unchanged(쓰지 않음)", () => {
    replaceManagedDirectory({ parent, name: "demo", ownedBy, isUpToDate: () => false, render: renderDir("v1") });
    const r = replaceManagedDirectory({ parent, name: "demo", ownedBy, isUpToDate: () => true, render: renderDir("v2") });
    assert.equal(r.status, "unchanged");
    assert.match(readTarget(), /v1/, "갱신 안 됨");
  });

  it("동명 unmanaged 디렉토리는 skipped-unmanaged로 보존", () => {
    const dir = path.join(parent, "demo");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "SKILL.md"), "---\nname: demo\n---\n사용자 스킬\n");
    const r = replaceManagedDirectory({ parent, name: "demo", ownedBy, isUpToDate: () => false, render: renderDir("v2") });
    assert.equal(r.status, "skipped-unmanaged");
    assert.match(readTarget(), /사용자 스킬/, "불가침");
  });

  it("동명 파일(비디렉토리)은 skipped-unmanaged", () => {
    fs.writeFileSync(path.join(parent, "demo"), "파일");
    const r = replaceManagedDirectory({ parent, name: "demo", ownedBy, isUpToDate: () => false, render: renderDir("v2") });
    assert.equal(r.status, "skipped-unmanaged");
  });

  it("render 실패 → problem, 옛 target 보존, stage 정리", () => {
    replaceManagedDirectory({ parent, name: "demo", ownedBy, isUpToDate: () => false, render: renderDir("v1") });
    const ops = faultyOps(defaultFsOps, { writeFile: 1 });
    const r = replaceManagedDirectory({ parent, name: "demo", ownedBy, isUpToDate: () => false, render: renderDir("v2"), ops });
    assert.equal(r.status, "problem");
    assert.match(readTarget(), /v1/, "옛 내용 보존");
    assert.equal(listHidden().length, 0, "stage 정리됨");
  });

  it("target→backup rename 실패 → problem, 옛 target 보존", () => {
    replaceManagedDirectory({ parent, name: "demo", ownedBy, isUpToDate: () => false, render: renderDir("v1") });
    const ops = faultyOps(defaultFsOps, { rename: 1 });
    const r = replaceManagedDirectory({ parent, name: "demo", ownedBy, isUpToDate: () => false, render: renderDir("v2"), ops });
    assert.equal(r.status, "problem");
    assert.match(readTarget(), /v1/);
  });

  it("stage→target rename 실패 → problem, backup에서 옛 target 복구", () => {
    replaceManagedDirectory({ parent, name: "demo", ownedBy, isUpToDate: () => false, render: renderDir("v1") });
    const ops = faultyOps(defaultFsOps, { rename: 2 }); // 1=target→backup, 2=stage→target(실패), 3=backup→target(복구)
    const r = replaceManagedDirectory({ parent, name: "demo", ownedBy, isUpToDate: () => false, render: renderDir("v2"), ops });
    assert.equal(r.status, "problem");
    assert.match(readTarget(), /v1/, "옛 내용 복구됨");
  });

  // R1-04: cleanup 실패는 success로 숨기지 않는다.
  it("backup cleanup 실패 → problem(new 유지, 고아 backup 남음), 다음 recovery가 정리", () => {
    replaceManagedDirectory({ parent, name: "demo", ownedBy, isUpToDate: () => false, render: renderDir("v1") });
    const ops = faultyOps(defaultFsOps, { rm: 1 }); // backup cleanup만 실패
    const r = replaceManagedDirectory({ parent, name: "demo", ownedBy, isUpToDate: () => false, render: renderDir("v2"), ops });
    assert.equal(r.status, "problem", "AC-13: cleanup 실패는 problem/failed");
    assert.match(readTarget(), /v2/, "complete-new 유지");
    assert.ok(listHidden().some((n) => n.startsWith(".localmind-backup-demo-")), "고아 backup 남음");
    const rec = recoverManagedDirectory({ parent, name: "demo", ownedBy, isComplete });
    assert.equal(rec?.status, "recovered", "다음 recovery가 정리");
    assert.equal(listHidden().length, 0, "고아 정리됨");
    assert.match(readTarget(), /v2/, "target 유지");
  });

  it("recovery: target 부재 + 유효 backup 1개 → 복구", () => {
    mkBackupDir("demo", "abc123", "recovered-v");
    const rec = recoverManagedDirectory({ parent, name: "demo", ownedBy, isComplete });
    assert.equal(rec?.status, "recovered");
    assert.match(readTarget(), /recovered-v/);
  });

  it("recovery: 여러 backup(모호) → problem, 삭제 안 함", () => {
    mkBackupDir("demo", "a1b2c3", "x");
    mkBackupDir("demo", "d4e5f6", "y");
    const rec = recoverManagedDirectory({ parent, name: "demo", ownedBy, isComplete });
    assert.equal(rec?.status, "problem");
    assert.equal(listHidden().length, 2, "삭제하지 않음");
  });

  it("recovery: 고아 없으면 null", () => {
    assert.equal(recoverManagedDirectory({ parent, name: "demo", ownedBy, isComplete }), null);
  });

  it("prune: managed는 retire 후 삭제, unmanaged는 보존", () => {
    replaceManagedDirectory({ parent, name: "demo", ownedBy, isUpToDate: () => false, render: renderDir("v1") });
    const r = pruneManagedDirectory({ parent, name: "demo", ownedBy });
    assert.equal(r.status, "pruned");
    assert.ok(!fs.existsSync(path.join(parent, "demo")));
    assert.equal(listHidden().length, 0);

    const other = path.join(parent, "user-skill");
    fs.mkdirSync(other);
    fs.writeFileSync(path.join(other, "SKILL.md"), "---\nname: user-skill\n---\n내 것\n");
    const r2 = pruneManagedDirectory({ parent, name: "user-skill", ownedBy });
    assert.equal(r2.status, "skipped-unmanaged");
    assert.ok(fs.existsSync(path.join(other, "SKILL.md")));
  });

  // R1-04: retired cleanup 실패도 problem.
  it("prune: retire 후 cleanup 실패 → problem(visible name 제거, retired 고아 남음), 다음 recovery가 정리", () => {
    replaceManagedDirectory({ parent, name: "demo", ownedBy, isUpToDate: () => false, render: renderDir("v1") });
    const ops = faultyOps(defaultFsOps, { rm: 1 }); // retired cleanup 실패
    const r = pruneManagedDirectory({ parent, name: "demo", ownedBy, ops });
    assert.equal(r.status, "problem", "AC-13: retired cleanup 실패는 problem");
    assert.ok(!fs.existsSync(path.join(parent, "demo")), "visible name은 제거됨(fail-closed)");
    assert.ok(listHidden().some((n) => n.startsWith(".localmind-retired-demo-")));
    // 다음 recovery(retired 정리)
    const rec = recoverManagedDirectory({ parent, name: "demo", ownedBy, isComplete });
    assert.ok(rec === null || rec.status === "recovered");
    assert.equal(listHidden().length, 0);
  });

  it("parent가 symlink이면 problem(실제 폴더 요구)", () => {
    const realParent = path.join(root, "real-parent");
    fs.mkdirSync(realParent);
    const linkParent = path.join(root, "link-parent");
    fs.symlinkSync(realParent, linkParent);
    const r = replaceManagedDirectory({ parent: linkParent, name: "demo", ownedBy, isUpToDate: () => false, render: renderDir("v1") });
    assert.equal(r.status, "problem");
    assert.match(r.reason!, /심볼릭 링크/);
  });
});

// ── R1-01: recovery는 present/unmanaged target을 덮어쓰지 않는다 ────────────────
describe("recovery target trichotomy (R1-01)", () => {
  it("dir recovery: target이 unmanaged로 존재 + backup 1개 → problem(덮어쓰기 0)", () => {
    const t = path.join(parent, "demo");
    fs.mkdirSync(t);
    const userMd = "---\nname: demo\n---\n사용자 소유 디렉토리\n";
    fs.writeFileSync(path.join(t, "SKILL.md"), userMd);
    mkBackupDir("demo", "aa11bb", "backup-내용");
    const rec = recoverManagedDirectory({ parent, name: "demo", ownedBy, isComplete });
    assert.equal(rec?.status, "problem", "present-other target은 복구로 덮어쓰지 않는다");
    assert.equal(readTarget(), userMd, "사용자 파일 보존");
    assert.ok(listHidden().some((n) => n.startsWith(".localmind-backup-demo-")), "backup 미삭제");
  });

  it("dir recovery: target이 incomplete managed(marker만) + backup 1개 → problem", () => {
    const t = path.join(parent, "demo");
    fs.mkdirSync(t);
    fs.writeFileSync(path.join(t, "SKILL.md"), `<!-- ${MARKER} -->\n`); // marker만, 본문 없음 → incomplete
    mkBackupDir("demo", "cc22dd", "backup-내용");
    const rec = recoverManagedDirectory({ parent, name: "demo", ownedBy, isComplete });
    assert.equal(rec?.status, "problem", "incomplete managed target도 present-other로 취급");
  });

  it("dir recovery: target이 symlink + backup 1개 → problem", () => {
    const elsewhere = path.join(root, "elsewhere-dir");
    fs.mkdirSync(elsewhere);
    fs.symlinkSync(elsewhere, path.join(parent, "demo"));
    mkBackupDir("demo", "ee33ff", "backup-내용");
    const rec = recoverManagedDirectory({ parent, name: "demo", ownedBy, isComplete });
    assert.equal(rec?.status, "problem");
    assert.ok(fs.lstatSync(path.join(parent, "demo")).isSymbolicLink(), "symlink 보존");
  });

  it("file recovery: target이 unmanaged로 존재 + backup 1개 → problem(사용자 파일 보존)", () => {
    const t = path.join(parent, "demo.toml");
    const userContent = 'prompt = "user-owned"\n';
    fs.writeFileSync(t, userContent);
    const backup = path.join(parent, ".localmind-backup-demo.toml-abc999");
    fs.writeFileSync(backup, "# managed-by: localmind (command: demo)\nprompt = \"old-managed\"\n");
    const rec = recoverManagedFile({ parent, fileName: "demo.toml", ownedBy: cmdOwned, isComplete: cmdComplete });
    assert.equal(rec?.status, "problem", "R1-01: 사용자 파일을 rename으로 덮어쓰지 않는다");
    assert.equal(fs.readFileSync(t, "utf8"), userContent, "사용자 파일 byte 보존");
  });
});

// ── R1-07: orphan state machine ───────────────────────────────────────────────
describe("orphan state machine (R1-07)", () => {
  it("complete target + 여러 valid backup → problem, 삭제 0", () => {
    replaceManagedDirectory({ parent, name: "demo", ownedBy, isUpToDate: () => false, render: renderDir("live") });
    mkBackupDir("demo", "111aaa", "b1");
    mkBackupDir("demo", "222bbb", "b2");
    const rec = recoverManagedDirectory({ parent, name: "demo", ownedBy, isComplete });
    assert.equal(rec?.status, "problem", "여러 backup은 target이 있어도 모호 → problem");
    assert.equal(listHidden().filter((n) => n.startsWith(".localmind-backup-demo-")).length, 2, "삭제 0");
  });

  it("retired 정리 실패 + backup 복구 동시(target 부재) → problem(복구는 하되 실패 표면화)", () => {
    // retired 고아(정리 실패) + 유효 backup + target 부재 — R1-04: cleanup 실패를 success로 숨기지 않는다.
    const retired = path.join(parent, ".localmind-retired-demo-aa11bb22cc33");
    fs.mkdirSync(retired);
    fs.writeFileSync(path.join(retired, "SKILL.md"), skillContent("retired-old"));
    mkBackupDir("demo", "dd44ee55ff66", "backup-v");
    const ops = faultyOps(defaultFsOps, { rm: 1 }); // retired cleanup 실패
    const rec = recoverManagedDirectory({ parent, name: "demo", ownedBy, isComplete, ops });
    assert.equal(rec?.status, "problem", "retired cleanup 실패를 recovered로 숨기지 않는다");
    assert.match(readTarget(), /backup-v/, "backup 복구는 수행");
  });

  it("완성 stage만(target 부재) → 승격(recovered)", () => {
    mkStageDir("demo", "abc123", "promoted");
    const rec = recoverManagedDirectory({ parent, name: "demo", ownedBy, isComplete });
    assert.equal(rec?.status, "recovered", "완성 stage는 결정적으로 승격");
    assert.match(readTarget(), /promoted/);
    assert.equal(listHidden().length, 0);
  });

  it("incomplete stage(target 부재) → problem, 삭제 0", () => {
    const s = path.join(parent, ".localmind-stage-demo-deadbe");
    fs.mkdirSync(s);
    fs.writeFileSync(path.join(s, "SKILL.md"), `<!-- ${MARKER} -->\n`); // 본문 없음 → incomplete
    const rec = recoverManagedDirectory({ parent, name: "demo", ownedBy, isComplete });
    assert.equal(rec?.status, "problem");
    assert.equal(listHidden().length, 1, "삭제 0");
  });

  it("stage + backup 동시(target 부재) → problem(모호), 삭제 0", () => {
    mkStageDir("demo", "aaa111", "stage-v");
    mkBackupDir("demo", "bbb222", "backup-v");
    const rec = recoverManagedDirectory({ parent, name: "demo", ownedBy, isComplete });
    assert.equal(rec?.status, "problem");
    assert.equal(listHidden().length, 2);
  });

  it("file recovery는 truncated(incomplete) backup을 복구하지 않는다(problem)", () => {
    // marker는 있지만 prompt가 잘린 wrapper — marker 존재만으로 복구하면 안 됨(R1-07)
    const backup = path.join(parent, ".localmind-backup-demo.toml-77aa88");
    fs.writeFileSync(backup, "# managed-by: localmind (command: demo)\n# source-payload-sha256: dead\ndescription = \"x\"\nprompt = \"미완"); // 닫는 따옴표 없음
    const rec = recoverManagedFile({ parent, fileName: "demo.toml", ownedBy: cmdOwned, isComplete: cmdComplete });
    assert.equal(rec?.status, "problem", "truncated backup은 유효 backup이 아니다");
    assert.ok(!fs.existsSync(path.join(parent, "demo.toml")), "truncated를 target으로 복구하지 않음");
  });
});

// ── R1-08: 정확한 고아 이름 매칭 + identity 가드 ───────────────────────────────
describe("exact orphan matching + identity guard (R1-08)", () => {
  it("접두 이름 오귀속 금지: 'demo'는 'demo-extra'의 고아를 보지 않는다", () => {
    // demo-extra 의 backup 하나만 존재. name='demo' 복구는 이를 자기 것으로 오인하면 안 됨.
    mkBackupDir("demo-extra", "abcdef", "다른 스킬 backup");
    const rec = recoverManagedDirectory({ parent, name: "demo", ownedBy, isComplete });
    assert.equal(rec, null, "다른 이름의 고아를 자기 것으로 매칭하지 않는다");
    assert.ok(fs.existsSync(path.join(parent, ".localmind-backup-demo-extra-abcdef")), "타 스킬 고아 미삭제");
  });

  it("접두 이름 오귀속 금지: 'demo-extra' 복구는 'demo'의 고아를 보지 않는다", () => {
    mkBackupDir("demo", "abcdef", "demo backup");
    const rec = recoverManagedDirectory({ parent, name: "demo-extra", ownedBy, isComplete });
    assert.equal(rec, null);
  });

  it("prune: rename 직전 target이 unmanaged로 바뀌면 problem(불가침)", () => {
    replaceManagedDirectory({ parent, name: "demo", ownedBy, isUpToDate: () => false, render: renderDir("v1") });
    // beforeMutate 훅으로 검증-후 rename-전 사이에 target을 unmanaged로 교체(race 시뮬레이션)
    const beforeMutate = () => {
      fs.rmSync(path.join(parent, "demo"), { recursive: true, force: true });
      fs.mkdirSync(path.join(parent, "demo"));
      fs.writeFileSync(path.join(parent, "demo", "SKILL.md"), "---\nname: demo\n---\n갑자기 사용자 것\n");
    };
    const r = pruneManagedDirectory({ parent, name: "demo", ownedBy, beforeMutate });
    assert.equal(r.status, "problem", "identity가 바뀌면 retire하지 않는다");
    assert.match(readTarget(), /갑자기 사용자 것/, "새 unmanaged 보존");
  });

  it("recover restore: rename 직전 target이 생기면 problem(덮어쓰기 0)", () => {
    mkBackupDir("demo", "abc123", "backup-v");
    const beforeMutate = () => {
      fs.mkdirSync(path.join(parent, "demo"));
      fs.writeFileSync(path.join(parent, "demo", "SKILL.md"), "---\nname: demo\n---\n경합 중 생성\n");
    };
    const rec = recoverManagedDirectory({ parent, name: "demo", ownedBy, isComplete, beforeMutate });
    assert.equal(rec?.status, "problem");
    assert.match(readTarget(), /경합 중 생성/, "새로 생긴 target 보존");
  });

  it("replace(create): rename 직전 target이 생기면 problem(덮어쓰기 0)", () => {
    const beforeMutate = () => {
      fs.mkdirSync(path.join(parent, "demo"));
      fs.writeFileSync(path.join(parent, "demo", "SKILL.md"), "---\nname: demo\n---\n선점\n");
    };
    const r = replaceManagedDirectory({ parent, name: "demo", ownedBy, isUpToDate: () => false, render: renderDir("v1"), beforeMutate });
    assert.equal(r.status, "problem");
    assert.match(readTarget(), /선점/, "선점된 target 보존");
  });
});

// ── AC-20: file replace/recover/prune ─────────────────────────────────────────
const cmdOwned = (file: string) => {
  try {
    return fs.readFileSync(file, "utf8").includes("managed-by: localmind (command: demo)");
  } catch {
    return false;
  }
};
const cmdComplete = (file: string) => {
  try {
    const c = fs.readFileSync(file, "utf8");
    return c.includes("managed-by: localmind (command: demo)") && /prompt = "[\s\S]*"\s*$/.test(c.trimEnd());
  } catch {
    return false;
  }
};

describe("managed-write-recovery: AC-20", () => {
  const cmdContent = (tag: string) => `# managed-by: localmind (command: demo)\nprompt = "${tag}"\n`;
  const readFile = () => fs.readFileSync(path.join(parent, "demo.toml"), "utf8");

  it("file create/update/unchanged/skipped-unmanaged", () => {
    let r = replaceManagedFile({ parent, fileName: "demo.toml", content: cmdContent("v1"), ownedBy: cmdOwned });
    assert.equal(r.status, "created");
    r = replaceManagedFile({ parent, fileName: "demo.toml", content: cmdContent("v1"), ownedBy: cmdOwned });
    assert.equal(r.status, "unchanged");
    r = replaceManagedFile({ parent, fileName: "demo.toml", content: cmdContent("v2"), ownedBy: cmdOwned });
    assert.equal(r.status, "updated");
    assert.match(readFile(), /v2/);
    // unmanaged 파일 보존
    fs.writeFileSync(path.join(parent, "user.toml"), "prompt = \"내 명령\"\n");
    r = replaceManagedFile({ parent, fileName: "user.toml", content: cmdContent("v3"), ownedBy: cmdOwned });
    assert.equal(r.status, "skipped-unmanaged");
    assert.match(fs.readFileSync(path.join(parent, "user.toml"), "utf8"), /내 명령/);
  });

  it("stage write 실패 → problem, 옛 파일 보존", () => {
    replaceManagedFile({ parent, fileName: "demo.toml", content: cmdContent("v1"), ownedBy: cmdOwned });
    const ops = faultyOps(defaultFsOps, { writeFile: 1 });
    const r = replaceManagedFile({ parent, fileName: "demo.toml", content: cmdContent("v2"), ownedBy: cmdOwned, ops });
    assert.equal(r.status, "problem");
    assert.match(readFile(), /v1/);
  });

  it("stage→target rename 실패 → problem, 옛 파일 복구", () => {
    replaceManagedFile({ parent, fileName: "demo.toml", content: cmdContent("v1"), ownedBy: cmdOwned });
    const ops = faultyOps(defaultFsOps, { rename: 2 });
    const r = replaceManagedFile({ parent, fileName: "demo.toml", content: cmdContent("v2"), ownedBy: cmdOwned, ops });
    assert.equal(r.status, "problem");
    assert.match(readFile(), /v1/);
  });

  // R1-04: file backup cleanup 실패도 problem.
  it("backup cleanup 실패 → problem, 다음 recovery가 고아 정리", () => {
    replaceManagedFile({ parent, fileName: "demo.toml", content: cmdContent("v1"), ownedBy: cmdOwned });
    const ops = faultyOps(defaultFsOps, { rm: 1 });
    const r = replaceManagedFile({ parent, fileName: "demo.toml", content: cmdContent("v2"), ownedBy: cmdOwned, ops });
    assert.equal(r.status, "problem", "AC-20: cleanup 실패는 problem");
    assert.match(readFile(), /v2/, "complete-new 유지");
    assert.ok(listHidden().some((n) => n.startsWith(".localmind-backup-demo.toml-")));
    const rec = recoverManagedFile({ parent, fileName: "demo.toml", ownedBy: cmdOwned, isComplete: cmdComplete });
    assert.equal(rec?.status, "recovered");
    assert.equal(listHidden().length, 0);
    assert.match(readFile(), /v2/);
  });

  it("prune file: managed retire+삭제, unmanaged 보존", () => {
    replaceManagedFile({ parent, fileName: "demo.toml", content: cmdContent("v1"), ownedBy: cmdOwned });
    const r = pruneManagedFile({ parent, fileName: "demo.toml", ownedBy: cmdOwned });
    assert.equal(r.status, "pruned");
    assert.ok(!fs.existsSync(path.join(parent, "demo.toml")));
    fs.writeFileSync(path.join(parent, "keep.toml"), "prompt = \"x\"\n");
    const r2 = pruneManagedFile({ parent, fileName: "keep.toml", ownedBy: cmdOwned });
    assert.equal(r2.status, "skipped-unmanaged");
    assert.ok(fs.existsSync(path.join(parent, "keep.toml")));
  });

  it("recovery file: target 부재 + 유효(complete) backup 1개 → 복구", () => {
    const backup = path.join(parent, ".localmind-backup-demo.toml-aa0011");
    fs.writeFileSync(backup, cmdContent("recovered"));
    const rec = recoverManagedFile({ parent, fileName: "demo.toml", ownedBy: cmdOwned, isComplete: cmdComplete });
    assert.equal(rec?.status, "recovered");
    assert.match(readFile(), /recovered/);
  });

  it("recovery file: retired 정리 실패 + backup 복구 동시 → problem(R1-04)", () => {
    const retired = path.join(parent, ".localmind-retired-demo.toml-aa11bb22cc33");
    fs.writeFileSync(retired, cmdContent("retired-old"));
    fs.writeFileSync(path.join(parent, ".localmind-backup-demo.toml-dd44ee55ff66"), cmdContent("backup-v"));
    const ops = faultyOps(defaultFsOps, { rm: 1 }); // retired cleanup 실패
    const rec = recoverManagedFile({ parent, fileName: "demo.toml", ownedBy: cmdOwned, isComplete: cmdComplete, ops });
    assert.equal(rec?.status, "problem", "retired cleanup 실패를 recovered로 숨기지 않는다");
    assert.match(readFile(), /backup-v/, "backup 복구는 수행");
  });
});
