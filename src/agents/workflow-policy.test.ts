/**
 * 워크플로 policy·activation 계약 테스트.
 * AC-9(goal-ready), AC-10(goal-impl), AC-11(sdd-self-review) characterization +
 * execution-grant 판정 + invocation-control metadata + enforcement-level 정직성.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateActivation,
  claudeInvocationFrontmatter,
  codexPolicyYaml,
  enforcementFor,
  verifyConfirmation,
  type Challenge,
} from "./workflow-policy.js";
import { loadSkillRegistry, scanPackagedNeutrality, type WorkflowPolicy } from "./skill-contract.js";

const TEMPLATES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "templates", "skills");
const REPO_ROOT = path.resolve(TEMPLATES, "..", "..");
function flatBody(name: string): string {
  return fs.readFileSync(path.join(TEMPLATES, name, "SKILL.md"), "utf8").replace(/\s+/g, " ");
}
function has(name: string, ...phrases: string[]) {
  const flat = flatBody(name);
  for (const p of phrases) {
    assert.ok(flat.includes(p.replace(/\s+/g, " ")), `${name} 본문에 "${p}" 누락`);
  }
}
/** AGENTS.md·docs/workflows.md·templates/agents/critic.md 등 templates/skills 밖 파일 로더(specs/202607201059 AC-5).
 *  마크다운 blockquote(`> `) 줄바꿈 접두는 문장을 끊어놓으므로 whitespace 정규화 전에 제거한다. */
function flatFile(relPath: string): string {
  const raw = fs.readFileSync(path.join(REPO_ROOT, relPath), "utf8");
  return raw
    .split("\n")
    .map((line) => line.replace(/^>\s?/, ""))
    .join("\n")
    .replace(/\s+/g, " ");
}
function hasIn(relPath: string, ...phrases: string[]) {
  const flat = flatFile(relPath);
  for (const p of phrases) {
    assert.ok(flat.includes(p.replace(/\s+/g, " ")), `${relPath} 본문에 "${p}" 누락`);
  }
}
const policyOf = (name: string): WorkflowPolicy => {
  const reg = loadSkillRegistry(TEMPLATES, { packaged: true });
  return reg.skills.find((s) => s.name === name)!.policy!;
};

describe("goal-ready-contract: AC-9", () => {
  it("활성화 판정: 인용/부정/설명/리뷰-only/모호는 확인 전 mutation 0", () => {
    has(
      "goal-ready",
      "명시적으로 호출",
      "인용·부정·설명·리뷰 맥락",
      "파일·도구를 전혀 건드리지 않고",
      "확인 전에는 진행하지 않는다",
    );
  });
  it("맥락 읽기 + pre-draft Live-Verify", () => {
    has("goal-ready", "AGENTS.md", "기존 `specs/`", "문서 초안을 쓰기 전에", "실시간으로 조회", "Open question");
  });
  it("인터뷰어 역할 질문은 현재 세션이 수행", () => {
    has("goal-ready", "인터뷰어(interviewer)", "현재 세션이", "사용자에게 직접 묻는다");
  });
  it("중립적 지속 결정 기록 + fallback 사유", () => {
    has("goal-ready", "결정 로그(decision-log)", "지속적 기록 능력", "지속 기록을 하지 못한 사유", "특정 도구 이름을 전제하지 않는다");
  });
  it("네 문서(goal/spec/plan/tasks) + timestamp 프리픽스 + 조건부 design/SSoT gate", () => {
    has("goal-ready", "goal.md·spec.md·plan.md·tasks.md", "YYYYMMDDHHmm", "디자인 사전 정의", "실제로 존재하는", "없는 문서를 필수라고 추측하지 않는다");
  });

  // 구 "최댓값 + 1" 자리를 대체하는 **규칙** 핀(형식 문자열이 아니라 규칙 — 사라지면 red).
  it("폴더 생성 규칙: 덮어쓰기 금지 + 배타적 생성 + 시각 재독 재시도 + 프리픽스 모호성 한계", () => {
    has("goal-ready", "덮어쓰지 않는다", "`mkdir`(`-p` 금지)", "EEXIST", "현재 시각을 다시 읽어", "YYYYMMDDHHmmss");
    // mkdir이 경로 충돌만 막는다는 정직한 한계 표기(중대-A) — 프리픽스는 유일하지 않을 수 있다.
    has("goal-ready", "프리픽스는 유일하지 않을 수 있다");
    assert.ok(!flatBody("goal-ready").includes("최댓값 + 1"), "구 max+1 규칙 부재");
  });
  it("역할 위임 + 크리틱 fallback(비독립 표기)", () => {
    has("goal-ready", "역할 + 과제 + 기대 산출물", "크리틱(critic)", "독립(independent) 검토라고 부르지 않는다");
  });
  it("feedback 반영→재검→재확인 + truthful next invocation + 구현/커밋 금지", () => {
    has(
      "goal-ready",
      "정확한 호출 방법",
      "문서 반영 → 크리틱 재검 → 재확인 루프",
      "확인 전에는 구현하지 않는다",
      "commit/push하지 않는다",
    );
  });
  it("goal-ready는 중립성 clean", () => {
    const reg = loadSkillRegistry(TEMPLATES, { packaged: true });
    assert.equal(scanPackagedNeutrality(reg.skills.find((s) => s.name === "goal-ready")!).length, 0);
  });
});

