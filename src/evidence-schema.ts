/**
 * specs/202607210846-evidence-schema-dedup AC-1 — self-review/merged-report evidence
 * frontmatter의 필수 필드·파서 SSoT. review-preflight.ts(REQUIRED_MERGED_REPORT_FIELDS·
 * splitFrontmatter)와 retro-analysis.ts(REQUIRED_SELF_REVIEW_FIELDS·parseFrontmatter)가
 * 각자 복사해 온 동일 계약을 여기로 단일화한다(양쪽 동작·기존 export 시그니처 불변).
 */
import { parse as parseYaml } from "yaml";

/** self-review/merged-report evidence의 FR-5 필수 7필드(단일 필드셋). */
export const REQUIRED_SELF_REVIEW_FIELDS = [
  "candidate-id",
  "round",
  "independence",
  "blockers",
  "advisories",
  "approval-needed",
  "completion",
] as const;

export interface SplitFrontmatter {
  fm: string;
  body: string;
}

/** `---\n...\n---` frontmatter 블록을 분리한다(CRLF 정규화 → `---\n` 시작 확인 → 닫는 `---`
 *  탐색). 닫는 구분자가 없으면 null. yaml 파싱은 하지 않는다 — 호출자가 에러 상세를 원하면
 *  (review-preflight.ts) 이 결과에 직접 parseYaml을 적용한다. */
export function splitFrontmatter(text: string): SplitFrontmatter | null {
  const norm = text.replace(/\r\n/g, "\n");
  if (!norm.startsWith("---\n")) return null;
  const lines = norm.split("\n");
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  return { fm: lines.slice(1, end).join("\n"), body: lines.slice(end + 1).join("\n") };
}

/** splitFrontmatter + yaml.parse까지 수행하는 편의 함수(retro-analysis.ts 용도 — 에러를
 *  스왈로우하고 null로 흡수). frontmatter 없음·YAML 파싱 실패·비객체는 전부 null. */
export function parseEvidenceFrontmatter(text: string): Record<string, unknown> | null {
  const split = splitFrontmatter(text);
  if (!split) return null;
  try {
    const parsed = parseYaml(split.fm);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
