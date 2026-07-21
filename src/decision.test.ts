/**
 * decision.ts 단위 테스트 — Decision 도메인 순수 함수 (specs/202607211621-living-memory).
 * AC-1(구조)·AC-3(검증 — 한국어 에러)·AC-7/8/10(낡음 판정 로직). IO 없음.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateDecisionInput,
  buildDecisionFrontmatterLines,
  parseNoteDecision,
  staleAssumptions,
  staleSignalLine,
  staleThresholdDays,
} from "./decision.js";

const NOW = new Date("2026-07-21T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400_000).toISOString();

describe("validateDecisionInput (AC-3)", () => {
  it("정상 입력은 null(에러 없음)을 반환한다", () => {
    assert.equal(
      validateDecisionInput({
        choice: "Auth 2.0 채택",
        why: "표준 성숙도",
        assumptions: [{ fact: "2.0이 현행 최신", volatility: "high" }],
      }),
      null,
    );
  });
  it("assumptions 항목에 volatility가 없으면 평이한 한국어 에러를 낸다", () => {
    const err = validateDecisionInput({
      choice: "x",
      why: "y",
      assumptions: [{ fact: "z" } as never],
    });
    assert.ok(err && /volatility/.test(err) && /high|low/.test(err), `한국어 안내 기대: ${err}`);
    assert.match(err!, /[가-힣]/);
  });
  it("volatility가 high|low 외 값이면 에러", () => {
    const err = validateDecisionInput({
      choice: "x",
      why: "y",
      assumptions: [{ fact: "z", volatility: "medium" as never }],
    });
    assert.ok(err && /[가-힣]/.test(err));
  });
  it("choice만 있고 why가 없으면 에러(결정은 3층 세트)", () => {
    const err = validateDecisionInput({ choice: "x", assumptions: [] } as never);
    assert.ok(err && /[가-힣]/.test(err));
  });
  it("전제 없는 결정(assumptions 생략·빈 배열)은 허용된다", () => {
    assert.equal(validateDecisionInput({ choice: "x", why: "y" }), null);
    assert.equal(validateDecisionInput({ choice: "x", why: "y", assumptions: [] }), null);
  });
});

describe("buildDecisionFrontmatterLines ↔ parseNoteDecision (AC-1 구조)", () => {
  it("type: decision + 3층 구조 + 전제별 last_verified(캡처 시각)가 직렬화된다", () => {
    const lines = buildDecisionFrontmatterLines(
      {
        choice: "Auth 2.0 채택",
        why: "표준 성숙도 \"인용\" 포함",
        assumptions: [
          { fact: "2.0이 현행 최신", volatility: "high" },
          { fact: "개인 가치관", volatility: "low" },
        ],
      },
      "2026-07-21T12:00:00",
    );
    const text = lines.join("\n");
    assert.match(text, /type: decision/);
    // 전체 노트로 조립해 roundtrip 파싱 검증
    const note = ["---", 'title: "t"', "date: 2026-07-21T12:00:00", "tags: []", ...lines, "---", "", "본문"].join("\n");
    const d = parseNoteDecision(note);
    assert.ok(d, "파싱 실패");
    assert.equal(d!.choice, "Auth 2.0 채택");
    assert.match(d!.why, /인용/);
    assert.equal(d!.assumptions.length, 2);
    assert.equal(d!.assumptions[0].volatility, "high");
    assert.equal(d!.assumptions[0].last_verified, "2026-07-21T12:00:00");
  });
  it("결정 아님·깨진 frontmatter는 null(내성 — AC-9의 판정층)", () => {
    assert.equal(parseNoteDecision("---\ntitle: x\n---\n본문"), null);
    assert.equal(parseNoteDecision("frontmatter 없음"), null);
    assert.equal(parseNoteDecision("---\ntype: decision\ndecision: [broken\n---\n"), null);
  });
});

describe("staleAssumptions (AC-7·8·10 판정 로직)", () => {
  const base = { choice: "c", why: "w" };
  it("high + 임계 초과만 stale로 잡는다 (AC-7)", () => {
    const d = {
      ...base,
      assumptions: [
        { fact: "낡음", volatility: "high" as const, last_verified: daysAgo(31) },
        { fact: "최근", volatility: "high" as const, last_verified: daysAgo(1) },
        { fact: "저휘발", volatility: "low" as const, last_verified: daysAgo(400) },
      ],
    };
    const stale = staleAssumptions(d, NOW, 30);
    assert.equal(stale.length, 1);
    assert.equal(stale[0].fact, "낡음");
    assert.ok(stale[0].daysSince >= 31);
  });
  it("전부 low·전부 최근이면 stale 0 (AC-8 오탐 0)", () => {
    const d = {
      ...base,
      assumptions: [
        { fact: "a", volatility: "low" as const, last_verified: daysAgo(365) },
        { fact: "b", volatility: "high" as const, last_verified: daysAgo(2) },
      ],
    };
    assert.equal(staleAssumptions(d, NOW, 30).length, 0);
  });
  it("stale 2건 중 1건만 최근화하면 1건이 남는다 — 전량 최근화 시에만 0 (AC-10)", () => {
    const two = {
      ...base,
      assumptions: [
        { fact: "a", volatility: "high" as const, last_verified: daysAgo(40) },
        { fact: "b", volatility: "high" as const, last_verified: daysAgo(50) },
      ],
    };
    assert.equal(staleAssumptions(two, NOW, 30).length, 2);
    const oneRefreshed = {
      ...base,
      assumptions: [
        { fact: "a", volatility: "high" as const, last_verified: daysAgo(0) },
        { fact: "b", volatility: "high" as const, last_verified: daysAgo(50) },
      ],
    };
    assert.equal(staleAssumptions(oneRefreshed, NOW, 30).length, 1);
    const allRefreshed = {
      ...base,
      assumptions: [
        { fact: "a", volatility: "high" as const, last_verified: daysAgo(0) },
        { fact: "b", volatility: "high" as const, last_verified: daysAgo(0) },
      ],
    };
    assert.equal(staleAssumptions(allRefreshed, NOW, 30).length, 0);
  });
  it("last_verified가 못 읽는 값이면 stale로 본다(보수 — 미검증은 미검증)", () => {
    const d = { ...base, assumptions: [{ fact: "a", volatility: "high" as const, last_verified: "낡은형식" }] };
    assert.equal(staleAssumptions(d, NOW, 30).length, 1);
  });
});

describe("staleSignalLine (FR-4 — 경로 포함 한 줄)", () => {
  it("노트 경로·건수·경과일이 든 한 줄을 만든다", () => {
    const line = staleSignalLine("notes/2026-07-01-auth.md", [
      { fact: "a", daysSince: 31 },
      { fact: "b", daysSince: 50 },
    ]);
    assert.ok(!line.includes("\n"), "한 줄이어야 한다");
    assert.match(line, /notes\/2026-07-01-auth\.md/);
    assert.match(line, /2건/);
    assert.match(line, /50일/);
    assert.match(line, /[가-힣]/);
  });
});

describe("staleThresholdDays (BRIEF_STALE_DAYS)", () => {
  it("기본 30, env로 조정, 잘못된 값은 기본으로", () => {
    assert.equal(staleThresholdDays(undefined), 30);
    assert.equal(staleThresholdDays("7"), 7);
    assert.equal(staleThresholdDays("abc"), 30);
    assert.equal(staleThresholdDays("-1"), 30);
  });
});