describe("goal-impl-contract: AC-10", () => {
  const challenge: Challenge = { nnn: "044", token: "lm-confirm-abc123", issuedTurn: 5 };

  it("runtime-attested explicit + exact 3자리 → runtime-attested grant", () => {
    const d = evaluateActivation({ attestedExplicit: true, rawArgs: "044" });
    assert.deepEqual(d, { grant: true, branch: "runtime-attested", nnn: "044" });
  });

  // R1-10: raw args 전체가 정확히 3자리여야 한다 — 앞뒤 공백은 grant가 아니다(trim 금지).
  it("앞뒤 공백이 있는 원인자는 grant가 아니다(exact 3자리만)", () => {
    for (const raw of [" 044 ", "044 ", " 044", "\t044", "044\n"]) {
      const d = evaluateActivation({ attestedExplicit: true, rawArgs: raw });
      assert.equal(d.grant, false, `"${JSON.stringify(raw)}"는 grant면 안 됨`);
    }
  });

  // 2026-07-17: spec 폴더 프리픽스가 timestamp(YYYYMMDDHHmm, 같은 분 충돌 시 초까지 = 14자리)로
  // 전환됐다. 레거시 3자리도 계속 grant다(기존 NNN- 폴더 매칭).
  it("runtime-attested explicit + timestamp 프리픽스(12·14자리) → runtime-attested grant", () => {
    for (const raw of ["202607172120", "20260717212045"]) {
      const d = evaluateActivation({ attestedExplicit: true, rawArgs: raw });
      assert.deepEqual(d, { grant: true, branch: "runtime-attested", nnn: raw }, `${raw}는 grant여야 함`);
    }
  });

  it("timestamp 프리픽스도 앞뒤 공백·복수 인자는 grant 아님(exact match)", () => {
    for (const raw of [" 202607172120", "202607172120 ", "202607172120 202607172121", '"202607172120"', "explain 202607172120"]) {
      const d = evaluateActivation({ attestedExplicit: true, rawArgs: raw });
      assert.equal(d.grant, false, `"${raw}"는 grant면 안 됨`);
    }
  });

  it("attested라도 인용/부정/설명/리뷰-only/누락/자릿수 미달·초과/복수 인자는 grant 아님", () => {
    // 3(레거시)·12·14자리만 유효 — 그 사이/바깥 자릿수는 프리픽스가 아니다.
    for (const raw of ['"044"', "not 044", "044 아님", "044 설명만", "explain 044", "review 044 only", "", "44", "0444", "044 045", "044 please", "20260717212", "2026071721204", "202607172120456"]) {
      const d = evaluateActivation({ attestedExplicit: true, rawArgs: raw });
      assert.equal(d.grant, false, `"${raw}"는 grant면 안 됨`);
      assert.equal((d as { action: string }).action, "reject");
    }
  });

  it("provenance 부재 + timestamp 프리픽스 → challenge 발급(side effect 금지)", () => {
    const d = evaluateActivation({ attestedExplicit: false, rawArgs: "202607172120", currentTurn: 5 });
    assert.deepEqual(d, { grant: false, action: "issue-challenge", nnn: "202607172120", challengeTurn: 5 });
  });

  it("provenance 부재 + timestamp 프리픽스: 바로 다음 턴의 exact confirmation만 grant", () => {
    const ch: Challenge = { nnn: "202607172120", token: "lm-confirm-ts01", issuedTurn: 5 };
    const ok = evaluateActivation({
      attestedExplicit: false,
      rawArgs: "202607172120",
      currentTurn: 6,
      priorChallenge: ch,
      confirmationResponse: "lm-confirm-ts01 202607172120",
    });
    assert.deepEqual(ok, { grant: true, branch: "fresh-confirmation", nnn: "202607172120", consumeChallengeToken: "lm-confirm-ts01" });
  });

  it("provenance 부재 + 유효 번호 + 확인 없음 → challenge 발급(side effect 금지)", () => {
    const d = evaluateActivation({ attestedExplicit: false, rawArgs: "044", currentTurn: 5 });
    assert.deepEqual(d, { grant: false, action: "issue-challenge", nnn: "044", challengeTurn: 5 });
  });

  it("provenance 부재: 바로 다음 턴의 exact confirmation만 fresh-confirmation grant", () => {
    const ok = evaluateActivation({ attestedExplicit: false, rawArgs: "044", currentTurn: 6, priorChallenge: challenge, confirmationResponse: "lm-confirm-abc123 044" });
    assert.deepEqual(ok, { grant: true, branch: "fresh-confirmation", nnn: "044", consumeChallengeToken: "lm-confirm-abc123" });
  });

  // R1-10: 바로 앞 턴이 아니면(낡음) grant 아님.
  it("바로 앞 턴이 아닌 확인 문구는 거부(immediately-previous만)", () => {
    const d = evaluateActivation({ attestedExplicit: false, rawArgs: "044", currentTurn: 8, priorChallenge: challenge, confirmationResponse: "lm-confirm-abc123 044" });
    assert.equal(d.grant, false, "issuedTurn 5, currentTurn 8 → 낡음");
  });

  // R1-10: currentTurn이 없으면 최신성(immediately-previous)을 검증할 수 없으므로 fail-closed로 거부한다.
  it("currentTurn 없이(최신성 검증 불가) 정답 확인 문구여도 grant 아님(fail-closed)", () => {
    const ancient: Challenge = { nnn: "044", token: "lm-confirm-abc123", issuedTurn: 1 };
    const d = evaluateActivation({ attestedExplicit: false, rawArgs: "044", priorChallenge: ancient, confirmationResponse: "lm-confirm-abc123 044" });
    assert.equal(d.grant, false, "currentTurn 없으면 freshness 미검증 → 무한 재사용 방지(fail-closed)");
    // 같은 챌린지를 반복 호출해도 계속 거부(replay 방지)
    const d2 = evaluateActivation({ attestedExplicit: false, rawArgs: "044", priorChallenge: ancient, confirmationResponse: "lm-confirm-abc123 044" });
    assert.equal(d2.grant, false);
  });

  // R1-10: 한 번 사용된 확인 문구는 재사용 불가(one-time).
  it("이미 소비된 확인 문구는 재사용 거부(one-time)", () => {
    const d = evaluateActivation({
      attestedExplicit: false,
      rawArgs: "044",
      currentTurn: 6,
      priorChallenge: challenge,
      confirmationResponse: "lm-confirm-abc123 044",
      consumedChallengeTokens: new Set(["lm-confirm-abc123"]),
    });
    assert.equal(d.grant, false, "consumed token은 재사용 불가");
  });

  it("stale/replayed/mismatched confirmation은 거부", () => {
    for (const resp of ["wrong-token 044", "lm-confirm-abc123 045", "lm-confirm-OLD 044", "044", "confirm", "lm-confirm-abc123 044 "]) {
      const d = evaluateActivation({ attestedExplicit: false, rawArgs: "044", currentTurn: 6, priorChallenge: challenge, confirmationResponse: resp });
      assert.equal(d.grant, false, `"${resp}"는 grant면 안 됨`);
    }
    assert.ok(verifyConfirmation(challenge, "lm-confirm-abc123 044"));
    assert.ok(!verifyConfirmation(challenge, "lm-confirm-abc123 044 extra"));
    assert.ok(!verifyConfirmation(challenge, "lm-confirm-abc123 044 "), "trailing 공백도 불일치(trim 금지)");
    assert.ok(!verifyConfirmation(challenge, " lm-confirm-abc123 044"), "leading 공백도 불일치");
  });

  it("provenance 부재 + 무효 번호 + 확인 없음 → reject(challenge 아님)", () => {
    const d = evaluateActivation({ attestedExplicit: false, rawArgs: "not a number" });
    assert.equal((d as { action: string }).action, "reject");
  });

  it("Claude/Codex deny-implicit metadata는 explicit workflow에만", () => {
    assert.deepEqual(claudeInvocationFrontmatter(policyOf("goal-impl")), { "disable-model-invocation": true });
    assert.deepEqual(claudeInvocationFrontmatter(policyOf("goal-ready")), {});
    assert.deepEqual(claudeInvocationFrontmatter(policyOf("sdd-self-review")), {});

    const yaml = codexPolicyYaml("goal-impl", policyOf("goal-impl"), "deadbeef");
    assert.match(yaml!, /allow_implicit_invocation: false/);
    assert.match(yaml!, /managed-by: localmind \(skill: goal-impl\)/);
    assert.match(yaml!, /source-payload-sha256: deadbeef/);
    assert.equal(codexPolicyYaml("goal-ready", policyOf("goal-ready"), "x"), null);
  });

  it("enforcement level 정직성: Claude/Codex runtime-enforced, Gemini instruction-level, 그 외 not-applicable", () => {
    const impl = policyOf("goal-impl");
    assert.equal(enforcementFor("claude-skill", impl), "runtime-enforced");
    assert.equal(enforcementFor("agent-skill", impl), "runtime-enforced");
    assert.equal(enforcementFor("gemini-command", impl), "instruction-level");
    assert.equal(enforcementFor("claude-skill", policyOf("goal-ready")), "not-applicable");
  });

  it("goal-impl은 중립성 clean(AC-2 특성화, specs/051)", () => {
    const reg = loadSkillRegistry(TEMPLATES, { packaged: true });
    assert.equal(scanPackagedNeutrality(reg.skills.find((s) => s.name === "goal-impl")!).length, 0);
  });

  it("핵심 절 앵커 존재 — 끊김 방어·tasks 재사용 금지·TDD/RED·중단 규율·DoD·보고(AC-5, specs/051)", () => {
    has(
      "goal-impl",
      "끊김 방어",
      "재작성·재분해 금지",
      "TDD 강제",
      "RED 확인 생략 금지",
      "중단 규율",
      "DoD",
      "보고·정직",
    );
  });

  it("활성화 게이트 정직 표기 — provenance·프리픽스 정규식·challenge·instruction-level(AC-3, specs/051)", () => {
    // SKILL.md의 선언 정규식은 코드(PREFIX_RE)와 정확히 같은 집합이어야 한다 — 12·14자리만(13은 없다).
    has("goal-impl", "provenance", "^(?:[0-9]{12}|[0-9]{14})$", "^[0-9]{3}$", "일회용 확인 문구(challenge)", "지침 수준(instruction-level)");
  });

  it("canonical body: activation contract + AGENTS SSoT + TDD + self-review + evidence + completion + honesty", () => {
    has(
      "goal-impl",
      "일회용 확인 문구(challenge)",
      "spec 폴더 프리픽스",
      "최우선 정본으로 읽는다",
      "실패 테스트 먼저(red)",
      "독립(적대적) 리뷰를 돌린다",
      "전 AC green",
      "완료(commit/push/PR/CI)는 저장소 AGENTS.md 규약대로",
      "지침 수준(instruction-level)의",
      "프롬프트에 명령 문자열이나 생성된 요청 텍스트가 있다는 사실 자체도 권한이 아니다",
      "요구한 번호의 goal/spec/plan 세 문서 중 하나라도 없으면 구현 전에 멈추고",
    );
  });
});

