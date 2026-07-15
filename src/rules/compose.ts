/**
 * 규칙 합성 — base + overlay를 이름 기준으로 병합한다 (specs/041 FR-2, AC-6).
 *
 * "항목(item)"의 단위 = 규칙 문서(name). 규칙:
 *  - base와 overlay에 같은 name이 있으면 overlay가 base를 덮는다(충돌 → overlay 우선).
 *  - overlay에만 있는 name은 뒤에 추가된다(프로젝트 고유 규칙).
 *  - 순수 함수(IO 없음) — 테스트가 인메모리로 결정적.
 */
import { sortDocs, type RuleDoc } from "./registry.js";

export interface ComposedDoc {
  name: string;
  content: string;
  source: "base" | "overlay";
}
export interface ComposedRuleset {
  docs: ComposedDoc[];
}

export function compose(base: RuleDoc[], overlay: RuleDoc[]): ComposedRuleset {
  const overlayByName = new Map<string, RuleDoc>();
  for (const d of overlay) overlayByName.set(d.name, d);

  const docs: ComposedDoc[] = [];
  const usedOverlay = new Set<string>();

  // base 순서 유지. 같은 name overlay가 있으면 overlay 내용으로 대체(override).
  for (const b of sortDocs(base)) {
    const o = overlayByName.get(b.name);
    if (o) {
      docs.push({ name: b.name, content: o.content, source: "overlay" });
      usedOverlay.add(b.name);
    } else {
      docs.push({ name: b.name, content: b.content, source: "base" });
    }
  }
  // overlay 전용(base에 없던) 규칙은 뒤에 추가.
  for (const o of sortDocs(overlay)) {
    if (usedOverlay.has(o.name)) continue;
    docs.push({ name: o.name, content: o.content, source: "overlay" });
  }
  return { docs };
}

/** 합성 결과를 하나의 markdown 본문으로 직렬화한다. 규칙 문서 사이는 빈 줄로 구분. */
export function composedBody(cs: ComposedRuleset): string {
  return cs.docs.map((d) => d.content.trim()).join("\n\n");
}
