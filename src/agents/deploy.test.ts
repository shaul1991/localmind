/**
 * agents/deploy.ts 테스트 — 배포·멱등·prune·무관 파일 보호 (specs/016 FR-3~FR-8).
 * 모든 경로를 임시 디렉토리로 주입해 실제 ~/.claude·~/.codex를 건드리지 않는다.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { deployAgents, formatDeployResult, MANAGED_MARKER } from "./deploy.js";

const VALID = `---
name: critic
description: 적대 검증·품질 게이트
targets:
  claude:
    model: opus
    tools: Read
  codex:
    model: gpt-5.5
    reasoning_effort: high
    sandbox: read-only
---
너는 적대적 리뷰어다. "결함"을 찾으러 간다.
`;

const CLAUDE_ONLY = `---
name: curator
description: 분류·태깅
targets:
  claude:
    model: haiku
---
분류 지침.
`;

let root: string;
let registryDir: string;
let claudeAgentsDir: string;
let codexHome: string;

function setup() {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-agents-deploy-"));
  registryDir = path.join(root, "registry");
  claudeAgentsDir = path.join(root, "dot-claude", "agents");
  codexHome = path.join(root, "dot-codex");
  fs.mkdirSync(registryDir, { recursive: true });
  fs.mkdirSync(path.join(root, "dot-claude"), { recursive: true }); // "설치됨" 상태
  fs.mkdirSync(codexHome, { recursive: true });
}

function run() {
  return deployAgents({ registryDir, claudeAgentsDir, codexHome });
}

describe("deployAgents", () => {
  beforeEach(setup);
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("AC-1: 페르소나 1개 배포 → claude md + codex 프로필 + codex 에이전트 toml, 모델·마커 반영", () => {
    fs.writeFileSync(path.join(registryDir, "critic.md"), VALID);
    const result = run();
    assert.equal(result.problems.length, 0);
    assert.equal(result.skippedTargets.length, 0);

    const claudeFile = path.join(claudeAgentsDir, "critic.md");
    const profileFile = path.join(codexHome, "critic.config.toml");
    const codexAgentFile = path.join(codexHome, "agents", "critic.toml");
    for (const f of [claudeFile, profileFile, codexAgentFile]) {
      assert.ok(fs.existsSync(f), `산출물 없음: ${f}`);
      assert.ok(fs.readFileSync(f, "utf8").includes(MANAGED_MARKER), `마커 없음: ${f}`);
    }
    const claude = fs.readFileSync(claudeFile, "utf8");
    assert.match(claude, /model: opus/);
    assert.match(claude, /tools: "Read"/);
    assert.match(claude, /적대적 리뷰어/);
    const profile = fs.readFileSync(profileFile, "utf8");
    assert.match(profile, /model = "gpt-5\.5"/);
    assert.match(profile, /model_reasoning_effort = "high"/);
    assert.match(profile, /sandbox_mode = "read-only"/);
    const agent = fs.readFileSync(codexAgentFile, "utf8");
    assert.match(agent, /name = "critic"/);
    assert.match(agent, /적대적 리뷰어/);
  });

  it("AC-2: 변경 없이 재배포하면 내용이 동일하고(unchanged) 오류가 없다", () => {
    fs.writeFileSync(path.join(registryDir, "critic.md"), VALID);
    run();
    const before = fs.readFileSync(path.join(claudeAgentsDir, "critic.md"), "utf8");
    const second = run();
    assert.equal(fs.readFileSync(path.join(claudeAgentsDir, "critic.md"), "utf8"), before);
    assert.ok(second.items.every((i) => i.status === "unchanged"));
  });

  it("정본을 수정하고 재배포하면 산출물이 갱신된다(updated)", () => {
    fs.writeFileSync(path.join(registryDir, "critic.md"), VALID);
    run();
    fs.writeFileSync(path.join(registryDir, "critic.md"), VALID.replace("opus", "sonnet"));
    const result = run();
    assert.ok(result.items.some((i) => i.status === "updated"));
    assert.match(fs.readFileSync(path.join(claudeAgentsDir, "critic.md"), "utf8"), /model: sonnet/);
  });

  it("AC-5: 마커 없는 동명 파일은 건드리지 않고 경고하며, 다른 페르소나는 정상 배포한다", () => {
    fs.mkdirSync(claudeAgentsDir, { recursive: true });
    fs.writeFileSync(path.join(claudeAgentsDir, "critic.md"), "사용자가 직접 만든 파일");
    fs.writeFileSync(path.join(registryDir, "critic.md"), VALID);
    fs.writeFileSync(path.join(registryDir, "curator.md"), CLAUDE_ONLY);
    const result = run();
    assert.equal(fs.readFileSync(path.join(claudeAgentsDir, "critic.md"), "utf8"), "사용자가 직접 만든 파일");
    assert.ok(result.items.some((i) => i.status === "skipped-unmanaged" && i.file.includes("critic")));
    assert.ok(fs.existsSync(path.join(claudeAgentsDir, "curator.md")));
  });

  it("AC-6: 정본에서 삭제된 페르소나의 마커 있는 산출물은 prune되고, 마커 없는 파일은 남는다", () => {
    fs.writeFileSync(path.join(registryDir, "critic.md"), VALID);
    fs.writeFileSync(path.join(registryDir, "curator.md"), CLAUDE_ONLY);
    run();
    fs.mkdirSync(claudeAgentsDir, { recursive: true });
    fs.writeFileSync(path.join(claudeAgentsDir, "mine.md"), "내가 만든 서브에이전트");
    fs.rmSync(path.join(registryDir, "critic.md"));
    const result = run();
    assert.ok(!fs.existsSync(path.join(claudeAgentsDir, "critic.md")), "claude 산출물이 prune되지 않음");
    assert.ok(!fs.existsSync(path.join(codexHome, "critic.config.toml")), "codex 프로필이 prune되지 않음");
    assert.ok(!fs.existsSync(path.join(codexHome, "agents", "critic.toml")), "codex 에이전트가 prune되지 않음");
    assert.ok(fs.existsSync(path.join(claudeAgentsDir, "mine.md")), "무관 파일이 삭제됨");
    assert.ok(fs.existsSync(path.join(claudeAgentsDir, "curator.md")));
    assert.ok(result.items.some((i) => i.status === "pruned"));
  });

  it("검증 문제가 있으면 prune을 건너뛴다(잘못된 파일 때문에 산출물을 지우지 않는다)", () => {
    fs.writeFileSync(path.join(registryDir, "critic.md"), VALID);
    run();
    // critic.md가 깨짐 — 이름을 알 수 없으니 prune했다간 critic 산출물이 날아간다
    fs.writeFileSync(path.join(registryDir, "critic.md"), "frontmatter 없는 깨진 파일");
    const result = run();
    assert.ok(fs.existsSync(path.join(claudeAgentsDir, "critic.md")), "깨진 정본 때문에 산출물이 삭제됨");
    assert.equal(result.problems.length, 1);
    assert.equal(result.pruneSkipped, true);
  });

  it("AC-7: codex 홈이 없으면 codex만 건너뛰고 claude는 정상 배포한다", () => {
    fs.rmSync(codexHome, { recursive: true, force: true });
    fs.writeFileSync(path.join(registryDir, "critic.md"), VALID);
    const result = run();
    assert.ok(fs.existsSync(path.join(claudeAgentsDir, "critic.md")));
    assert.ok(result.skippedTargets.some((s) => s.target === "codex"));
    assert.ok(!fs.existsSync(path.join(codexHome, "critic.config.toml")));
  });

  it("claude 상위 폴더(~/.claude)가 없으면 claude만 건너뛴다", () => {
    fs.rmSync(path.join(root, "dot-claude"), { recursive: true, force: true });
    fs.writeFileSync(path.join(registryDir, "critic.md"), VALID);
    const result = run();
    assert.ok(result.skippedTargets.some((s) => s.target === "claude"));
    assert.ok(fs.existsSync(path.join(codexHome, "critic.config.toml")));
  });

  it("AC-8: 빈 레지스트리는 실패하지 않고, 기존 managed 산출물은 prune한다", () => {
    fs.writeFileSync(path.join(registryDir, "critic.md"), VALID);
    run();
    fs.rmSync(path.join(registryDir, "critic.md"));
    const result = run();
    assert.equal(result.personaCount, 0);
    assert.equal(result.problems.length, 0);
    assert.ok(!fs.existsSync(path.join(claudeAgentsDir, "critic.md")));
  });

  it("claude 전용 페르소나는 codex 산출물을 만들지 않는다", () => {
    fs.writeFileSync(path.join(registryDir, "curator.md"), CLAUDE_ONLY);
    run();
    assert.ok(fs.existsSync(path.join(claudeAgentsDir, "curator.md")));
    assert.ok(!fs.existsSync(path.join(codexHome, "curator.config.toml")));
    assert.ok(!fs.existsSync(path.join(codexHome, "agents", "curator.toml")));
  });

  it("AC-10: 레지스트리를 다른 환경으로 복사(=git 복원)해 배포하면 동일한 산출물이 나온다", () => {
    fs.writeFileSync(path.join(registryDir, "critic.md"), VALID);
    run();
    const original = fs.readFileSync(path.join(claudeAgentsDir, "critic.md"), "utf8");
    const originalProfile = fs.readFileSync(path.join(codexHome, "critic.config.toml"), "utf8");

    // "새 기기": 레지스트리 파일만 복사돼 온 상태(백업 repo clone과 동일한 효과)
    const root2 = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-agents-restore-"));
    try {
      const registry2 = path.join(root2, "registry");
      fs.mkdirSync(registry2, { recursive: true });
      fs.copyFileSync(path.join(registryDir, "critic.md"), path.join(registry2, "critic.md"));
      fs.mkdirSync(path.join(root2, "dot-claude"), { recursive: true });
      const codexHome2 = path.join(root2, "dot-codex");
      fs.mkdirSync(codexHome2, { recursive: true });
      deployAgents({
        registryDir: registry2,
        claudeAgentsDir: path.join(root2, "dot-claude", "agents"),
        codexHome: codexHome2,
      });
      assert.equal(fs.readFileSync(path.join(root2, "dot-claude", "agents", "critic.md"), "utf8"), original);
      assert.equal(fs.readFileSync(path.join(codexHome2, "critic.config.toml"), "utf8"), originalProfile);
    } finally {
      fs.rmSync(root2, { recursive: true, force: true });
    }
  });

  it('본문에 TOML을 깨는 문자(""", 백슬래시)가 있어도 안전하게 이스케이프한다', () => {
    fs.writeFileSync(
      path.join(registryDir, "tricky.md"),
      `---\nname: tricky\ndescription: 이스케이프 검증\ntargets:\n  codex:\n    model: gpt-5.5\n---\n경로는 C:\\tmp 이고 인용은 """ 이다.\n`,
    );
    const result = run();
    assert.equal(result.problems.length, 0);
    const agent = fs.readFileSync(path.join(codexHome, "agents", "tricky.toml"), "utf8");
    // TOML 다중행 기본 문자열 안에서 """가 그대로(비이스케이프로) 등장하면 안 된다
    assert.ok(!/[^\\]"""[^"\n]*이다/.test(agent), "이스케이프 안 된 삼중따옴표");
    assert.match(agent, /C:\\\\tmp/);
  });
});

describe("deployAgents — self-review 회귀", () => {
  beforeEach(setup);
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("회귀(중대-1): 산출물을 복사해 개인화한 파일은 prune·덮어쓰기 대상이 아니다", () => {
    fs.writeFileSync(path.join(registryDir, "critic.md"), VALID);
    run();
    // 사용자가 산출물을 복사해 개인화 — 마커는 남아 있지만 파일명(my-critic)과 마커의
    // 페르소나 이름(critic)이 다르다
    const copied = fs.readFileSync(path.join(claudeAgentsDir, "critic.md"), "utf8") + "\n내 커스텀 지침 추가";
    fs.writeFileSync(path.join(claudeAgentsDir, "my-critic.md"), copied);
    const result = run();
    assert.ok(fs.existsSync(path.join(claudeAgentsDir, "my-critic.md")), "복사·개인화한 파일이 삭제됨");
    assert.equal(fs.readFileSync(path.join(claudeAgentsDir, "my-critic.md"), "utf8"), copied, "복사한 파일이 변경됨");
    assert.ok(!result.items.some((i) => i.file.includes("my-critic") && i.status === "pruned"));

    // 이후 my-critic이 레지스트리에 생겨도, 이름이 다른 마커를 가진 기존 파일은 덮어쓰지 않는다
    fs.writeFileSync(path.join(registryDir, "my-critic.md"), VALID.replace("name: critic", "name: my-critic"));
    const second = run();
    assert.equal(fs.readFileSync(path.join(claudeAgentsDir, "my-critic.md"), "utf8"), copied);
    assert.ok(second.items.some((i) => i.file === "my-critic.md" && i.status === "skipped-unmanaged"));
  });

  it("회귀(중대-1): 본문에서 마커 문구를 언급만 한 사용자 파일은 prune되지 않는다", () => {
    fs.mkdirSync(claudeAgentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeAgentsDir, "mine.md"),
      "managed-by: localmind 라는 표식에 대해 설명하는 내 노트",
    );
    run(); // 빈 레지스트리 → prune 실행됨
    assert.ok(fs.existsSync(path.join(claudeAgentsDir, "mine.md")), "마커를 언급한 사용자 파일이 삭제됨");
  });

  it("회귀(중대-2): description이 아주 길어도 재배포가 산출물을 정상 갱신·prune한다", () => {
    const longDesc = "긴 설명 ".repeat(300); // 마커가 파일 앞 800자 밖으로 밀리는 크기
    const def = VALID.replace("적대 검증·품질 게이트", longDesc.trim());
    fs.writeFileSync(path.join(registryDir, "critic.md"), def);
    run();
    const second = run();
    assert.ok(
      second.items.every((i) => i.status === "unchanged"),
      `긴 description에서 산출물이 unmanaged로 오판됨: ${JSON.stringify(second.items)}`,
    );
    fs.rmSync(path.join(registryDir, "critic.md"));
    run();
    assert.ok(!fs.existsSync(path.join(claudeAgentsDir, "critic.md")), "긴 description 산출물이 prune되지 않음(고아)");
  });

  it("회귀(재검 P2): description에 마커 형식 문자열이 있어도 자기 산출물을 정상 갱신·prune한다", () => {
    const def = VALID.replace(
      "적대 검증·품질 게이트",
      "표식은 managed-by: localmind (persona: other) 형태다",
    );
    fs.writeFileSync(path.join(registryDir, "critic.md"), def);
    run();
    const second = run();
    assert.ok(
      second.items.every((i) => i.status === "unchanged"),
      `마커 유사 문자열로 unmanaged 오판: ${JSON.stringify(second.items)}`,
    );
    fs.rmSync(path.join(registryDir, "critic.md"));
    run();
    assert.ok(!fs.existsSync(path.join(claudeAgentsDir, "critic.md")), "prune되지 않은 고아 산출물");
  });

  it("회귀(재검 P5): 단독 CR(\\r)이 값에 있어도 유효한 TOML을 배포한다", () => {
    fs.writeFileSync(
      path.join(registryDir, "cr.md"),
      `---\nname: cr\ndescription: 앞\r뒤\ntargets:\n  codex:\n    model: gpt-5.5\n---\n본문에도\r단독CR.\n`,
    );
    const result = run();
    assert.equal(result.problems.length, 0);
    for (const f of ["cr.config.toml", path.join("agents", "cr.toml")]) {
      const toml = fs.readFileSync(path.join(codexHome, f), "utf8");
      assert.ok(!/\r/.test(toml), `${f}에 원시 CR이 남음`);
    }
  });

  it("회귀(경미-2): 본문의 제어문자를 이스케이프해 TOML을 깨지 않는다", () => {
    fs.writeFileSync(
      path.join(registryDir, "ctrl.md"),
      `---\nname: ctrl\ndescription: 제어문자\ntargets:\n  codex:\n    model: gpt-5.5\n---\n지침\x01에 제어문자.\n`,
    );
    const result = run();
    assert.equal(result.problems.length, 0);
    const agent = fs.readFileSync(path.join(codexHome, "agents", "ctrl.toml"), "utf8");
    assert.ok(!/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(agent), "TOML 산출물에 원시 제어문자가 남음");
  });
});

describe("formatDeployResult", () => {
  beforeEach(setup);
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("AC-11(형식): 성공·건너뜀·문제를 평이한 한국어로 요약한다", () => {
    fs.rmSync(codexHome, { recursive: true, force: true });
    fs.writeFileSync(path.join(registryDir, "critic.md"), VALID);
    fs.writeFileSync(path.join(registryDir, "broken.md"), "깨진 파일");
    const text = formatDeployResult(run());
    assert.match(text, /critic/);
    assert.match(text, /broken\.md/);
    assert.match(text, /codex/i);
    assert.match(text, /건너/); // 건너뜀 안내
  });

  it("AC-8(형식): 빈 레지스트리는 '배포할 페르소나가 없습니다' 안내를 담는다", () => {
    const text = formatDeployResult(run());
    assert.match(text, /배포할 페르소나가 없습니다/);
  });
});