describe("self-review-contract: AC-11", () => {
  it("활성화: explicit 또는 authorized current-turn delegation만, 그 외 중단", () => {
    has("sdd-self-review", "명시적 호출", "권한 있는 SDD 구현 워크플로가 같은 턴에 내부 위임", "그 밖의 암시적·인용·부정 매치이면 중단");
  });
  it("report-only: mutation 0회", () => {
    has("sdd-self-review", "finding 보고만", "0회");
  });
  it("mandatory critic + isolated 우선 + main fallback not-independent", () => {
    has("sdd-self-review", "적대적 크리틱(critic) 검토는 필수", "격리 리뷰 능력이 있으면 반드시", "우선 사용", "독립(independent) 검토라고 부르지 않는다");
  });
  it("additional cross-runtime available/unavailable을 숨기지 않음", () => {
    has("sdd-self-review", "추가 독립 검토 능력", "실패·미설치·시간 초과", "추가 검토가 없더라도");
  });
  it("독립성 상태 세 값 + false cross 금지 + 소유 경계", () => {
    has(
      "sdd-self-review",
      "`isolated-context`",
      "`cross-runtime`",
      "`main-session-fallback`",
      "수행하지 않은 교차 검토를 수행했다고 쓰지 않으며",
      "최종 commit은 SDD 구현 워크플로가 소유",
    );
  });
  it("concrete adapter 이름(localmind-review) 없음 — 중립성 clean", () => {
    const reg = loadSkillRegistry(TEMPLATES, { packaged: true });
    assert.equal(scanPackagedNeutrality(reg.skills.find((s) => s.name === "sdd-self-review")!).length, 0);
  });
});

