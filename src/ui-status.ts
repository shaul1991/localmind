/**
 * specs/034 — 모니터링 웹 UI 상태 수집기(application 레이어).
 * 기존 정본을 읽기만 한다(재유도 금지): 인덱스 = .brain-index.json(v5 스키마),
 * 설정 = .env 비실행 파싱(read-env.sh와 같은 규칙), 에이전트 = 레지스트리 + 배포 마커,
 * 정본 최신성 = git(specs/033 update.sh와 같은 판정: show-toplevel·upstream·ahead/behind).
 * 어떤 수집기도 뮤테이션하지 않는다 — git fetch(refresh)는 로컬 추적 참조 갱신뿐이다.
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { loadRegistry, agentsDir } from "./agents/registry.js";
import { defaultCodexHome, MANAGED_MARKER } from "./agents/deploy.js";
import { listSkills, skillsDir as defaultSkillsDir } from "./agents/skills.js";
import { loadRules, type RuleDoc, type RuleProblem } from "./rules/registry.js";
import { readRecords } from "./query-analysis.js";

// ── config(.env) — 시크릿은 서버 단계에서 마스킹(FR-7·AC-5) ────────────────

const SECRET_KEY_RE = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i;

export function isSecretKey(key: string): boolean {
  return SECRET_KEY_RE.test(key);
}

/** 앞4자 + 길이만 남긴다(make secrets와 같은 노출 수준). 4자 미만은 앞자리도 감춘다. */
export function maskSecret(value: string): string {
  if (value.length < 4) return `•••• (길이 ${value.length})`;
  return `${value.slice(0, 4)}… (길이 ${value.length})`;
}

/** URL 임베드 자격증명(user:token@host) 마스킹 — scripts/lib/read-env.sh mask_url과 동일
 *  규칙. 키 이름 denylist가 못 잡는 시크릿(NOTES_REPOS 등)의 값 층 방어(보안 리뷰 중대-2). */
function maskUrlCredentials(value: string): string {
  return value.replace(/(:\/\/)[^/@\s]*@/g, "$1***@");
}

export interface ConfigEntry {
  key: string;
  /** 시크릿 키는 마스킹된 표현, 그 외는 원문 */
  value: string;
  masked: boolean;
}

export function configStatus(envFile: string): { exists: boolean; entries: ConfigEntry[] } {
  let raw: string;
  try {
    raw = fs.readFileSync(envFile, "utf8");
  } catch {
    return { exists: false, entries: [] };
  }
  const entries: ConfigEntry[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    // read-env.sh와 동일: 감싼 따옴표 1쌍 제거(비실행 — source/eval 없음)
    let value = t.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    let masked = isSecretKey(key) && value.length > 0;
    if (masked) {
      value = maskSecret(value);
    } else {
      const stripped = maskUrlCredentials(value);
      if (stripped !== value) {
        value = stripped;
        masked = true;
      }
    }
    entries.push({ key, value, masked });
  }
  return { exists: true, entries };
}

// ── index(.brain-index.json v4/v5) 요약 ─────────────────────────────────────

export interface FolderIndexSummary {
  label: string;
  /** bindings(specs/024)가 있으면 라벨의 원본 폴더 경로 */
  dir?: string;
  files: number;
  chunks: number;
}

export interface IndexStatus {
  indexed: boolean;
  version?: number;
  embeddingModel?: string;
  mtimeMs?: number;
  folders: FolderIndexSummary[];
  error?: string;
}

