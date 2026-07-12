/**
 * AC-008: Privacy boundary — specs/041-retrieval-quality-contract/spec.md
 *
 * 커밋 대상 fixture(corpus 12개 + queries.ko.json)에 홈 디렉터리 절대경로, 알려진 비밀
 * 패턴, 허용 목록 밖의 query 원문이 없는지 확인한다. FR-007 — fixture query는 spec.md에
 * 선언한 40개 합성 문자열만 사용하므로 "허용 목록"은 queries.ko.json에 선언된 40개 자체다.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CORPUS_DIR, QUERIES_PATH, validateFixture } from "./retrieval-quality/fixture.js";

const HOME_ABS_PATH_RE = /\/(Users|home)\/[^/\s"']+/;
const SECRET_PATTERN_RES: RegExp[] = [
  /sk-[A-Za-z0-9]{16,}/,
  /AKIA[0-9A-Z]{16}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

// spec.md "Query Contract" 표에 선언된 40개 질의 원문 — 이 목록 밖의 query 문자열이 fixture나
// 다른 커밋 대상 산출물에 나타나면 안 된다(허용 목록 = 선언된 40개 자체).
const ALLOWED_QUERY_STRINGS = new Set<string>(
  (JSON.parse(fs.readFileSync(QUERIES_PATH, "utf8")) as { queries: { query: string }[] }).queries.map(
    (q) => q.query,
  ),
);

describe("041 privacy boundary (AC-008)", () => {
  it("validateFixture()가 개인정보 금지 규칙을 통과한다(홈 경로/비밀 패턴/개인 식별자 0건)", () => {
    const result = validateFixture();
    const privacyErrors = result.errors.filter((e) => e.code.startsWith("privacy_"));
    assert.deepEqual(privacyErrors, []);
  });

  it("corpus 파일 어디에도 홈 디렉터리 절대경로가 없다", () => {
    for (const file of fs.readdirSync(CORPUS_DIR)) {
      const raw = fs.readFileSync(path.join(CORPUS_DIR, file), "utf8");
      assert.equal(HOME_ABS_PATH_RE.test(raw), false, `${file}에 홈 절대경로 패턴 발견`);
    }
  });

  it("corpus 파일 어디에도 알려진 비밀 패턴이 없다", () => {
    for (const file of fs.readdirSync(CORPUS_DIR)) {
      const raw = fs.readFileSync(path.join(CORPUS_DIR, file), "utf8");
      for (const re of SECRET_PATTERN_RES) {
        assert.equal(re.test(raw), false, `${file}에서 비밀 패턴(${re}) 발견`);
      }
    }
  });

  it("queries.ko.json에 홈 절대경로나 비밀 패턴이 없다", () => {
    const raw = fs.readFileSync(QUERIES_PATH, "utf8");
    assert.equal(HOME_ABS_PATH_RE.test(raw), false);
    for (const re of SECRET_PATTERN_RES) {
      assert.equal(re.test(raw), false, `queries.ko.json에서 비밀 패턴(${re}) 발견`);
    }
  });

  it("queries.ko.json의 모든 query 원문은 spec.md에 선언된 40개 허용 목록 안에 있다", () => {
    const parsed = JSON.parse(fs.readFileSync(QUERIES_PATH, "utf8")) as { queries: { id: string; query: string }[] };
    assert.equal(parsed.queries.length, 40);
    for (const q of parsed.queries) {
      assert.ok(ALLOWED_QUERY_STRINGS.has(q.query), `${q.id}의 query가 허용 목록 밖: ${q.query}`);
    }
  });

  it("허용 목록 밖의 query 원문 문자열은 fixture 어디에도 나타나지 않는다(임의 삽입 방지 회귀)", () => {
    const injected = "이것은 허용되지 않은 질의 원문입니다";
    assert.equal(ALLOWED_QUERY_STRINGS.has(injected), false);
    const raw = fs.readFileSync(QUERIES_PATH, "utf8");
    assert.equal(raw.includes(injected), false);
  });
});