describe("deep-research policy contract: AC-1, AC-3", () => {
  it("production policy는 exact explicit/report-only이며 docs-only/mutating으로 완화되지 않는다", () => {
    const policy = policyOf("deep-research");
    assert.deepEqual(policy, { activation: "explicit", sideEffects: "report-only" });
    assert.notEqual(policy.sideEffects, "docs-only");
    assert.notEqual(policy.sideEffects, "mutating");
  });

  it("explicit policy가 Claude deny-implicit metadata를 정확히 생성한다", () => {
    const metadata = claudeInvocationFrontmatter(policyOf("deep-research"));
    assert.deepEqual(metadata, { "disable-model-invocation": true });
    assert.equal(Object.keys(metadata).length, 1, "Claude invocation-control 키 중복/추가 금지");
  });

  it("explicit policy가 Codex allow_implicit_invocation:false를 정확히 1회 생성한다", () => {
    const yaml = codexPolicyYaml("deep-research", policyOf("deep-research"), "deadbeef");
    assert.ok(yaml, "explicit workflow는 Codex policy metadata가 필요하다");
    assert.equal((yaml.match(/allow_implicit_invocation:\s*false/g) ?? []).length, 1);
    assert.doesNotMatch(yaml, /allow_implicit_invocation:\s*true/);
    assert.match(yaml, /managed-by: localmind \(skill: deep-research\)/);
    assert.match(yaml, /source-payload-sha256: deadbeef/);
  });

  it("명시 활성화 enforcement는 Claude/Codex runtime-enforced, generated wrapper는 instruction-level이다", () => {
    const policy = policyOf("deep-research");
    assert.equal(enforcementFor("claude-skill", policy), "runtime-enforced");
    assert.equal(enforcementFor("agent-skill", policy), "runtime-enforced");
    assert.equal(enforcementFor("gemini-command", policy), "instruction-level");
  });
});

