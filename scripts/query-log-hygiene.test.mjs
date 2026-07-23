/**
 * 정적 회귀 가드(specs/202607231810) — 도그푸드·스모크의 query-log 측정 위생.
 * 공용 ~/.localmind/query-log.jsonl 은 실사용 측정 전용이다. 노트 폴더를 격리하는
 * 스모크가 로그만 공용에 흘리면 검색 품질 리포트·brief 통계가 왜곡된다(회고 1, 2026-07-22).
 * 행동 검증(스모크 실행)은 임베딩 엔진이 필요해 비헤르메틱 — 여기서는 격리 설정의
 * 존재만 고정한다(pinning.test.sh 결).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("AC-2: smoke-brain은 스폰 env에 QUERY_LOG 격리 경로를 설정한다", () => {
  const src = fs.readFileSync(path.join(repo, "scripts", "smoke-brain.ts"), "utf8");
  assert.match(
    src,
    /QUERY_LOG\s*:/,
    "scripts/smoke-brain.ts가 서버 스폰 env에 QUERY_LOG를 설정해야 합니다 — " +
      "공용 쿼리 로그는 실사용 측정 전용(specs/202607231810 도그푸드 측정 위생)",
  );
});
