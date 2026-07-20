/**
 * 변경 등급 티어 — AGENTS.md worked-example의 내부 정합·무모호성 검증 (specs/202607201059 AC-1~4).
 *
 * 티어 판정은 런타임 분류기가 아니라 워크플로가 AGENTS.md 규약 텍스트를 읽어 수행한다(Non-goal:
 * SUT-분류기 없음). 따라서 이 테스트는 "분류기 출력"이 아니라 "규약 worked-example 표가 내부적으로
 * 정합한가"를 AGENTS.md에서 실제로 파싱해 대조한다 — 기대값을 미리 하드코딩한 자기동어반복이 아니다.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const AGENTS_MD = fs.readFileSync(path.join(REPO_ROOT, "AGENTS.md"), "utf8");

/** "### 시작헤딩" 부터 다음 "### " 헤딩 직전까지의 원문 슬라이스(개행 보존). */
function section(src: string, startHeading: string): string {
  const startIdx = src.indexOf(startHeading);
  assert.ok(startIdx >= 0, `AGENTS.md에 "${startHeading}" 절이 없음`);
  const rest = src.slice(startIdx + startHeading.length);
  const nextHeadingMatch = rest.match(/\n### /);
  return nextHeadingMatch ? rest.slice(0, nextHeadingMatch.index) : rest;
}

const TIER_TRIGGER_SECTION = section(AGENTS_MD, "### 티어 트리거 (객관적)");
const WORKED_EXAMPLE_SECTION = section(AGENTS_MD, "### worked-example");
const RECORD_PROMOTION_SECTION = section(AGENTS_MD, "### 판정 기록·중간 승격");

interface WorkedExampleRow {
  change: string;
  tier: string;
  rationale: string;
}

/** worked-example 마크다운 표를 (변경, 티어, 근거) 3열로 파싱한다. 헤더·구분선 행은 제외. */
function parseWorkedExamples(src: string): WorkedExampleRow[] {
  const tableLines = src.split("\n").filter((l) => l.trim().startsWith("|"));
  assert.ok(tableLines.length >= 3, "worked-example 표를 찾지 못함(행 부족)");
  // tableLines[0] = 헤더, tableLines[1] = 구분선(---), 나머지가 데이터 행
  const dataLines = tableLines.slice(2);
  return dataLines.map((line) => {
    const cells = line.split("|").map((c) => c.trim());
    cells.shift(); // 선행 파이프 앞 빈 문자열
    cells.pop(); // 후행 파이프 뒤 빈 문자열
    assert.equal(cells.length, 3, `worked-example 행이 3열이 아님: "${line}"`);
    return { change: cells[0], tier: cells[1], rationale: cells[2] };
  });
}

/** "**하드 신호:** A · B · C." 형태(줄바꿈 포함 가능)를 개별 신호 문자열 배열로 파싱한다. */
function parseHardSignals(src: string): string[] {
  const m = src.match(/\*\*하드 신호:\*\*([\s\S]+?)\n(?:\n|- \*\*)/);
  assert.ok(m, "하드 신호 목록을 찾지 못함");
  const flat = m[1].replace(/\s+/g, " ").trim();
  assert.ok(flat.endsWith("."), `하드 신호 목록이 마침표로 끝나지 않음: "${flat}"`);
  return flat
    .slice(0, -1)
    .split("·")
    .map((s) => s.replace(/\*\*/g, "").trim())
    .filter((s) => s.length > 0);
}

const ROWS = parseWorkedExamples(WORKED_EXAMPLE_SECTION);
const HARD_SIGNALS = parseHardSignals(TIER_TRIGGER_SECTION);

describe("tier-classification: AC-1 — Tier 0 트리거 완결성", () => {
  it("worked-example에 행동불변 자명 예시가 있고 정확히 Tier 0으로 지정된다", () => {
    const trivialRows = ROWS.filter((r) => /오타|주석|문서 문구|포매팅|rename/.test(r.change));
    assert.ok(trivialRows.length >= 2, "행동불변 자명 예시(오타/주석/포매팅류)가 부족함");
    for (const row of trivialRows) {
      assert.equal(row.tier, "0", `"${row.change}"는 Tier 0이어야 하는데 "${row.tier}"`);
      assert.match(row.rationale, /행동 불변 자명/, `"${row.change}"의 근거가 행동불변 자명이 아님`);
    }
  });

  it("Tier 0 트리거 절이 '행동 불변이 자명한' 취지를 명시한다", () => {
    assert.match(TIER_TRIGGER_SECTION, /행동 불변이 자명한/);
  });

  it("config 값 변경은 worked-example에서 Tier 0으로 지정되지 않는다(부정 조건 실증)", () => {
    const configRows = ROWS.filter((r) => /config/i.test(r.change));
    assert.ok(configRows.length >= 1, "config 값 변경 worked-example이 없음 — 부정 조건을 검증할 대상 자체가 없음");
    for (const row of configRows) {
      assert.notEqual(row.tier, "0", `config 값 변경 "${row.change}"가 Tier 0으로 지정됨(제외 규칙 위반)`);
    }
    assert.match(TIER_TRIGGER_SECTION, /config\/설정 값 변경은 Tier 0에서 제외/);
  });
});

describe("tier-classification: AC-2 — Tier 1 트리거 완결성", () => {
  it("하드 신호 없음이 명시된 worked-example 행은 Tier 1로 지정된다", () => {
    const noHardSignalRows = ROWS.filter((r) => /하드 신호 없음/.test(r.rationale));
    assert.ok(noHardSignalRows.length >= 1, "'하드 신호 없음' 근거의 worked-example이 없음");
    for (const row of noHardSignalRows) {
      assert.equal(row.tier, "1", `"${row.change}"는 Tier 1이어야 하는데 "${row.tier}"`);
    }
  });

  it("Tier 1 국소 변경 예시들이 실제로는 하드 신호 목록의 어떤 항목 문구도 포함하지 않는다", () => {
    const localRows = ROWS.filter((r) => r.tier === "1");
    assert.ok(localRows.length >= 2, "Tier 1 worked-example이 부족함");
    for (const row of localRows) {
      for (const signal of HARD_SIGNALS) {
        assert.ok(
          !row.change.includes(signal),
          `Tier 1 예시 "${row.change}"가 하드 신호 문구 "${signal}"를 포함함 — Tier 2여야 함`,
        );
      }
    }
  });
});

describe("tier-classification: AC-3 — Tier 2 하드 신호", () => {
  it("하드 신호 목록에 계약/보안/마이그레이션/데이터모델/전역상태/직렬화/크로스커팅이 모두 있다", () => {
    assert.ok(HARD_SIGNALS.length >= 6, `하드 신호가 6개 미만 파싱됨: ${JSON.stringify(HARD_SIGNALS)}`);
    const requiredSubstrings = ["계약", "인증", "마이그레이션", "데이터 모델", "전역 상태", "크로스커팅"];
    for (const req of requiredSubstrings) {
      assert.ok(
        HARD_SIGNALS.some((s) => s.includes(req)),
        `하드 신호 목록에 "${req}" 계열 항목이 없음: ${JSON.stringify(HARD_SIGNALS)}`,
      );
    }
  });

  it("worked-example에서 '하드 신호(...)' 근거가 붙은 모든 행은 무조건 Tier 2다", () => {
    const hardSignalRows = ROWS.filter((r) => /^하드 신호\(/.test(r.rationale));
    assert.ok(hardSignalRows.length >= 4, "하드 신호(...) 근거의 worked-example이 부족함(계약/보안/마이그레이션/전역상태 등)");
    for (const row of hardSignalRows) {
      assert.equal(row.tier, "2", `하드 신호 예시 "${row.change}"가 Tier 2가 아님(tier=${row.tier})`);
    }
  });

  it("계약 변경·로그인/권한·마이그레이션 예시가 실제로 존재하고 Tier 2다", () => {
    const wants: Array<[RegExp, string]> = [
      [/계약 변경/, "계약(API/스키마) 변경"],
      [/로그인|권한/, "인증/보안(로그인·권한)"],
      [/마이그레이션/, "마이그레이션"],
    ];
    for (const [pattern, label] of wants) {
      const row = ROWS.find((r) => pattern.test(r.change));
      assert.ok(row, `${label} worked-example을 찾지 못함`);
      assert.equal(row!.tier, "2", `${label} worked-example("${row!.change}")이 Tier 2가 아님`);
    }
  });
});

describe("tier-classification: AC-4 — escalate-on-doubt 양 경계", () => {
  it("escalate-on-doubt 규칙이 Tier 0↔1, Tier 1↔2 두 경계 모두를 명시한다", () => {
    assert.match(TIER_TRIGGER_SECTION, /escalate-on-doubt/);
    assert.match(TIER_TRIGGER_SECTION, /Tier 0↔1/);
    assert.match(TIER_TRIGGER_SECTION, /Tier 1↔2/);
    assert.match(TIER_TRIGGER_SECTION, /양 경계|두 경계/);
    assert.match(TIER_TRIGGER_SECTION, /하향 추측은 금지/);
  });

  it("Tier 0↔1 경계 worked-example(config)은 애매하면 상향(0이 아닌 티어)으로 지정된다", () => {
    const configRow = ROWS.find((r) => /config/i.test(r.change));
    assert.ok(configRow, "config 경계 worked-example 없음");
    assert.notEqual(configRow!.tier, "0", "config 애매 사례가 하향(Tier 0)으로 지정됨");
    assert.match(configRow!.rationale, /escalate/, "config 행의 근거에 escalate 취지가 없음");
  });

  it("Tier 1↔2 경계 worked-example은 escalate-on-doubt(상향)으로 Tier 2다", () => {
    const boundaryRow = ROWS.find((r) => /경계가 모호/.test(r.change));
    assert.ok(boundaryRow, "Tier1/2 경계 모호 worked-example 없음");
    assert.equal(boundaryRow!.tier, "2", "경계 모호 사례가 상향(Tier 2)으로 지정되지 않음");
    assert.match(boundaryRow!.rationale, /escalate-on-doubt/);
  });

  it("worked-example 전체에 하향(상위→하위) 매핑 예시가 존재하지 않는다", () => {
    // 하드 신호(...) 근거 행은 전부 Tier 2여야 하고(이미 AC-3에서 검증), '하향'을 뜻하는
    // 근거 문구(하향/낮춰/완화)가 어떤 행에도 없어야 한다.
    for (const row of ROWS) {
      assert.ok(
        !/하향|낮춰|완화/.test(row.rationale),
        `worked-example 행 "${row.change}"의 근거에 하향 지정 취지가 있음: "${row.rationale}"`,
      );
    }
    assert.match(RECORD_PROMOTION_SECTION, /하향 재분류는 하지 않는다/);
  });
});