export function indexStatus(indexPath: string): IndexStatus {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(indexPath);
  } catch {
    return { indexed: false, folders: [] };
  }
  try {
    const idx = JSON.parse(fs.readFileSync(indexPath, "utf8")) as {
      version?: number;
      embeddingModel?: string;
      bindings?: Record<string, string>;
      files?: Record<string, { folder?: string; chunks?: unknown[] }>;
    };
    const byLabel = new Map<string, FolderIndexSummary>();
    for (const [key, entry] of Object.entries(idx.files ?? {})) {
      const label = entry.folder ?? key.split("/")[0] ?? "notes";
      const cur = byLabel.get(label) ?? { label, files: 0, chunks: 0, dir: idx.bindings?.[label] };
      cur.files += 1;
      cur.chunks += Array.isArray(entry.chunks) ? entry.chunks.length : 0;
      byLabel.set(label, cur);
    }
    return {
      indexed: true,
      version: idx.version,
      embeddingModel: idx.embeddingModel,
      mtimeMs: stat.mtimeMs,
      folders: [...byLabel.values()],
    };
  } catch (e) {
    return { indexed: false, folders: [], error: `인덱스 파일을 읽지 못했어요: ${(e as Error).message}` };
  }
}

// ── repos — 정본 최신성(origin 대비 상대 판단, specs/033과 동일 규칙) ───────

export interface RepoTarget {
  label: string;
  dir: string;
}

export interface RepoStatus {
  label: string;
  dir: string;
  /** repo=정상 git repo(루트) · not-git=대상 아님 · no-upstream=추적 브랜치 없음 */
  kind: "repo" | "not-git" | "no-upstream";
  ahead?: number;
  behind?: number;
  /** refresh 요청 시 fetch 성공 여부(false면 마지막 fetch 기준 수치) */
  fetched?: boolean;
  error?: string;
}

function gitOut(dir: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", ["-C", dir, ...args], { timeout: timeoutMs, encoding: "utf8" }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}

async function repoStatus(t: RepoTarget, refresh: boolean, timeoutMs: number): Promise<RepoStatus> {
  const base: RepoStatus = { label: t.label, dir: t.dir, kind: "not-git" };
  // show-toplevel == dir 요구 — 부모 repo 안 평범한 폴더의 오탐 방지(specs/033 S-1과 동일)
  let top: string;
  try {
    top = await gitOut(t.dir, ["rev-parse", "--show-toplevel"], timeoutMs);
  } catch {
    return base;
  }
  let real = t.dir;
  try {
    real = fs.realpathSync(t.dir);
  } catch {
    /* 존재하지 않으면 위 rev-parse에서 이미 걸러짐 */
  }
  if (path.resolve(top) !== path.resolve(real)) return base;
  try {
    await gitOut(t.dir, ["rev-parse", "--abbrev-ref", "@{upstream}"], timeoutMs);
  } catch {
    return { ...base, kind: "no-upstream" };
  }
  let fetched: boolean | undefined;
  let error: string | undefined;
  if (refresh) {
    try {
      await gitOut(t.dir, ["fetch", "--quiet"], timeoutMs);
      fetched = true;
    } catch {
      fetched = false;
      error = "원격 확인 불가(네트워크/자격증명) — 마지막으로 받아온 기준의 수치예요";
    }
  }
  try {
    const counts = await gitOut(t.dir, ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], timeoutMs);
    const [ahead, behind] = counts.split(/\s+/).map((n) => Number(n));
    return { ...base, kind: "repo", ahead, behind, fetched, error };
  } catch (e) {
    return { ...base, kind: "repo", fetched, error: error ?? (e as Error).message };
  }
}

export async function reposStatus(
  targets: RepoTarget[],
  opts: { refresh?: boolean; timeoutMs?: number } = {},
): Promise<RepoStatus[]> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  return Promise.all(targets.map((t) => repoStatus(t, opts.refresh ?? false, timeoutMs)));
}

// ── agents — 레지스트리 + 배포 상태 ────────────────────────────────────────

export interface PersonaStatus {
  name: string;
  description: string;
  /** 정의상 배포 대상인가(targets.* 존재) */
  targets: { claude: boolean; codex: boolean };
  /** 실제 배포 파일이 마커와 함께 존재하는가 */
  deployed: { claude: boolean; codex: boolean };
}

function hasPersonaMarker(file: string, name: string): boolean {
  try {
    return fs.readFileSync(file, "utf8").includes(`${MANAGED_MARKER} (persona: ${name})`);
  } catch {
    return false;
  }
}

