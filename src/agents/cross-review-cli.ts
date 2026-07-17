#!/usr/bin/env node
/**
 * `localmind-review` — SDD self-review의 codex 교차 검증 CLI (specs/018 FR-2).
 *
 * 사용: 리뷰 프롬프트(spec AC + 구현 diff 요약)를 stdin으로 파이프한다.
 *   git diff | localmind-review            사람이 읽는 마크다운 보고
 *   ... | localmind-review --json          구조화 결과(JSON) — 스킬·도구가 파싱
 *
 * 항상 exit 0 — 검증 도구가 goal-impl 흐름을 실패시키지 않는다(비차단, FR-7).
 * 이 binary는 sdd-self-review workflow의 optional additional review capability(adapter/reference
 * layer)로만 쓰인다 — canonical SKILL.md는 이 구체 이름을 전제하지 않는다(specs/044).
 * 실패·미설치·시간 초과는 출력의 "생략(사유)"로 드러난다.
 */
import fs from "node:fs";
import { renderCrossReview, runCrossReview } from "./cross-review.js";

const prompt = fs.readFileSync(0, "utf8");
const result = prompt.trim()
  ? runCrossReview({ prompt })
  : { status: "skipped" as const, skipReason: "리뷰 프롬프트가 비어 있음(stdin으로 AC·diff를 넘기세요)" };

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(renderCrossReview(result));
}
process.exitCode = 0;
