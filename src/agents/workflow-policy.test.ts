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
function flatBody(name: string): string {
  return fs.readFileSync(path.join(TEMPLATES, name, "SKILL.md"), "utf8").replace(/\s+/g, " ");
}
function has(name: string, ...phrases: string[]) {
  const flat = flatBody(name);
  for (const p of phrases) {
    assert.ok(flat.includes(p.replace(/\s+/g, " ")), `${name} 본문에 "${p}" 누락`);
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