export function agentsStatus(
  opts: { registryDir?: string; claudeAgentsDir?: string; codexHome?: string } = {},
): { personas: PersonaStatus[]; problems: { file: string; reason: string }[] } {
  const registryDir = opts.registryDir ?? agentsDir();
  const claudeDir =
    opts.claudeAgentsDir ??
    (process.env.LOCALMIND_CLAUDE_AGENTS_DIR?.trim() || path.join(process.env.HOME ?? ".", ".claude", "agents"));
  const codexHome = opts.codexHome ?? defaultCodexHome();
  const registry = loadRegistry(registryDir);
  const personas: PersonaStatus[] = registry.personas.map((p) => ({
    name: p.name,
    description: p.description,
    targets: { claude: Boolean(p.targets.claude), codex: Boolean(p.targets.codex) },
    deployed: {
      claude: Boolean(p.targets.claude) && hasPersonaMarker(path.join(claudeDir, `${p.name}.md`), p.name),
      codex:
        Boolean(p.targets.codex) &&
        hasPersonaMarker(path.join(codexHome, `${p.name}.config.toml`), p.name) &&
        hasPersonaMarker(path.join(codexHome, "agents", `${p.name}.toml`), p.name),
    },
  }));
  return { personas, problems: registry.problems };
}

// ── overview — 스택 헬스(make health와 같은 대상) ───────────────────────────

export interface ServiceProbe {
  name: string;
  url: string;
}

export interface ServiceStatus extends ServiceProbe {
  up: boolean;
}

async function probe(url: string, timeoutMs: number): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.status < 500;
  } catch {
    return false;
  }
}

export async function overviewStatus(
  services: ServiceProbe[],
  opts: { timeoutMs?: number } = {},
): Promise<ServiceStatus[]> {
  const timeoutMs = opts.timeoutMs ?? 2000;
  return Promise.all(services.map(async (s) => ({ ...s, up: await probe(s.url, timeoutMs) })));
}

// ── reports — 쿼리 로그 요약 + 리포트 노트 목록 ────────────────────────────

export interface ReportsStatus {
  /** 로그 부재/파싱 불가면 null(오류 아님 — 아직 기록 전) */
  queries: { total: number; failed: number } | null;
  reportNotes: { label: string; file: string }[];
}

export function reportsStatus(queryLogPath: string, folders: RepoTarget[]): ReportsStatus {
  const records = readRecords(queryLogPath);
  const queries = records
    ? { total: records.length, failed: records.filter((r) => !r.success).length }
    : null;
  const reportNotes: { label: string; file: string }[] = [];
  for (const f of folders) {
    const dir = path.join(f.dir, "reports");
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    // 일반 파일만 — 심링크는 reports/ 밖 임의 파일로 이어질 수 있어 목록에서 제외한다
    // (노트 repo는 외부 clone일 수 있는 신뢰 경계 밖 입력 — 보안 리뷰 중대-1).
    const names = entries
      .filter((e) => e.isFile() && !e.isSymbolicLink() && e.name.endsWith(".md"))
      .map((e) => e.name)
      .sort();
    for (const n of names) reportNotes.push({ label: f.label, file: n });
  }
  return { queries, reportNotes };
}

/**
 * 리포트 노트 본문(마크다운 원문). 경로 탈출 방지: file은 단일 파일명(.md)만 허용하고,
 * 해석된 실경로가 해당 폴더의 reports/ 아래인지 재확인한다(FR-6·보안 lane 점검 대상).
 */