describe("research-evidence-pack policy contract: AC-5", () => {
  it("별도 workflow는 exact explicit/docs-only이고 runtime별 deny-implicit metadata를 생성한다", () => {
    const reg = loadSkillRegistry(TEMPLATES, { packaged: true });
    const skill = reg.skills.find((candidate) => candidate.name === "research-evidence-pack");
    assert.ok(skill, "research-evidence-pack package/catalog entry missing");
    assert.ok(skill.policy, "research-evidence-pack manifest policy missing");
    const policy = skill.policy;
    assert.deepEqual(policy, { activation: "explicit", sideEffects: "docs-only" });
    assert.deepEqual(claudeInvocationFrontmatter(policy), { "disable-model-invocation": true });
    const yaml = codexPolicyYaml("research-evidence-pack", policy, "deadbeef");
    assert.ok(yaml, "explicit evidence pack workflow는 Codex policy metadata가 필요하다");
    assert.equal((yaml.match(/allow_implicit_invocation:\s*false/g) ?? []).length, 1);
    assert.equal(enforcementFor("claude-skill", policy), "runtime-enforced");
    assert.equal(enforcementFor("agent-skill", policy), "runtime-enforced");
    assert.equal(enforcementFor("gemini-command", policy), "instruction-level");
  });
});

// ── 변경 등급 티어링 + critic 콜드리드 캐싱 계약 (specs/202607201059 AC-5~13,15,17) ──

