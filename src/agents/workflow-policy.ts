/**
 * manifest activation/side-effect policy를 runtime invocation-control metadata와 canonical/Gemini
 * activation instruction으로 렌더하고, enforcement level을 정직하게 보고한다 (specs/044 FR-5·FR-8).
 *
 * 핵심 정직성: Claude/Codex의 deny-implicit metadata는 runtime-enforced지만, provenance를 제공하지
 * 않는 runtime(예: 현재 공식 Gemini)의 fresh-confirmation은 instruction-level guard다. 이 renderer가
 * 실제 invocation path에서 선행 실행된다고 가장하지 않는다 — 정적 test는 생성 산출물만 검증하고
 * 실제 model tool-call 0회를 증명한다고 주장하지 않는다.
 */
import { type WorkflowPolicy, skillMarkerText } from "./skill-contract.js";

export type WorkflowTargetId = "canonical-seed" | "claude-skill" | "agent-skill" | "gemini-command";
export type EnforcementLevel = "runtime-enforced" | "instruction-level" | "not-applicable";

/** deny-implicit invocation-control은 activation === "explicit"에만 붙는다(manifest가 요구). */
export function isDenyImplicit(policy: WorkflowPolicy): boolean {
  return policy.activation === "explicit";
}

/** Claude target frontmatter에 추가할 invocation-control 키(explicit workflow만). */
export function claudeInvocationFrontmatter(policy: WorkflowPolicy): Record<string, true> {
  return isDenyImplicit(policy) ? { "disable-model-invocation": true } : {};
}

/**
 * Codex shared target의 `agents/openai.yaml` policy 파일(explicit workflow만). payload fingerprint를
 * comment로 바인딩해 metadata 변조가 package-equivalent로 통과하지 못하게 한다.
 * 경로/필드는 2026-07-12 공식 재확인: `<skill>/agents/openai.yaml`, `policy.allow_implicit_invocation`.
 */
export function codexPolicyYaml(name: string, policy: WorkflowPolicy, payloadHash: string): string | null {
  if (!isDenyImplicit(policy)) return null;
  return [
    `# ${skillMarkerText(name)}`,
    `# source-payload-sha256: ${payloadHash}`,
    "policy:",
    "  allow_implicit_invocation: false",
    "",
  ].join("\n");
}

/** 각 target에서 이 policy의 activation enforcement가 어떤 수준인지 정직하게 보고한다. */
export function enforcementFor(target: WorkflowTargetId, policy: WorkflowPolicy): EnforcementLevel {
  if (!isDenyImplicit(policy)) return "not-applicable";
  switch (target) {
    case "claude-skill":
    case "agent-skill":
      return "runtime-enforced"; // deny-implicit metadata를 runtime이 강제
    case "gemini-command":
      return "instruction-level"; // generated prompt의 확인 지침 — runtime hook 아님
    default:
      return "not-applicable";
  }
}

// ── execution grant 판정(goal-impl activation contract) ────────────────

const NNN_RE = /^[0-9]{3}$/;

/**
 * raw arguments **전체가** 정확히 3자리 숫자일 때만 grant syntax가 valid하다. 앞뒤 공백/개행은
 * trim하지 않는다 — `" 044 "`처럼 둘러싼 공백은 exact match가 아니므로 grant가 아니다(R1-10).
 */
export function validNnn(rawArgs: string): string | null {
  return NNN_RE.test(rawArgs) ? rawArgs : null;
}

export interface Challenge {
  nnn: string;
  token: string;
  /** 챌린지가 발급된 턴 번호 — 확인은 바로 다음 턴(issuedTurn+1)에만 유효하다(R1-10). */
  issuedTurn: number;
}