export function readReportNote(
  folders: RepoTarget[],
  label: string,
  file: string,
): { ok: true; content: string } | { ok: false; reason: string } {
  const folder = folders.find((f) => f.label === label);
  if (!folder) return { ok: false, reason: "모르는 폴더 라벨이에요." };
  if (!/^[^/\\]+\.md$/.test(file) || file.includes("..")) {
    return { ok: false, reason: "파일명이 올바르지 않아요(.md 단일 파일명만)." };
  }
  const reportsDir = path.join(folder.dir, "reports");
  const target = path.resolve(reportsDir, file);
  if (target !== path.join(reportsDir, file) || !target.startsWith(reportsDir + path.sep)) {
    return { ok: false, reason: "파일명이 올바르지 않아요." };
  }
  try {
    // 렉시컬 검증만으로는 심링크가 reports/ 경계를 벗어난다(보안 리뷰 중대-1 실증) —
    // ① 심링크 자체 거부 + ② 실경로가 reports/ 실경로 아래인지 재확인(이중 방어).
    if (fs.lstatSync(target).isSymbolicLink()) {
      return { ok: false, reason: "심볼릭 링크 노트는 열 수 없어요." };
    }
    const realTarget = fs.realpathSync(target);
    const realDir = fs.realpathSync(reportsDir);
    if (!realTarget.startsWith(realDir + path.sep)) {
      return { ok: false, reason: "노트 폴더 밖의 파일은 열 수 없어요." };
    }
    return { ok: true, content: fs.readFileSync(realTarget, "utf8") };
  } catch {
    return { ok: false, reason: "노트를 찾을 수 없어요." };
  }
}

// ── governance(규칙·스킬·페르소나) — specs/048 read-only 조회 ────────────────

export interface RulesStatusItem {
  name: string;
  /** "base" | `overlay:<project>` */
  layer: string;
  order: number;
  /** 정본 파일 상대경로 — 리더 subtitle 표시용 */
  file: string;
}
export interface RulesStatus {
  base: RulesStatusItem[];
  /** project → 규칙 목록(Map은 JSON 직렬화 불가 — 평범한 객체로 변환) */
  overlays: Record<string, RulesStatusItem[]>;
  problems: RuleProblem[];
  warnings: string[];
}

/** 규칙 목록(전문 제외) — loadRules(F-4) 재사용, 재검증 없음(I-6). */
export function rulesStatus(opts: { rulesDir?: string } = {}): RulesStatus {
  const reg = loadRules(opts.rulesDir);
  const toItem = (d: RuleDoc, layer: string): RulesStatusItem => ({ name: d.name, layer, order: d.order, file: d.file });
  const overlays: Record<string, RulesStatusItem[]> = {};
  for (const [project, docs] of reg.overlays) {
    overlays[project] = docs.map((d) => toItem(d, `overlay:${project}`));
  }
  return {
    base: reg.base.map((d) => toItem(d, "base")),
    overlays,
    problems: reg.problems,
    warnings: reg.warnings,
  };
}

/**
 * 규칙 전문 — 로드된 레지스트리에서 name 조회(경로 입력 없음, 본문은 메모리 상주 — FR-7).
 * project를 주면 그 overlay에서, 없으면 base에서 찾는다 — base·overlay 동명 규칙에서
 * 클릭한 계층의 전문을 정확히 반환한다(overlay-wins override 가시성).
 */
export function ruleContent(
  name: string,
  opts: { rulesDir?: string; project?: string } = {},
): { ok: true; content: string } | { ok: false; reason: string } {
  const reg = loadRules(opts.rulesDir);
  const pool = opts.project ? (reg.overlays.get(opts.project) ?? []) : reg.base;
  const found = pool.find((d) => d.name === name);
  if (!found) return { ok: false, reason: "알 수 없는 규칙 이름이에요." };
  return { ok: true, content: found.content };
}

export interface SkillsStatusItem {
  name: string;
  description: string;
  managed: boolean;
  /** SKILL.md 상대경로 — 리더 subtitle 표시용 */
  file: string;
}
export interface SkillsStatus {
  skills: SkillsStatusItem[];
}

/** 스킬 목록(전문 제외) — listSkills(F-5) 래핑. */
export function skillsStatus(opts: { skillsDir?: string } = {}): SkillsStatus {
  return {
    skills: listSkills(opts.skillsDir).map(({ name, description, managed, file }) => ({ name, description, managed, file })),
  };
}

