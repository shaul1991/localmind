/**
 * cross-review.ts 테스트 — codex 교차 검증 (specs/018 FR-2·3·4·7).
 * codex 바이너리를 스텁 셸 스크립트로 재지정(CODEX_BIN)해 실 LLM 없이 결정적으로 검증한다.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { parseCrossReview, renderCrossReview, runCrossReview } from "./cross-review.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("parseCrossReview (AC-2·AC-5 단위)", () => {
  it("스키마 준수 산출을 해석하고, blocking이 있으면 verdict=block으로 정규화한다", () => {
    const v = parseCrossReview(
      '{"verdict":"pass","blocking":[{"category":"correctness","detail":"경계 오류"}],"advisory":[]}',
    );
    assert.equal(v?.verdict, "block");
    assert.equal(v?.blocking[0].detail, "경계 오류");
  });

  it("비JSON·형식 위반·미지 category는 null(생략 처리)", () => {
    assert.equal(parseCrossReview("산문 응답"), null);
    assert.equal(parseCrossReview('{"verdict":"pass"}'), null); // blocking/advisory 누락
    assert.equal(parseCrossReview('{"verdict":"pass","blocking":[],"advisory":[{"category":"style","detail":"x"}]}'), null);
  });
});

describe("renderCrossReview", () => {
  it("생략은 사유와 함께 '교차 미성립 명시' 지시를 담는다(위장 금지)", () => {
    const md = renderCrossReview({ status: "skipped", skipReason: "codex 미설치 — codex CLI를 설치하세요" });
    assert.match(md, /생략\(codex 미설치/);
    assert.match(md, /명시/);
  });

  it("ok는 백엔드·모델·차단/조언·추정 고지·끄는 법을 담는다(AC-1의 표기)", () => {
    const md = renderCrossReview({
      status: "ok",
      backend: "codex",
      model: "gpt-5.5",
      verdict: "block",
      blocking: [{ category: "traceability", detail: "AC-3 미충족" }],
      advisory: [{ category: "simplicity-security", detail: "중복 헬퍼" }],
    });
    assert.match(md, /critic\/gpt-5\.5/);
    assert.match(md, /\[FR\/AC 추적성\] AC-3 미충족/);
    assert.match(md, /\[단순화·보안\] 중복 헬퍼/);
    assert.match(md, /추정/);
    assert.match(md, /SDD_CROSS_REVIEW=off/);
  });
});

// ── runCrossReview — codex 스텁 통합 ────────────────────────────────────────

const ENV_KEYS = [
  "SDD_CROSS_REVIEW",
  "SDD_CROSS_REVIEW_TIMEOUT_MS",
  "CODEX_BIN",
  "LOCALMIND_CODEX_HOME",
  "CODEX_HOME",
  "LOCALMIND_AGENTS_DIR",
  "STUB_MODE",
  "STUB_PAYLOAD",
  "STUB_ARGS_FILE",
  "STUB_PROMPT_FILE",
] as const;

const CRITIC_DEF = `---
name: critic
description: 크리틱
targets:
  codex:
    model: gpt-5.5
---
지침.
`;

describe("runCrossReview (codex 스텁, AC-1·3·4·7·8)", () => {
  let root: string;
  let stubBin: string;
  let codexHome: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-crossreview-"));
    codexHome = path.join(root, "dot-codex");
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(path.join(codexHome, "critic.config.toml"), '# managed\nmodel = "gpt-5.5"\nmodel_reasoning_effort = "high"\n');
    stubBin = path.join(root, "codex");
    fs.writeFileSync(
      stubBin,
      `#!/bin/sh
if [ "$1" = "--version" ]; then echo "codex-cli 0.0.0-stub"; exit 0; fi
out=""; prev=""
for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done
[ -n "$STUB_ARGS_FILE" ] && printf '%s\\n' "$@" > "$STUB_ARGS_FILE"
if [ -n "$STUB_PROMPT_FILE" ]; then cat > "$STUB_PROMPT_FILE"; else cat > /dev/null; fi
case "$STUB_MODE" in
  ok)   printf '%s' "$STUB_PAYLOAD" > "$out"; exit 0;;
  bad)  printf 'not-json' > "$out"; exit 0;;
  fail) exit 3;;
  slow) sleep 3; printf '{}' > "$out"; exit 0;;
esac
exit 0
`,
    );
    fs.chmodSync(stubBin, 0o755);
    // 레지스트리에 critic 존재(실사용자 env에 오염되지 않게 격리)
    const agentsDir = path.join(root, "agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, "critic.md"), CRITIC_DEF);
    process.env.LOCALMIND_AGENTS_DIR = agentsDir;
    process.env.CODEX_BIN = stubBin;
    process.env.LOCALMIND_CODEX_HOME = codexHome;
    delete process.env.SDD_CROSS_REVIEW;
    delete process.env.SDD_CROSS_REVIEW_TIMEOUT_MS;
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("AC-1/AC-2: 정상 산출 — backend·모델 표기, 프롬프트가 stdin으로 전달, -p critic·스키마 강제", () => {
    process.env.STUB_MODE = "ok";
    process.env.STUB_PAYLOAD = '{"verdict":"advise","blocking":[],"advisory":[{"category":"coverage","detail":"엣지 미커버"}]}';
    process.env.STUB_ARGS_FILE = path.join(root, "args.txt");
    process.env.STUB_PROMPT_FILE = path.join(root, "prompt.txt");
    const r = runCrossReview({ prompt: "AC 목록과 diff 원문" });
    assert.equal(r.status, "ok");
    assert.equal(r.backend, "codex");
    assert.equal(r.model, "gpt-5.5");
    assert.equal(r.verdict, "advise");
    assert.equal(r.advisory?.[0].detail, "엣지 미커버");
    const args = fs.readFileSync(path.join(root, "args.txt"), "utf8");
    assert.match(args, /^exec$/m);
    assert.match(args, /^critic$/m);
    assert.match(args, /--output-schema/);
    assert.equal(fs.readFileSync(path.join(root, "prompt.txt"), "utf8"), "AC 목록과 diff 원문");
  });

  it("AC-8: SDD_CROSS_REVIEW=off → 생략(비활성화), codex를 부르지 않는다", () => {
    process.env.SDD_CROSS_REVIEW = "off";
    process.env.STUB_ARGS_FILE = path.join(root, "args.txt");
    const r = runCrossReview({ prompt: "x" });
    assert.equal(r.status, "skipped");
    assert.match(r.skipReason!, /비활성화/);
    assert.ok(!fs.existsSync(path.join(root, "args.txt")), "codex가 호출되지 않아야 한다");
  });

  it("AC-3: codex 미설치 → 생략(미설치 안내)", () => {
    process.env.CODEX_BIN = path.join(root, "no-such-codex");
    const r = runCrossReview({ prompt: "x" });
    assert.equal(r.status, "skipped");
    assert.match(r.skipReason!, /codex 미설치/);
  });

  it("AC-4: critic 프로필 부재 → 원인 중립적 사유(레지스트리 확인 포함)", () => {
    fs.rmSync(path.join(codexHome, "critic.config.toml"));
    const r = runCrossReview({ prompt: "x" });
    assert.equal(r.status, "skipped");
    assert.match(r.skipReason!, /레지스트리.*agents-deploy/);
  });

  it("회귀(첫 도그푸드 blocking): 레지스트리에서 critic을 지웠는데 낡은 프로필이 남아 있으면 실행하지 않는다", () => {
    // 레지스트리에는 다른 페르소나만 있고 critic 없음 + 프로필은 잔존(스테일)
    fs.rmSync(path.join(root, "agents", "critic.md"));
    fs.writeFileSync(
      path.join(root, "agents", "worker.md"),
      "---\nname: worker\ndescription: w\ntargets:\n  claude:\n    model: sonnet\n---\n지침.\n",
    );
    process.env.STUB_ARGS_FILE = path.join(root, "args.txt");
    const r = runCrossReview({ prompt: "x" });
    assert.equal(r.status, "skipped");
    assert.match(r.skipReason!, /레지스트리에 없음/);
    assert.ok(!fs.existsSync(path.join(root, "args.txt")), "스테일 프로필로 codex가 돌면 안 된다");
  });

  it("부트스트랩: 레지스트리가 비어 있으면 프로필 확인으로 폴백해 진행한다", () => {
    fs.rmSync(path.join(root, "agents", "critic.md"));
    process.env.STUB_MODE = "ok";
    process.env.STUB_PAYLOAD = '{"verdict":"pass","blocking":[],"advisory":[]}';
    const r = runCrossReview({ prompt: "x" });
    assert.equal(r.status, "ok");
  });

  it("AC-5: 스키마 불준수 산출 → 생략(해석 실패)", () => {
    process.env.STUB_MODE = "bad";
    const r = runCrossReview({ prompt: "x" });
    assert.equal(r.status, "skipped");
    assert.match(r.skipReason!, /해석 실패/);
  });

  it("AC-7 계열: 비정상 종료 → 생략(호출 실패) — throw하지 않는다", () => {
    process.env.STUB_MODE = "fail";
    const r = runCrossReview({ prompt: "x" });
    assert.equal(r.status, "skipped");
    assert.match(r.skipReason!, /호출 실패/);
  });

  it("회귀(Claude 크리틱 중대): 비숫자 timeout env가 크래시가 아니라 기본값으로 폴백한다(FR-7)", () => {
    process.env.SDD_CROSS_REVIEW_TIMEOUT_MS = "300s"; // 사용자 오타 — 이전엔 NaN→spawnSync RangeError
    process.env.STUB_MODE = "ok";
    process.env.STUB_PAYLOAD = '{"verdict":"pass","blocking":[],"advisory":[]}';
    const r = runCrossReview({ prompt: "x" });
    assert.equal(r.status, "ok", `크래시 없이 기본 timeout으로 진행해야 한다: ${JSON.stringify(r)}`);
  });

  it("회귀: 빈 문자열 timeout env도 기본값(1초 아님)으로 폴백한다", () => {
    process.env.SDD_CROSS_REVIEW_TIMEOUT_MS = ""; // Number("")===0 — 이전 로직이면 1초로 강제돼 상시 시간초과
    process.env.STUB_MODE = "ok";
    process.env.STUB_PAYLOAD = '{"verdict":"pass","blocking":[],"advisory":[]}';
    const r = runCrossReview({ prompt: "x" });
    assert.equal(r.status, "ok");
  });

  it("시간 초과 → 생략(시간 초과)", () => {
    process.env.STUB_MODE = "slow";
    process.env.SDD_CROSS_REVIEW_TIMEOUT_MS = "1000";
    const r = runCrossReview({ prompt: "x" });
    assert.equal(r.status, "skipped");
    assert.match(r.skipReason!, /시간 초과/);
  });
});

describe("cross-review-cli (localmind-review, FR-7 비차단)", () => {
  it("성공 경로 --json이 산출 계약(AC-2)을 그대로 반환한다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-crcli-ok-"));
    try {
      const stubBin = path.join(root, "codex");
      fs.writeFileSync(
        stubBin,
        `#!/bin/sh
if [ "$1" = "--version" ]; then echo stub; exit 0; fi
out=""; prev=""
for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done
cat > /dev/null
printf '%s' '{"verdict":"advise","blocking":[],"advisory":[{"category":"coverage","detail":"엣지"}]}' > "$out"
`,
      );
      fs.chmodSync(stubBin, 0o755);
      const codexHome = path.join(root, "dot-codex");
      fs.mkdirSync(codexHome, { recursive: true });
      fs.writeFileSync(path.join(codexHome, "critic.config.toml"), 'model = "gpt-5.5"\n');
      const agentsDir = path.join(root, "agents");
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(path.join(agentsDir, "critic.md"), CRITIC_DEF);
      const out = execFileSync("node", ["--import", "tsx/esm", "src/agents/cross-review-cli.ts", "--json"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        input: "리뷰 프롬프트",
        env: { ...process.env, CODEX_BIN: stubBin, LOCALMIND_CODEX_HOME: codexHome, LOCALMIND_AGENTS_DIR: agentsDir },
      });
      const j = JSON.parse(out);
      assert.equal(j.status, "ok");
      assert.equal(j.backend, "codex");
      assert.equal(j.model, "gpt-5.5");
      assert.equal(j.advisory[0].category, "coverage");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("어떤 모드에서도 exit 0이고, --json은 구조화 결과를 반환한다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-crcli-"));
    try {
      // codex 미설치 환경(전제 실패 경로)에서도 exit 0 — 비차단 계약
      const env = { ...process.env, CODEX_BIN: path.join(root, "none"), LOCALMIND_CODEX_HOME: root };
      const out = execFileSync("node", ["--import", "tsx/esm", "src/agents/cross-review-cli.ts", "--json"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        input: "리뷰 프롬프트",
        env,
      });
      const j = JSON.parse(out);
      assert.equal(j.status, "skipped");
      assert.match(j.skipReason, /codex 미설치/);

      const empty = execFileSync("node", ["--import", "tsx/esm", "src/agents/cross-review-cli.ts"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        input: "",
        env,
      });
      assert.match(empty, /리뷰 프롬프트가 비어 있음/);

      // 회귀(FR-7): 잘못된 env 값으로도 CLI는 exit 0 — execFileSync가 throw하지 않으면 exit 0
      const badEnv = execFileSync("node", ["--import", "tsx/esm", "src/agents/cross-review-cli.ts", "--json"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        input: "프롬프트",
        env: { ...env, SDD_CROSS_REVIEW_TIMEOUT_MS: "abc" },
      });
      assert.equal(JSON.parse(badEnv).status, "skipped"); // 미설치 경로지만 크래시 없이 구조화 결과
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
