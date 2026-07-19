/**
 * AC-17 — 워크플로 자산 lifecycle 재현 E2E (specs/044 FR-11).
 * seed·배포는 모든 lifecycle 진입점(restore/recover/update/device-sync)이 공유하는
 * `skills:deploy` CLI로 수렴한다. 실제 CLI와 restore-assets.sh(recover)를 injected temp
 * 경로로 실행해 production workflow와 target별 산출물이 재현되는지 검증한다. 실제 $HOME는 건드리지 않는다.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let root, home, canonical, claudeSkills, agentSkills, geminiCmds, notesEnvFile;
before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-lifecycle-"));
  home = path.join(root, "home");
  canonical = path.join(home, ".localmind", "skills");
  claudeSkills = path.join(home, ".claude", "skills");
  agentSkills = path.join(home, ".agents", "skills");
  geminiCmds = path.join(home, ".gemini", "commands");
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true }); // Claude 설치 흔적
  fs.mkdirSync(path.join(home, ".gemini"), { recursive: true }); // Gemini 설치 흔적
  // backup-assets.sh 호출을 헤르메틱하게: 격리 NOTES_DIR을 주입해 저장소의 ambient .env에
  // 의존하지 않게 한다(그것이 있으면 dev 머신은 통과, 클린 체크아웃(CI)은 실패로 갈렸다).
  notesEnvFile = path.join(root, "notes.env");
  fs.writeFileSync(notesEnvFile, `NOTES_DIR=notes=${path.join(home, ".localmind")}\n`);
});
after(() => fs.rmSync(root, { recursive: true, force: true }));

function deployEnv() {
  return {
    ...process.env,
    HOME: home,
    LOCALMIND_SKILLS_DIR: canonical,
    LOCALMIND_CLAUDE_SKILLS_DIR: claudeSkills,
    LOCALMIND_AGENT_SKILLS_DIR: agentSkills,
    LOCALMIND_GEMINI_COMMANDS_DIR: geminiCmds,
  };
}
function runDeployCli(env = deployEnv()) {
  return execFileSync("node", ["--import", "tsx/esm", "scripts/skills-deploy.ts"], { cwd: REPO_ROOT, encoding: "utf8", env });
}
const read = (p) => fs.readFileSync(p, "utf8");
// specs/044 당시의 3-workflow characterization 의미는 별도 상수로 보존한다.
const LEGACY_CHARACTERIZATION_WORKFLOWS = ["goal-ready", "goal-impl", "sdd-self-review"];
const PRODUCTION_WORKFLOWS = [
  "deep-research",
  ...LEGACY_CHARACTERIZATION_WORKFLOWS,
  "localmind-binding",
  "localmind-rules",
  "research-evidence-pack",
].sort();
const GEMINI_WRAPPER_WORKFLOWS = PRODUCTION_WORKFLOWS.filter((name) => name !== "research-evidence-pack");

function assertAllTargetsReproduced() {
  for (const n of PRODUCTION_WORKFLOWS) {
    assert.ok(fs.existsSync(path.join(canonical, n, "SKILL.md")), `canonical ${n}`);
    assert.ok(read(path.join(claudeSkills, n, "SKILL.md")).includes(`managed-by: localmind (skill: ${n})`), `claude ${n} marker`);
    assert.ok(read(path.join(agentSkills, n, "SKILL.md")).includes(`managed-by: localmind (skill: ${n})`), `agent ${n} marker`);
  }
  for (const n of GEMINI_WRAPPER_WORKFLOWS) assert.ok(fs.existsSync(path.join(geminiCmds, `${n}.toml`)), `gemini ${n}.toml`);
  assert.ok(!fs.existsSync(path.join(geminiCmds, "research-evidence-pack.toml")), "실행 validator 전제 workflow는 generated wrapper 없음");
  assert.ok(fs.existsSync(path.join(claudeSkills, "research-evidence-pack", "scripts", "validate_bundle.py")), "Claude skill validator 배포");
  assert.ok(fs.existsSync(path.join(agentSkills, "research-evidence-pack", "scripts", "validate_bundle.py")), "Agent Skill validator 배포");
  assert.match(read(path.join(claudeSkills, "goal-impl", "SKILL.md")).split("\n---")[0], /disable-model-invocation:\s*true/);
  assert.match(read(path.join(agentSkills, "goal-impl", "agents", "openai.yaml")), /allow_implicit_invocation: false/);
  assert.match(read(path.join(claudeSkills, "deep-research", "SKILL.md")).split("\n---")[0], /disable-model-invocation:\s*true/);
  assert.match(read(path.join(agentSkills, "deep-research", "agents", "openai.yaml")), /allow_implicit_invocation: false/);
}

describe("workflow-lifecycle: AC-17", () => {
  it("skills:deploy CLI가 production 일곱 workflow를 지원 target에 재현하고 wrapper 비적격은 정직하게 건너뛴다", () => {
    const out = runDeployCli();
    assert.match(out, /배포 결과: (성공|부분 성공)/);
    assertAllTargetsReproduced();
  });

  it("재실행은 멱등(변경 없음)이다", () => {
    const out = runDeployCli();
    // 정본 시드/각 target 모두 unchanged 이어야 한다
    assert.match(out, /변경 없음/);
    assert.match(out, /deep-research: 변경 없음/);
    assert.ok(!/생성됨/.test(out.split("배포 결과")[1] ?? ""), "두 번째 배포에 생성 없음");
  });

  it("managed deep-research target drift는 갱신하고 다음 실행에 수렴한다", () => {
    const target = path.join(claudeSkills, "deep-research", "SKILL.md");
    assert.ok(fs.existsSync(target), "managed update 사전조건: deep-research Claude target 존재");
    fs.appendFileSync(target, "\nLOCALMIND_MANAGED_DRIFT\n");
    const updated = runDeployCli();
    assert.match(updated, /deep-research: 갱신됨/, "managed target drift를 갱신으로 보고");
    assert.ok(!read(target).includes("LOCALMIND_MANAGED_DRIFT"), "managed target을 canonical 내용으로 복원");
    const stable = runDeployCli();
    assert.match(stable, /deep-research: 변경 없음/, "복원 후 재실행은 unchanged");
  });

  it("동명 unmanaged deep-research asset은 byte-for-byte 보존한다", () => {
    const target = path.join(geminiCmds, "deep-research.toml");
    fs.rmSync(target, { force: true });
    const unmanaged = Buffer.from('description = "사용자 deep-research"\nprompt = "byte-for-byte 보존"\n', "utf8");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, unmanaged);

    const out = runDeployCli();
    assert.deepEqual(fs.readFileSync(target), unmanaged, "동명 unmanaged wrapper bytes 불변");
    assert.match(out, /deep-research: 건너뜀\(직접 만든 자산 보호\)/, "unmanaged 보호를 정직하게 보고");

    // 뒤 lifecycle fixture가 managed production 상태를 전제로 하므로 격리 자산만 회수해 복원한다.
    fs.rmSync(target, { force: true });
    runDeployCli();
    assert.ok(read(target).includes("managed-by: localmind (command: deep-research)"), "managed wrapper 재생성");
  });

  it("실제 runtime이 없는 temp home은 deep-research missing target을 skipped로 보고한다", () => {
    const missingHome = path.join(root, "missing-runtime-home");
    const missingCanonical = path.join(missingHome, ".localmind", "skills");
    const missingAgent = path.join(missingHome, ".agents", "skills");
    fs.mkdirSync(missingHome, { recursive: true });
    const env = { ...process.env };
    delete env.LOCALMIND_CLAUDE_SKILLS_DIR;
    delete env.LOCALMIND_GEMINI_COMMANDS_DIR;
    env.HOME = missingHome;
    env.LOCALMIND_SKILLS_DIR = missingCanonical;
    env.LOCALMIND_AGENT_SKILLS_DIR = missingAgent;

    const out = runDeployCli(env);
    assert.match(out, /배포 결과: 부분 성공/);
    assert.ok(fs.existsSync(path.join(missingAgent, "deep-research", "SKILL.md")), "available Agent Skill target은 생성");
    assert.ok(!fs.existsSync(path.join(missingHome, ".claude")), "미설치 Claude root 임의 생성 금지");
    assert.ok(!fs.existsSync(path.join(missingHome, ".gemini")), "미설치 Gemini root 임의 생성 금지");
    const skipped = out.match(/deep-research: 건너뜀\(런타임 미설치\)/g) ?? [];
    assert.equal(skipped.length, 2, "Claude/Gemini 두 missing target을 각각 skipped로 보고");
  });

  it("recover(초기화된 기기): target을 지우고 다시 배포하면 재현된다", () => {
    for (const d of [claudeSkills, agentSkills, geminiCmds]) fs.rmSync(d, { recursive: true, force: true });
    runDeployCli();
    assertAllTargetsReproduced();
  });

  it("restore-assets.sh(recover)가 확장 배포를 호출해 target을 재현한다", () => {
    // 초기화 후 restore-assets recover 경로로 재현(실제 shell wiring 검증).
    for (const d of [claudeSkills, agentSkills, geminiCmds]) fs.rmSync(d, { recursive: true, force: true });
    const envFile = path.join(root, "lifecycle.env");
    fs.writeFileSync(envFile, `NOTES_DIR=notes=${path.join(home, ".localmind")}\n`);
    const env = {
      ...deployEnv(),
      BACKUP_DIR: path.join(home, ".localmind"),
      LOCALMIND_ENV_FILE: envFile,
      RESTORE_CONTEXT: "recover",
    };
    const out = execFileSync("bash", ["scripts/restore-assets.sh"], { cwd: REPO_ROOT, encoding: "utf8", env });
    assert.match(out, /skills 배포 완료|배포/);
    assertAllTargetsReproduced();
  });

  it("device-sync asset-dirs가 target 경로를 노출한다(marker 검증용)", () => {
    const out = execFileSync("node", ["--import", "tsx/esm", "scripts/asset-dirs.ts"], { cwd: REPO_ROOT, encoding: "utf8", env: deployEnv() });
    assert.match(out, new RegExp(`agent_skills=${agentSkills.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(out, /claude_skills=/);
    assert.match(out, /gemini_commands=/);
  });
});

// ── R4-05: lifecycle 진입점 E2E 매트릭스(실 진입점을 temp 루트로 실행 — grep-only 금지) ──
describe("workflow-lifecycle E2E entry points: AC-17 (R4-05)", () => {
  const runShell = (script, env) => execFileSync("bash", [script], { cwd: REPO_ROOT, encoding: "utf8", env });
  const isDeny = (p) => /allow_implicit_invocation: false/.test(fs.readFileSync(p, "utf8"));

  it("backup 진입점: production 일곱 skill 소스를 미러하고 생성 Claude/공용/Gemini 산출물은 제외한다", () => {
    runDeployCli(); // 정본 seed + 전 target 배포
    const backupDir = path.join(root, "backup");
    fs.mkdirSync(backupDir, { recursive: true });
    runShell("scripts/backup-assets.sh", { ...deployEnv(), BACKUP_DIR: backupDir, LOCALMIND_ENV_FILE: notesEnvFile });
    const mirror = path.join(backupDir, "skills");
    for (const n of PRODUCTION_WORKFLOWS) assert.ok(fs.existsSync(path.join(mirror, n, "SKILL.md")), `정본 ${n} 미러`);
    assert.ok(fs.existsSync(path.join(mirror, ".localmind-mirror")), "미러 마커");
    // 생성 target 전용 산출물은 정본 미러에 없다(정본은 generated openai.yaml / .toml / deny frontmatter 미포함)
    assert.ok(!fs.existsSync(path.join(mirror, "goal-impl", "agents", "openai.yaml")), "생성 openai.yaml 제외");
    assert.ok(!fs.existsSync(path.join(mirror, "goal-ready.toml")), "생성 Gemini wrapper 제외");
    assert.ok(!/disable-model-invocation/.test(fs.readFileSync(path.join(mirror, "goal-impl", "SKILL.md"), "utf8")), "생성 Claude frontmatter 제외");
  });

  it("restore 진입점: 정본 복원 후 전 target 재생성 + 정확한 marker/정책", () => {
    // 백업(정본 미러)을 준비하고, 초기화된 기기에서 restore가 전 target을 재생성하는지.
    const backupDir = path.join(root, "restore-backup");
    fs.mkdirSync(path.join(backupDir, "skills"), { recursive: true });
    runDeployCli();
    // 정본을 백업 미러로 복사(backup-assets 경유)
    runShell("scripts/backup-assets.sh", { ...deployEnv(), BACKUP_DIR: backupDir, LOCALMIND_ENV_FILE: notesEnvFile });
    // 기기 초기화: canonical + 전 target 삭제
    for (const d of [canonical, claudeSkills, agentSkills, geminiCmds]) fs.rmSync(d, { recursive: true, force: true });
    const envFile = path.join(root, "restore.env");
    fs.writeFileSync(envFile, `NOTES_DIR=notes=${path.join(home, ".localmind")}\n`);
    runShell("scripts/restore-assets.sh", { ...deployEnv(), BACKUP_DIR: backupDir, LOCALMIND_ENV_FILE: envFile, RESTORE_CONTEXT: "restore" });
    assertAllTargetsReproduced();
    assert.ok(isDeny(path.join(agentSkills, "goal-impl", "agents", "openai.yaml")), "공용 deny-implicit 정책 재생성");
  });

  it("recover(미러 아님): 즉시 seed + 전 target 배포", () => {
    for (const d of [claudeSkills, agentSkills, geminiCmds]) fs.rmSync(d, { recursive: true, force: true });
    const envFile = path.join(root, "recover-nomirror.env");
    fs.writeFileSync(envFile, `NOTES_DIR=notes=${path.join(home, ".localmind")}\n`);
    // 백업 = canonical 부모(마커 없음 = 기본 구성) → recover는 복사 생략 + 배포
    runShell("scripts/restore-assets.sh", { ...deployEnv(), BACKUP_DIR: path.join(home, ".localmind"), LOCALMIND_ENV_FILE: envFile, RESTORE_CONTEXT: "recover" });
    assertAllTargetsReproduced();
  });

  it("recover(미러 보류): 마커 있는 미러는 노트 연결 전 target을 만들지 않고, 이후 restore가 재생성한다", () => {
    // 마커(.localmind-mirror) 있는 백업 skills + 노트 미설정 → 보류(배포 안 함).
    const backupDir = path.join(root, "mirror-backup");
    const mirrorSkills = path.join(backupDir, "skills");
    fs.mkdirSync(mirrorSkills, { recursive: true });
    runDeployCli();
    runShell("scripts/backup-assets.sh", { ...deployEnv(), BACKUP_DIR: backupDir, LOCALMIND_ENV_FILE: notesEnvFile });
    assert.ok(fs.existsSync(path.join(mirrorSkills, ".localmind-mirror")), "미러 마커 존재");
    for (const d of [claudeSkills, agentSkills, geminiCmds]) fs.rmSync(d, { recursive: true, force: true });
    // 노트 미설정(.env 없음) + recover → 보류: target 미생성
    const out = runShell("scripts/restore-assets.sh", { ...deployEnv(), BACKUP_DIR: backupDir, LOCALMIND_ENV_FILE: path.join(root, "no-such.env"), RESTORE_CONTEXT: "recover" });
    assert.match(out, /보류|연결/);
    assert.ok(!fs.existsSync(path.join(agentSkills, "goal-ready")), "미러에서 target을 만들지 않는다(보류)");
    // 이후 정상 배포(노트 연결됨)로 전 target 재생성
    runDeployCli();
    assertAllTargetsReproduced();
  });

  it("구 이름 잔재(데이터 정본 + gemini wrapper)가 seed→deploy 후 정리된다(specs/051 D-2, AC-9)", () => {
    // 이름 무관(generic, I-2) 은퇴 기제를 통합 레벨에서 관찰한다 — 재유입 가드(I-4)가
    // 활성 표면의 은퇴 리터럴 자체를 금지하므로, 실제 구 논리 ID 문자열이 아니라 일반화된
    // fixture 이름으로 "packaged 정본에서 빠진 managed 잔재 → seed+deploy가 함께 정리"를 검증한다.
    const RETIRED = "wf-legacy-retired";
    runDeployCli(); // 정상 배포 먼저 — canonical에 production workflow가 자리잡는다

    const staleDir = path.join(canonical, RETIRED);
    fs.mkdirSync(staleDir, { recursive: true });
    fs.writeFileSync(
      path.join(staleDir, "SKILL.md"),
      `---\nname: ${RETIRED}\ndescription: old\n---\n<!-- managed-by: localmind (skill: ${RETIRED}) -->\nold body\n`,
    );
    fs.writeFileSync(
      path.join(geminiCmds, `${RETIRED}.toml`),
      `# managed-by: localmind (command: ${RETIRED})\ndescription = "old"\nprompt = "old"\n`,
    );
    assert.ok(fs.existsSync(staleDir), "사전조건: 데이터 정본 잔재 생성됨");
    assert.ok(fs.existsSync(path.join(geminiCmds, `${RETIRED}.toml`)), "사전조건: gemini wrapper 잔재 생성됨");

    const out = runDeployCli();

    assert.ok(!fs.existsSync(staleDir), "데이터 정본 잔재가 seed sweep으로 정리됨(D-2①)");
    assert.ok(!fs.existsSync(path.join(geminiCmds, `${RETIRED}.toml`)), "gemini wrapper 잔재가 sweep으로 정리됨(D-2②)");
    assert.match(out, new RegExp(`${RETIRED}: 정리됨 \\(packaged 정본에서 은퇴됨\\)`));
    assertAllTargetsReproduced(); // production workflow는 여전히 정상 배포돼 있다
  });

  it("device-sync 검증 진입점: 전 target 정상이면 verify-targets 통과, 하나라도 깨지면 실패", () => {
    runDeployCli();
    // 통과
    execFileSync("node", ["--import", "tsx/esm", "scripts/verify-targets.ts"], { cwd: REPO_ROOT, encoding: "utf8", env: deployEnv() });
    // 공용 target에서 marker 제거 → 검증 실패(비0)
    fs.rmSync(path.join(agentSkills, "goal-ready"), { recursive: true, force: true });
    let failed = false;
    try {
      execFileSync("node", ["--import", "tsx/esm", "scripts/verify-targets.ts"], { cwd: REPO_ROOT, encoding: "utf8", env: deployEnv() });
    } catch {
      failed = true;
    }
    assert.ok(failed, "target이 깨지면 verify-targets가 비0으로 실패");
    runDeployCli(); // 원복
  });
});