export interface ActivationInput {
  /** 런타임이 explicit-only activation을 보증하는가(deny-implicit provenance) */
  attestedExplicit: boolean;
  /** 사용자가 넘긴 원인자 문자열(그대로) */
  rawArgs: string;
  /** 현재 턴 번호(확인 branch에서 immediately-previous 판정, challenge 발급 표기) */
  currentTurn?: number;
  /** provenance 없는 runtime: 지난 턴에 발급한 확인 문구(있으면) */
  priorChallenge?: Challenge;
  /** 이번 턴의 확인 응답(있으면) */
  confirmationResponse?: string;
  /** 이미 소비된 challenge token 집합(one-time 재사용 방지) */
  consumedChallengeTokens?: ReadonlySet<string>;
}

export type ActivationDecision =
  | { grant: true; branch: "runtime-attested" | "fresh-confirmation"; nnn: string; consumeChallengeToken?: string }
  | { grant: false; action: "issue-challenge"; nnn: string; challengeTurn: number }
  | { grant: false; action: "reject"; reason: string };

/** 확인 응답이 지난 챌린지와 **정확히**(공백 trim 없이) 일치하는가(stale/replayed/mismatched 거부, R1-10). */
export function verifyConfirmation(challenge: Challenge, response: string): boolean {
  return response === expectedConfirmation(challenge);
}
export function expectedConfirmation(challenge: Challenge): string {
  return `${challenge.token} ${challenge.nnn}`;
}

/**
 * 실행 권한을 판정한다. 두 grant branch만 인정한다:
 * (a) runtime-attested explicit + exact 3자리 NNN, (b) 바로 앞 턴에 발급된, 아직 소비되지 않은
 * challenge에 대한 fresh exact confirmation. 그 외(인용·부정·설명/리뷰 전용·추가/복수 인자·앞뒤 공백·
 * 낡은(immediately-previous 아님)/재사용(consumed) 확인·일반 자연어)는 grant하지 않는다.
 *
 * 이 함수는 정적 characterization이며 실제 runtime hook이 아니다 — provenance 없는 runtime의 확인은
 * 지침 수준(instruction-level) 가드이지 도구 호출 0회를 기술적으로 강제하지 않는다.
 */
export function evaluateActivation(input: ActivationInput): ActivationDecision {
  const nnn = validNnn(input.rawArgs);

  // 확인 응답 branch가 우선(provenance 없는 runtime의 두 번째 턴)
  if (input.priorChallenge && input.confirmationResponse !== undefined) {
    const ch = input.priorChallenge;
    // 바로 앞 턴에 발급된 것만 유효(낡은/미래 챌린지 거부). currentTurn이 없으면 최신성을 검증할 수
    // 없으므로 fail-closed로 거부한다 — 무한 재사용을 막는다(R1-10).
    if (input.currentTurn === undefined || ch.issuedTurn !== input.currentTurn - 1) {
      return { grant: false, action: "reject", reason: "확인 문구의 최신성(바로 앞 턴)을 확인할 수 없거나 낡음 — 권한 없음" };
    }
    // 이미 소비된 challenge는 재사용 불가(one-time).
    if (input.consumedChallengeTokens?.has(ch.token)) {
      return { grant: false, action: "reject", reason: "이미 사용된 확인 문구(재사용 불가) — 권한 없음" };
    }
    if (verifyConfirmation(ch, input.confirmationResponse)) {
      return { grant: true, branch: "fresh-confirmation", nnn: ch.nnn, consumeChallengeToken: ch.token };
    }
    return { grant: false, action: "reject", reason: "낡거나 재사용·불일치하는 확인 문구 — 권한 없음" };
  }

  if (input.attestedExplicit) {
    if (nnn) return { grant: true, branch: "runtime-attested", nnn };
    return { grant: false, action: "reject", reason: "명시 호출이 보증됐지만 원인자가 정확한 3자리 spec 번호가 아님" };
  }

  // provenance 부재 + 확인 응답 없음 → 첫 턴: 유효 번호면 challenge만 발급(side effect 금지)
  if (nnn) return { grant: false, action: "issue-challenge", nnn, challengeTurn: input.currentTurn ?? 0 };
  return { grant: false, action: "reject", reason: "실행 권한 없음(provenance 부재 + 유효한 3자리 번호 없음)" };
}