describe("tier-contract: AC-5 — 티어별 의식 매핑 정합(AGENTS.md ↔ goal-ready ↔ goal-impl)", () => {
  it("AGENTS.md 정본이 세 티어의 문서·critic 강도를 명문화한다", () => {
    hasIn(
      "AGENTS.md",
      "경량 단일 문서 `change.md`(why·what·AC·티어 근거)",
      "in-session** 적대 자기검증 1라운드, diff 스코프",
      "현행 goal/spec/plan/tasks 4문서(아래 규약대로)",
      "적대 critic, self-review 자동 2라운드 상한",
    );
  });
  it("goal-ready가 같은 매핑(Tier 1 change.md lane / Tier 2 4문서)을 따른다", () => {
    has("goal-ready", "경량 단일 문서 `change.md` lane", "이 워크플로의 나머지 단계(3~15)를 그대로 진행", "goal/spec/plan/tasks 네 문서를 만든다");
  });
  it("goal-impl이 같은 매핑(Tier 1 in-session 1라운드 / Tier 2 격리 2라운드)을 따른다", () => {
    has(
      "goal-impl",
      "in-session 적대 자기검증 1라운드",
      "격리 위임 없이 현재 세션이 결함을 찾으러 가는 자세로 diff 스코프를",
      "격리 self-review 자동 2라운드 상한",
    );
  });
});

describe("tier-contract: AC-6 — Tier 1도 TDD 유지, 테스트 생략은 Tier 0에만", () => {
  it("AGENTS.md 정본 문구", () => {
    hasIn("AGENTS.md", "Tier 1 문서·구현도 **TDD**(AC↔테스트 1:1)를 유지한다", "테스트 생략은 Tier 0에만** 허용된다");
  });
  it("goal-ready에도 같은 규율이 명시된다", () => {
    has("goal-ready", "Tier 1도 **TDD를 유지**한다(AC↔테스트 1:1)", "테스트 생략은 Tier 0에만** 허용되며 Tier 1에서는 허용되지 않는다");
  });
});

describe("tier-contract: AC-7 — 티어 판정 근거 기록", () => {
  it("AGENTS.md가 판정 근거를 산출물에 기록하도록 요구한다", () => {
    hasIn("AGENTS.md", "근거(어느 트리거로 어느 티어인지)를 산출물에 기록");
  });
  it("goal-ready가 사용자 보고와 산출물(change.md의 티어 근거 절)에 남기도록 요구한다", () => {
    has("goal-ready", "판정 근거(어느 트리거로 어느 티어인지)를 사용자 보고와 산출물", "티어 근거");
  });
});

describe("tier-contract: AC-8 — 중간 승격(하향 금지)", () => {
  it("AGENTS.md·goal-impl 모두 상위 티어 하드 신호 발견 시 승격 + 하향 재분류 금지를 명시한다", () => {
    hasIn("AGENTS.md", "상위 티어로", "승격**하고 승격 사실·추가 의식을 보고한다", "하향 재분류는 하지 않는다");
    has("goal-impl", "상위 티어로 승격**하고 승격 사실과 추가 의식", "하향 재분류는 하지 않는다");
  });
});

describe("tier-contract: AC-9 — critic 조사 지도 스코프(matrix-as-map)", () => {
  it("sdd-self-review·critic 모두 matrix 행을 AC↔코드 지도로 명시한다", () => {
    has("sdd-self-review", "AC↔코드·evidence 대응을 조사 지도(map)", "로 물려받아");
    hasIn("templates/agents/critic.md", "matrix 활용", "각 행을 AC↔코드", "조사 지도(map)", "삼아");
  });
});

describe("tier-contract: AC-10 — 독립성 가드레일 문구(도장찍기 금지)", () => {
  it("sdd-self-review와 critic.md 모두 실제 코드 검증 + 상태 셀만으로 통과 금지를 명시한다", () => {
    has("sdd-self-review", "각 행을 실제 코드로", "검증**하며", "matrix 상태 셀(구현자가 채운 주장)만으로 통과시키지 않는다", "도장찍기 금지");
    hasIn(
      "templates/agents/critic.md",
      "각 행을 실제 코드로 검증**한다",
      "matrix 상태 셀(구현자가 채운 주장)만으로 통과시키지 않는다",
      "도장찍기 금지",
    );
  });
});

describe("tier-contract: AC-11 — 라운드 전환 시 전량 재검증(보수형)", () => {
  it("sdd-self-review·goal-impl 모두 전량 재검증 + verdict 승계·행 스킵 없음을 명시한다", () => {
    has("sdd-self-review", "모든 matrix 행을 전량 재검증**한다", "verdict 승계·행 스킵은 하지 않는다");
    has("goal-impl", "모든 verification matrix 행을 전량 재검증**한다", "verdict 승계·행 스킵은 하지 않는다");
  });
});

