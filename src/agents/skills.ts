/**
 * 오케스트레이션 스킬의 정본 관리·복사 배포 (specs/018 FR-8).
 *
 * 스킬 정본은 데이터 폴더(<첫 노트 폴더>/skills/<name>/)에 살고 — 노트 폴더 하위라
 * `make backup`에 자동 편입된다(정본⊂백업 스코프 불변식) — 배포는 **형식 변환 없이**
 * Claude Code 스킬 위치로 디렉토리를 verbatim 복사한다. 016 managed 마커 규율을
 * 재사용한다: 마커 있는 산출물만 갱신·prune, 마커 없는(사용자 직접 생성) 파일은 불가침.
 *
 * 페르소나 배포(deploy.ts)에 얹지 않는 이유: 스킬=디렉토리 verbatim 복사, 페르소나=
 * 단일 파일 다중 타깃 렌더 — 형태가 달라 통합하면 분기가 는다(plan 설계 근거 2).
 * 불변식: brain.ts를 import하지 않는다(순환 방지).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MANAGED_MARKER } from "./deploy.js";
import { firstNotesDir } from "./registry.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
// src/agents/ 와 dist/agents/ 모두 저장소 루트의 2단계 하위 — templates/skills로 동일 해석
const TEMPLATES_DIR = path.resolve(MODULE_DIR, "..", "..", "templates", "skills");

function expandHome(p: string): string {
  return p.replace(/^~(?=$|\/)/, process.env.HOME ?? "~");
}

/** 스킬 정본 위치 — 노트 폴더 하위 기본(백업 편입). LOCALMIND_SKILLS_DIR로 재지정 시
 *  백업 스코프를 벗어날 수 있음을 문서가 경고한다. */
export function skillsDir(): string {
  const env = process.env.LOCALMIND_SKILLS_DIR?.trim();
  if (env) return path.resolve(expandHome(env));
  return path.join(firstNotesDir(), "skills");
}

function defaultClaudeSkillsDir(): string {
  const env = process.env.LOCALMIND_CLAUDE_SKILLS_DIR?.trim();
  if (env) return path.resolve(expandHome(env));
  return path.join(process.env.HOME ?? ".", ".claude", "skills");
}

function markerFor(name: string): string {
  return `${MANAGED_MARKER} (skill: ${name})`;
}

/** 이 디렉토리가 "스킬 name의 localmind 산출물/정본"인가 — SKILL.md의 이름 바인딩 마커로 판정. */
function isManagedSkillDir(dir: string, name: string): boolean {
  try {
    return fs.readFileSync(path.join(dir, "SKILL.md"), "utf8").includes(markerFor(name));
  } catch {
    return false;
  }
}

function listFilesRec(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFilesRec(full, base));
    else if (e.isFile()) out.push(path.relative(base, full));
  }
  return out.sort();
}

/** 두 디렉토리의 파일 집합·내용이 동일한가(verbatim 비교 — 멱등 판정). */
function dirsEqual(a: string, b: string): boolean {
  try {
    const fa = listFilesRec(a);
    const fb = listFilesRec(b);
    if (fa.length !== fb.length || fa.some((f, i) => f !== fb[i])) return false;
    return fa.every((f) => fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(path.join(b, f))));
  } catch {
    return false;
  }
}

/** 디렉토리 verbatim 복사(대상은 통째로 교체 — 잔여 파일 없음 보장). */
function copyDir(src: string, dest: string): void {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
}

export interface SkillItem {
  name: string;
  status: "created" | "updated" | "unchanged" | "skipped-unmanaged" | "pruned";
}
export interface SkillSyncResult {
  items: SkillItem[];
  skippedTarget?: string; // 대상 도구 미설치 사유
}

/** 소스 폴더의 스킬 디렉토리(SKILL.md 보유) 목록. */
function listSkillDirs(root: string): string[] {
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && fs.existsSync(path.join(root, e.name, "SKILL.md")))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** 한 소스→대상으로 스킬들을 동기화한다(공통 규율: 비교 후 쓰기·미관리 보호). */
function syncSkills(srcRoot: string, destRoot: string, prune: boolean): SkillItem[] {
  const items: SkillItem[] = [];
  const names = listSkillDirs(srcRoot);
  fs.mkdirSync(destRoot, { recursive: true });

  for (const name of names) {
    const src = path.join(srcRoot, name);
    const dest = path.join(destRoot, name);
    if (!fs.existsSync(dest)) {
      copyDir(src, dest);
      items.push({ name, status: "created" });
    } else if (!isManagedSkillDir(dest, name)) {
      items.push({ name, status: "skipped-unmanaged" }); // 사용자 포크·직접 생성 — 불가침
    } else if (dirsEqual(src, dest)) {
      items.push({ name, status: "unchanged" });
    } else {
      copyDir(src, dest);
      items.push({ name, status: "updated" });
    }
  }

  if (prune) {
    const keep = new Set(names);
    for (const e of fs.readdirSync(destRoot, { withFileTypes: true })) {
      if (!e.isDirectory() || keep.has(e.name)) continue;
      const dest = path.join(destRoot, e.name);
      if (!isManagedSkillDir(dest, e.name)) continue; // 마커 없는 스킬은 사용자 소유
      fs.rmSync(dest, { recursive: true, force: true });
      items.push({ name: e.name, status: "pruned" });
    }
  }
  return items;
}