/** 페르소나 전문 — 로드된 레지스트리에서 name 조회(경로 입력 없음, 본문은 메모리 상주 — FR-7). */
export function personaContent(
  name: string,
  opts: { registryDir?: string } = {},
): { ok: true; content: string } | { ok: false; reason: string } {
  const reg = loadRegistry(opts.registryDir);
  const found = reg.personas.find((p) => p.name === name);
  if (!found) return { ok: false, reason: "알 수 없는 페르소나 이름이에요." };
  return { ok: true, content: found.prompt };
}

/**
 * 스킬 전문 — SKILL.md 파일 read(스킬만 경로 안전 필요, FR-7·I-4). name은 skillsDir()
 * 하위 단일 디렉토리명이어야 한다(readNoteContent와 동일한 이중 방어: 렉시컬 검증 +
 * realpath 재확인 — 심링크로 skillsDir 밖을 가리켜도 걸러진다).
 */
export function skillContent(
  name: string,
  opts: { skillsDir?: string } = {},
): { ok: true; content: string } | { ok: false; reason: string } {
  const root = opts.skillsDir ?? defaultSkillsDir();
  if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) {
    return { ok: false, reason: "스킬 이름이 올바르지 않아요." };
  }
  const rootReal = path.resolve(root);
  const target = path.resolve(root, name, "SKILL.md");
  if (target !== path.join(rootReal, name, "SKILL.md") || !target.startsWith(rootReal + path.sep)) {
    return { ok: false, reason: "스킬 폴더 밖의 파일은 열 수 없어요." };
  }
  try {
    if (fs.lstatSync(target).isSymbolicLink()) {
      return { ok: false, reason: "심볼릭 링크는 열 수 없어요." };
    }
    const realTarget = fs.realpathSync(target);
    const realDir = fs.realpathSync(rootReal);
    if (!realTarget.startsWith(realDir + path.sep)) {
      return { ok: false, reason: "스킬 폴더 밖의 파일은 열 수 없어요." };
    }
    return { ok: true, content: fs.readFileSync(realTarget, "utf8") };
  } catch {
    return { ok: false, reason: "스킬을 찾을 수 없어요." };
  }
}

/**
 * specs/038 — 노트 카드 브라우저의 본문 리더. `label/상대경로.md`(하위폴더 허용)를
 * 폴더 루트 안에서만 읽는다. 트래버설·심링크·루트밖 접근을 이중 방어로 거부(readReportNote 계승).
 */
export function readNoteContent(
  folders: RepoTarget[],
  notePath: string,
): { ok: true; content: string } | { ok: false; reason: string } {
  const slash = notePath.indexOf("/");
  if (slash <= 0) return { ok: false, reason: "경로 형식이 올바르지 않아요." };
  const label = notePath.slice(0, slash);
  const rel = notePath.slice(slash + 1);
  const folder = folders.find((f) => f.label === label);
  if (!folder) return { ok: false, reason: "모르는 폴더 라벨이에요." };
  if (!rel.endsWith(".md") || rel.includes("..") || rel.startsWith("/") || rel.includes("\\")) {
    return { ok: false, reason: "파일 경로가 올바르지 않아요." };
  }
  const rootReal = path.resolve(folder.dir);
  const target = path.resolve(folder.dir, rel);
  if (target !== path.join(rootReal, rel) || !target.startsWith(rootReal + path.sep)) {
    return { ok: false, reason: "노트 폴더 밖의 파일은 열 수 없어요." };
  }
  try {
    if (fs.lstatSync(target).isSymbolicLink()) {
      return { ok: false, reason: "심볼릭 링크 노트는 열 수 없어요." };
    }
    const realTarget = fs.realpathSync(target);
    const realDir = fs.realpathSync(folder.dir);
    if (!realTarget.startsWith(realDir + path.sep)) {
      return { ok: false, reason: "노트 폴더 밖의 파일은 열 수 없어요." };
    }
    return { ok: true, content: fs.readFileSync(realTarget, "utf8") };
  } catch {
    return { ok: false, reason: "노트를 찾을 수 없어요." };
  }
}