describe("tier-contract: AC-12 — per-round 독립성 보존 + map은 통과근거 아님 + 적극형 미도입", () => {
  it("sdd-self-review가 map만 재사용·적극형 미도입을 명시한다", () => {
    has("sdd-self-review", "재사용되는 것은 **검증 결과가 아니라 map뿐**이다", "round-to-round 무효화-스킵(적극형)은", "도입하지 않는다");
  });
  it("goal-impl이 map은 통과 근거가 아님·적극형 미도입을 명시한다", () => {
    has("goal-impl", "map은 \"어디를 보라\"만 정할 뿐 통과 근거가 아니다", "round-to-round 무효화-스킵(적극형");
    has("goal-impl", "이 워크플로에 도입하지 않는다");
  });
});

describe("tier-contract: AC-13 — map 재사용 범위(within-run only)", () => {
  it("AGENTS.md·sdd-self-review 모두 within-run 유효·cross-session 금지를 명시한다", () => {
    hasIn("AGENTS.md", "within-run(한 goal-impl 실행 내)", "cross-session) map 재사용은 금지");
    has("sdd-self-review", "within-run(한 goal-impl 실행 내)", "cross-session) map 재사용은 금지");
  });
});

describe("tier-contract: AC-15 — Tier 2 품질 규율 불변", () => {
  it("AGENTS.md가 전 AC green·도그푸드·격리 critic·PR 게이트·Live-Verify를 불변으로 묶어 명시한다", () => {
    hasIn(
      "AGENTS.md",
      "Tier 2 품질 규율(전 AC green·필수 도그푸드·격리 적대 critic·PR",
      "게이트·Live-Verify)을 문구·의미상 약화하지 않는다",
    );
  });
  it("goal-impl 자체 DoD에도 전 AC green·필수 도그푸드가 그대로 있다", () => {
    has("goal-impl", "전 AC green** — spec의 모든 AC가", "도그푸드(필수)** — 테스트 green만으로 완료가 아니다");
  });
});

describe("tier-contract: AC-17 — docs/workflows.md 사용자 대면 parity", () => {
  const AGENTS_FLAT = flatFile("AGENTS.md");
  const DOCS_FLAT = flatFile("docs/workflows.md");

  it("세 티어 lane이 평이한 한국어로 설명되어 있다(Tier 0/1/2 + change.md + escalate)", () => {
    hasIn(
      "docs/workflows.md",
      "Tier 0(트리비얼)",
      "Tier 1(작음)",
      "Tier 2(실질적)",
      "change.md",
      "판단이 애매할 때는 **항상 더 무거운 등급 쪽으로** 올립니다",
    );
  });

  it("instruction-level 같은 개발자 전용 표기 없이 사람말로 같은 취지를 설명한다", () => {
    assert.ok(!DOCS_FLAT.includes("instruction-level"), "docs/workflows.md에 비개발자 대상 부적합 영어 전문용어가 남음");
    hasIn("docs/workflows.md", "세션이 매번 읽고 사람이 검토하듯 적용");
  });

  // 하드 신호의 AGENTS.md ↔ docs/workflows.md 대응표. "·"는 목록 구분자이자 "인증·보안"류
  // 복합어 내부 연결자로도 쓰여 순수 split만으로는 토큰 경계를 못 잡는다 — 그래서 원문에서
  // 직접 파싱한 **개별 나열 단위** 개수(split("·") 결과)와 이 표의 길이가 어긋나면(신호
  // 추가/삭제인데 문서 미갱신) 먼저 실패하도록, split 결과 하나하나에 대응 항목을 둔다.
  it("AGENTS.md 하드 신호 목록과 docs/workflows.md Tier 2 설명이 누락 없이 대응한다", () => {
    const hardSignalMatch = AGENTS_FLAT.match(/\*\*하드 신호:\*\*\s*(.+?)\.\s*-\s*\*\*escalate-on-doubt/);
    assert.ok(hardSignalMatch, "AGENTS.md에서 하드 신호 목록 문자열을 찾지 못함");
    const parsedSignals = hardSignalMatch![1]
      .split("·")
      .map((s) => s.replace(/\*\*/g, "").trim())
      .filter((s) => s.length > 0);

    // split("·") 결과 토큰 → docs/workflows.md의 사람말 대응 정규식. 토큰 순서·개수는
    // AGENTS.md 원문에서 파싱된 것이므로(하드코딩 아님), 여기 배열 길이가 parsedSignals와
    // 다르면 매핑 자체가 안 맞다는 뜻 — 곧바로 아래 length assert가 잡는다.
    const DOCS_EQUIVALENT: RegExp[] = [
      /새로운 도메인 개념/, // 신규 도메인 개념
      /계약\*\* 변경/, // 계약(API/스키마/이벤트) 변경
      /인증·보안 표면/, // 인증
      /인증·보안 표면/, // 보안 표면
      /마이그레이션/, // 마이그레이션
      /데이터 모델 변경/, // 데이터 모델 변경
      /전역 상태나 직렬화 형식 변경/, // 전역 상태
      /전역 상태나 직렬화 형식 변경/, // 직렬화 형식 변경
      /여러 영역에 걸친 변경/, // 크로스커팅 변경
      /비가역성/, // 비가역성(외부 발행/데이터 파괴/비가역 마이그레이션)
    ];

    assert.equal(
      parsedSignals.length,
      DOCS_EQUIVALENT.length,
      `AGENTS.md 하드 신호 파싱 토큰 개수(${parsedSignals.length})와 대응표 길이(${DOCS_EQUIVALENT.length})가 다름 — ` +
        `AGENTS.md 하드 신호 목록이 바뀌었으면 이 대응표와 docs/workflows.md도 함께 갱신해야 함: ${JSON.stringify(parsedSignals)}`,
    );
    parsedSignals.forEach((signal, i) => {
      assert.match(DOCS_FLAT, DOCS_EQUIVALENT[i], `docs/workflows.md에 하드 신호 "${signal}"의 사람말 설명이 없음(parity 깨짐)`);
    });
  });
});