/** 패키지 동봉 정본(templates/skills) → 데이터 폴더 정본. prune 없음(데이터 폴더는
 *  사용자 공간) — 사용자가 포크한(마커 제거) 스킬은 보존된다. */
export function seedSkills(opts: { skillsDir?: string } = {}): SkillSyncResult {
  return { items: syncSkills(TEMPLATES_DIR, opts.skillsDir ?? skillsDir(), false) };
}

/** 데이터 폴더 정본 → Claude Code 스킬 위치. 변환 없는 verbatim 복사 + managed prune. */
export function deploySkills(opts: { skillsDir?: string; claudeSkillsDir?: string } = {}): SkillSyncResult {
  const dest = opts.claudeSkillsDir ?? defaultClaudeSkillsDir();
  // 대상 도구 미설치(~/.claude 부재) 시 폴더를 임의 생성하지 않는다(016 FR-8 계승)
  if (!fs.existsSync(path.dirname(dest))) {
    return { items: [], skippedTarget: `${path.dirname(dest)} 폴더가 없습니다 (Claude Code 미설치?)` };
  }
  return { items: syncSkills(opts.skillsDir ?? skillsDir(), dest, true) };
}

// ── 읽기 전용 카탈로그 (specs/048 FR-3) ────────────────────────────────────

/** SKILL.md의 name·description만 읽는 최소 프론트매터 파서. YAML 의존 없음(specs/010). */
function parseSkillFrontmatter(src: string): { name?: string; description?: string } {
  const normalized = src.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return {};
  const end = normalized.indexOf("\n---", 3);
  if (end < 0) return {};
  const head = normalized.slice(4, end);
  const fm: { name?: string; description?: string } = {};
  for (const rawLine of head.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim().replace(/^["']|["']$/g, "");
    if (key === "name") fm.name = value;
    else if (key === "description") fm.description = value;
  }
  return fm;
}

export interface SkillCatalogItem {
  /** 디렉토리명(= 전문 조회 시 skillContent의 name 파라미터 키) */
  name: string;
  description: string;
  managed: boolean;
  /** skillsDir 기준 상대경로 — 문제 보고·표시용 */
  file: string;
}

/** 스킬 카탈로그(read-only) — skillsDir() 하위 SKILL.md 보유 디렉토리를 열거한다.
 *  name은 디렉토리명(전문 조회 시 경로 구성의 키가 되므로 frontmatter name과 무관하게
 *  디렉토리명을 정본으로 삼는다 — RuleDoc의 basename 폴백과 같은 결). */
export function listSkills(dir: string = skillsDir()): SkillCatalogItem[] {
  const items: SkillCatalogItem[] = [];
  for (const name of listSkillDirs(dir)) {
    const file = path.join(name, "SKILL.md");
    let src: string;
    try {
      src = fs.readFileSync(path.join(dir, file), "utf8");
    } catch {
      continue;
    }
    const fm = parseSkillFrontmatter(src);
    items.push({
      name,
      description: fm.description ?? "",
      managed: isManagedSkillDir(path.join(dir, name), name),
      file,
    });
  }
  return items;
}

/** 결과를 비개발자도 읽을 수 있는 한국어로 요약한다. */
export function formatSkillsResult(label: string, r: SkillSyncResult): string {
  const status: Record<SkillItem["status"], string> = {
    created: "생성됨",
    updated: "갱신됨",
    unchanged: "변경 없음",
    "skipped-unmanaged": "건너뜀(직접 만든 스킬 보호)",
    pruned: "정리됨(정본에서 삭제됨)",
  };
  const lines = [`${label}:`];
  if (r.skippedTarget) lines.push(`  건너뜀: ${r.skippedTarget}`);
  else if (!r.items.length) lines.push("  스킬 없음");
  else for (const it of r.items) lines.push(`  ${it.name}: ${status[it.status]}`);
  return lines.join("\n");
}
