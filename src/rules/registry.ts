/**
 * 에이전트 작업 규칙 레지스트리 — base + 프로젝트 overlay 정본 로드·검증 (specs/041 FR-1).
 *
 * 정본 위치(노트 폴더 하위, git 백업·동기화 자동 편입):
 *   <rulesDir>/base/*.md              — 공통 base 규칙(문서 하나 = 규칙 하나)
 *   <rulesDir>/overlays/<project>/*.md — 프로젝트별 overlay 규칙
 * rulesDir 기본값 = firstNotesDir()/rules. LOCALMIND_RULES_DIR로 재지정 가능.
 *
 * 규칙 문서는 프론트매터가 선택적이다(대부분 산문). name은 프론트매터 name 또는 파일명(basename).
 * 같은 layer/project 안에서 name이 겹치면 어느 하나를 임의 채택하지 않고 problems로 격리한다
 * (페르소나 레지스트리 016과 같은 원칙 — 깨진/모호한 정본으로 prune이 오작동하지 않게).
 */
import fs from "node:fs";
import path from "node:path";
import { firstNotesDir } from "../agents/registry.js";

export interface RuleDoc {
  /** 규칙 식별자 = 프론트매터 name 또는 파일명(basename). compose 병합·override의 키. */
  name: string;
  /** 프론트매터를 벗긴 규칙 본문(markdown) */
  content: string;
  /** 정렬 우선순위(작을수록 앞). 프론트매터 order 또는 0. 동률이면 name 사전순. */
  order: number;
  /** 정본 파일 상대경로 — 문제 보고용 */
  file: string;
}
export interface RuleProblem {
  file: string;
  reason: string;
}
export interface RulesRegistry {
  base: RuleDoc[];
  /** project → overlay 규칙 문서. */
  overlays: Map<string, RuleDoc[]>;
  problems: RuleProblem[];
  warnings: string[];
}

function expandHome(p: string): string {
  return p.replace(/^~(?=$|\/)/, process.env.HOME ?? "~");
}

/** 규칙 정본 폴더. 노트 폴더 하위여야 backup(git)에 자동 편입된다(agents/·skills/와 동일). */
export function rulesDir(): string {
  const env = process.env.LOCALMIND_RULES_DIR?.trim();
  if (env) return path.resolve(expandHome(env));
  return path.join(firstNotesDir(), "rules");
}

// ── 선택적 프론트매터 파서 ────────────────────────────────────────────
// 규칙 문서는 산문이라 프론트매터가 없을 수 있다. 있으면 최상위 `key: value`만 읽어
// name·order를 취하고 본문을 분리한다. 외부 YAML 의존성 없음(specs/010 공급망 고정).
function parseDoc(src: string, basename: string): { name: string; order: number; content: string } {
  const normalized = src.replace(/\r\n/g, "\n");
  let name = basename;
  let order = 0;
  let content = normalized;
  if (normalized.startsWith("---\n")) {
    const end = normalized.indexOf("\n---", 3);
    if (end >= 0) {
      const head = normalized.slice(4, end);
      const bodyStart = normalized.indexOf("\n", end + 1);
      content = bodyStart >= 0 ? normalized.slice(bodyStart + 1) : "";
      for (const rawLine of head.split("\n")) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const colon = line.indexOf(":");
        if (colon <= 0) continue;
        const key = line.slice(0, colon).trim();
        const value = line.slice(colon + 1).trim().replace(/^["']|["']$/g, "");
        if (key === "name" && value) name = value;
        else if (key === "order") {
          const n = Number(value);
          if (Number.isFinite(n)) order = n;
        }
      }
    }
  }
  return { name, order, content: content.trim() };
}

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 한 폴더의 규칙 문서(.md)를 읽어 검증한다. layer 라벨은 문제 보고용 경로 접두. */
function loadDir(dir: string, relPrefix: string, problems: RuleProblem[], warnings: string[]): RuleDoc[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return []; // 폴더 없음 = 빈 목록
  }
  const docs: RuleDoc[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".") || !e.name.toLowerCase().endsWith(".md")) continue;
    const rel = `${relPrefix}${e.name}`;
    if (!e.isFile()) {
      if (e.isSymbolicLink()) warnings.push(`${rel}: 심볼릭 링크는 지원하지 않습니다 — 실제 파일을 두세요`);
      continue;
    }
    let src: string;
    try {
      src = fs.readFileSync(path.join(dir, e.name), "utf8");
    } catch (err) {
      problems.push({ file: rel, reason: `파일을 읽을 수 없습니다: ${(err as Error).message}` });
      continue;
    }
    const basename = e.name.slice(0, -3); // .md 제거
    const { name, order, content } = parseDoc(src, basename);
    if (!NAME_RE.test(name)) {
      problems.push({ file: rel, reason: `규칙 name은 kebab-case여야 합니다(소문자·숫자·하이픈): "${name}"` });
      continue;
    }
    if (!content) {
      warnings.push(`${rel}: 본문이 비어 있습니다 — 건너뜁니다`);
      continue;
    }
    docs.push({ name, order, content, file: rel });
  }
  return dedupeByName(docs, problems);
}

/** 같은 name이 둘 이상이면 어느 하나를 임의 채택하지 않고 전부 problems로 격리한다(016 AC-4와 동일). */
function dedupeByName(docs: RuleDoc[], problems: RuleProblem[]): RuleDoc[] {
  const byName = new Map<string, RuleDoc[]>();
  for (const d of docs) byName.set(d.name, [...(byName.get(d.name) ?? []), d]);
  const unique: RuleDoc[] = [];
  for (const [name, group] of byName) {
    if (group.length === 1) unique.push(group[0]);
    else {
      for (const d of group) {
        problems.push({ file: d.file, reason: `규칙 name "${name}" 중복 — ${group.map((g) => g.file).join(", ")} 가 같은 이름을 씁니다` });
      }
    }
  }
  return sortDocs(unique);
}

/** 결정적 순서: order 오름차순, 동률이면 name 사전순. */
export function sortDocs(docs: RuleDoc[]): RuleDoc[] {
  return [...docs].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** 규칙 정본(base + overlays)을 모두 읽어 검증한다. 잘못된 항목은 problems로 격리한다. */
export function loadRules(dir: string = rulesDir()): RulesRegistry {
  const problems: RuleProblem[] = [];
  const warnings: string[] = [];

  const base = loadDir(path.join(dir, "base"), "base/", problems, warnings);

  const overlays = new Map<string, RuleDoc[]>();
  const overlaysRoot = path.join(dir, "overlays");
  let projectEntries: fs.Dirent[] = [];
  try {
    projectEntries = fs.readdirSync(overlaysRoot, { withFileTypes: true });
  } catch {
    /* overlays 폴더 없음 = overlay 없음 */
  }
  for (const pe of projectEntries) {
    if (pe.name.startsWith(".") || !pe.isDirectory()) continue;
    const docs = loadDir(path.join(overlaysRoot, pe.name), `overlays/${pe.name}/`, problems, warnings);
    if (docs.length > 0) overlays.set(pe.name, docs);
  }

  return { base, overlays, problems, warnings };
}
