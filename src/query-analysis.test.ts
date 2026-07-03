/**
 * query-analysis.ts 단위 테스트 — 집계 순수 모듈(specs/017에서 004 계산부 추출).
 * brain-report의 순수 함수(isoWeek·renderMarkdown)도 여기서 검증한다.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { analyze, countVerifyOnDay, keywords, readRecords, type QueryLogRecord } from "./query-analysis.js";
import { isoWeek, renderMarkdown } from "./report-note.js";

const NOW = Date.parse("2026-07-03T12:00:00Z");

function rec(partial: Partial<QueryLogRecord>): QueryLogRecord {
  return {
    ts: "2026-07-03T10:00:00Z",
    tool: "ask_brain",
    query: "테스트 질의",
    hitCount: 1,
    success: true,
    ...partial,
  };
}

describe("analyze", () => {
  it("창(days) 밖 레코드는 제외하고 성공률·실패를 집계한다", () => {
    const a = analyze(
      [
        rec({ success: true }),
        rec({ success: false, hitCount: 0, query: "회고 프로세스 개선" }),
        rec({ ts: "2026-05-01T00:00:00Z", success: false }), // 창 밖
      ],
      { days: 7, minSamples: 1, now: NOW },
    );
    assert.equal(a.searches, 2);
    assert.equal(a.failed, 1);
    assert.equal(a.successRate, 50);
    assert.equal(a.insufficient, false);
  });

  it("verifyStats — verify 필드가 있는 레코드만 센다 (FR-9)", () => {
    const a = analyze(
      [rec({ verify: "pass" }), rec({ verify: "warn" }), rec({ verify: "skipped" }), rec({})],
      { days: 7, minSamples: 1, now: NOW },
    );
    assert.deepEqual(a.verifyStats, { pass: 1, warn: 1, skipped: 1 });
  });

  it("빈 로그도 실패하지 않는다(0으로 나눔 없음)", () => {
    const a = analyze([], { days: 7, minSamples: 10, now: NOW });
    assert.equal(a.searches, 0);
    assert.equal(a.successRate, 0);
    assert.equal(a.insufficient, true);
    assert.deepEqual(a.suggestions, ["특이 사항 없음 — 지금처럼 사용하면 됩니다."]);
  });

  it("capture 레코드는 검색 집계에서 분리된다", () => {
    const a = analyze(
      [rec({ tool: "capture_note", captureValidation: "unconfirmed" }), rec({})],
      { days: 7, minSamples: 1, now: NOW },
    );
    assert.equal(a.searches, 1);
    assert.equal(a.captures, 1);
    assert.equal(a.capturesUnconfirmed, 1);
  });
});

describe("countVerifyOnDay (일일 상한 카운터, AC-8 단위)", () => {
  it("오늘(UTC) verify 레코드만 센다", () => {
    const n = countVerifyOnDay(
      [
        rec({ verify: "pass" }),
        rec({ verify: "warn", ts: "2026-07-03T01:00:00Z" }),
        rec({ verify: "pass", ts: "2026-07-02T23:59:00Z" }), // 어제
        rec({}), // verify 없음
      ],
      NOW,
    );
    assert.equal(n, 2);
  });
});

describe("readRecords / keywords", () => {
  it("손상 라인은 건너뛰고 나머지를 읽는다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-qa-read-"));
    const p = path.join(dir, "log.jsonl");
    try {
      fs.writeFileSync(p, `${JSON.stringify(rec({}))}\n{깨진 json}\n${JSON.stringify(rec({}))}\n`);
      assert.equal(readRecords(p)?.length, 2);
      assert.equal(readRecords(path.join(dir, "none.jsonl")), null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("조사·불용어를 제거한다(기존 004 동작 보존)", () => {
    assert.deepEqual(keywords("회고 프로세스를 개선"), ["회고", "프로세스", "개선"]);
  });
});

describe("brain-report 순수 함수", () => {
  it("isoWeek — 연말·연초 경계에서 week-year를 쓴다 (크리틱 리뷰 경미-3)", () => {
    assert.deepEqual(isoWeek(new Date("2026-01-01T00:00:00Z")), { year: 2026, week: 1 }); // 2026-01-01은 목요일
    assert.deepEqual(isoWeek(new Date("2027-01-01T00:00:00Z")), { year: 2026, week: 53 }); // 금요일 → 전년 53주
    assert.deepEqual(isoWeek(new Date("2025-12-29T00:00:00Z")), { year: 2026, week: 1 }); // 월요일 → 익년 1주
  });

  it("renderMarkdown — 데이터 부족·해석 부재를 본문에 명시한다 (AC-13 단위)", () => {
    const a = analyze([], { days: 7, minSamples: 10, now: NOW });
    const md = renderMarkdown(a, null, new Date(NOW));
    assert.match(md, /type: report/);
    assert.match(md, /데이터 부족/);
    assert.match(md, /집계만 담았습니다/);
  });

  it("renderMarkdown — 검증 통계와 분석가 해석을 담는다 (FR-6)", () => {
    const a = analyze([rec({ verify: "warn" })], { days: 7, minSamples: 1, now: NOW });
    const md = renderMarkdown(a, "- 경고율이 높다", new Date(NOW));
    assert.match(md, /경고 1/);
    assert.match(md, /## 분석가 해석\n\n- 경고율이 높다/);
  });
});