// ── specs/202607201808 critic 효율화 — 렌즈 병렬·preflight·evidence 스키마 문구 계약 ──

describe("critic-efficiency: AC-1 — 렌즈별 병렬 fan-out", () => {
  it("sdd-self-review가 렌즈 병렬 절차·fallback·round 불변을 명시한다", () => {
    has("sdd-self-review", "렌즈별 격리 리뷰어로 동시 실행", "기본 fallback", "merged report 하나 = round 1개");
  });
});

describe("critic-efficiency: AC-2 — 렌즈 병합 규칙", () => {
  it("sdd-self-review가 dedup·심각도 보수 병합·발견 렌즈 표기를 명시한다", () => {
    has("sdd-self-review", "같은 파일:줄 + 동일 결함 서술", "높은 쪽을 채택", "발견 렌즈를 병기");
  });
});

describe("critic-efficiency: AC-8 — preflight 게이트", () => {
  it("sdd-self-review·goal-impl이 critic 전 preflight·비근거·instruction-level을 명시한다", () => {
    has("sdd-self-review", "critic을 시작하지 않고 기계 수정", "AC의 green 근거도 아니다", "instruction-level");
    has("goal-impl", "review:preflight", "green 근거도 아니다");
  });
});

describe("critic-efficiency: AC-9 — evidence frontmatter 스키마(단일 필드셋)", () => {
  it("템플릿에 필수 7필드·선택 2필드가 있고 스킬 §5가 completion을 포함한다", () => {
    hasIn("templates/sdd/self-review-evidence.template.md", "candidate-id", "approval-needed", "completion", "duration-minutes", "lenses");
    has("sdd-self-review", "`approval-needed`, `completion`", "self-review-evidence.template.md");
  });
});

// ── specs/202607202152-governance-recalibration Phase 3 — 결과 불변식 전환 + 티어 축 명시 ──

describe("governance-recalibration: AC-3 — goal-impl §4·§4A·§5 불변식/권장 기본 2층 구조", () => {
  it("불변식 요약 소절 + 재량 불가 명시 + 권장 기본 표기 + 실행자 재량 문구가 존재한다", () => {
    has(
      "goal-impl",
      "불변식 요약",
      "재량 불가",
      "권장 기본(default recipe)",
      "실행자는 불변식을 지키는 한 수단 재량을 갖는다",
    );
  });
});

describe("governance-recalibration: AC-5 — AGENTS.md 티어 축 명시(비가역성·검증가능성)", () => {
  it("하드 신호에 비가역성이 단일 토큰으로 추가되고 검증가능성 보조 축이 하드 신호 우선으로 명시된다", () => {
    hasIn(
      "AGENTS.md",
      "비가역성(외부 발행/데이터 파괴/비가역 마이그레이션)",
      "**검증가능성**을 판정 보조 축으로 명시한다",
      "하드 신호 해당 시 무효 — 상향 우선 불변",
    );
  });
});
