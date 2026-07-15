/**
 * 규칙 배포 — base+overlay 합성을 각 에이전트 표면에 managed 섹션/파일로 기록한다 (specs/041 FR-3~FR-8).
 *
 * 핵심 불변식:
 *  - I-1 사용자·비managed 섹션 불가침: 섹션 upsert는 BEGIN…END 경계 안쪽만 교체, 경계 밖 바이트 보존.
 *  - I-2 멱등: 결과가 현재와 같으면 unchanged(불필요 쓰기 없음).
 *  - I-3 prune은 managed 산출물만: 규칙이 비면 managed 섹션/파일만 제거, 사용자 파일 불가침.
 *        검증 문제(problems>0)면 prune 스킵(깨진 정본으로 산출물 몰살 방지 — 016 계승).
 *  - I-4 대상 폴더 부재 시 스킵(폴더 신규 생성 금지).
 *  - I-5 경로 무관: 산출물에 디바이스 절대경로를 넣지 않는다(렌더러가 상대 @import 사용).
 */
import fs from "node:fs";
import path from "node:path";
import { loadRules, rulesDir, type RulesRegistry } from "./registry.js";
import { compose, type ComposedRuleset } from "./compose.js";
import {
  RULES_MARKER,
  SECTION_BEGIN,
  SECTION_END,
  renderClaudeImportFile,
  renderClaudeGlobalStubSection,
  renderCodexGlobalSection,
  renderRepoAgentsSection,
  renderRepoClaudeStubSection,
} from "./render.js";
import { defaultCodexHome } from "../agents/deploy.js";

export type RulesSurface = "claude-global" | "codex-global" | "repo";
export type RulesStatus =
  | "created"
  | "updated"
  | "unchanged"
  | "removed"
  | "skipped-unmanaged"
  | "skipped-malformed";

export interface RulesDeployItem {
  surface: RulesSurface;
  /** 산출물 절대경로 — 표시용(경로 무관 불변식은 산출물 *내용*에만 적용) */
  file: string;
  status: RulesStatus;
}
export interface RulesDeployResult {
  baseCount: number;
  project?: string | null;
  items: RulesDeployItem[];
  problems: RulesRegistry["problems"];
  warnings: string[];
  skippedTargets: { target: RulesSurface; reason: string }[];
  pruneSkipped: boolean;
}
export interface RulesDeployOptions {
  rulesDir?: string;
  claudeHome?: string;
  codexHome?: string;
  /** 지정 시 이 repo 경로(cwd)에 repo 표면(AGENTS.md + CLAUDE.md 스텁)을 배포한다. */
  repoDir?: string;
}

function expandHome(p: string): string {
  return p.replace(/^~(?=$|\/)/, process.env.HOME ?? "~");
}
function defaultClaudeHome(): string {
  const env = process.env.LOCALMIND_CLAUDE_HOME?.trim();
  if (env) return path.resolve(expandHome(env));
  return path.join(process.env.HOME ?? ".", ".claude");
}

/** cwd 이름 ↔ overlay 프로젝트명 매칭용 kebab 정규화(specs/029). */
export function normalizeProject(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * repo 이름으로 overlay 프로젝트를 고른다. 정확 매칭(정규화 후) 하나면 그 키를, 없으면 null.
 * 정규화 후 여러 프로젝트가 겹치면(모호) 추측하지 않고 null + 경고(specs/029: 추측 금지).
 */
export function matchProject(repoName: string, projects: Iterable<string>): { project: string | null; ambiguous: string[] } {
  const target = normalizeProject(repoName);
  // 정규화가 빈 문자열이면(알파뉴메릭 없는 비정상 이름) 매칭하지 않는다 — "" === "" 오매칭 방지.
  if (target === "") return { project: null, ambiguous: [] };
  const hits = [...projects].filter((p) => normalizeProject(p) === target);
  if (hits.length === 1) return { project: hits[0], ambiguous: [] };
  if (hits.length > 1) return { project: null, ambiguous: hits };
  return { project: null, ambiguous: [] };
}

// ── 섹션 upsert (I-1·I-2) ────────────────────────────────────────────

type SectionSpan = { start: number; end: number } | null | "malformed";
function findSection(content: string): SectionSpan {
  const b = content.indexOf(SECTION_BEGIN);
  if (b < 0) return null;
  const e = content.indexOf(SECTION_END, b);
  if (e < 0) return "malformed"; // BEGIN만 있고 END 없음 = 손상 — 경계를 추측하지 않는다
  return { start: b, end: e + SECTION_END.length };
}

/** 경계 밖 바이트를 보존하며 managed 섹션을 upsert한다. 파일 없으면 생성. */
function upsertSection(filePath: string, surface: RulesSurface, sectionText: string, items: RulesDeployItem[]) {
  let current: string | null = null;
  try {
    current = fs.readFileSync(filePath, "utf8");
  } catch {
    current = null;
  }
  if (current === null) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, sectionText + "\n");
    items.push({ surface, file: filePath, status: "created" });
    return;
  }
  const span = findSection(current);
  if (span === "malformed") {
    items.push({ surface, file: filePath, status: "skipped-malformed" });
    return;
  }
  let next: string;
  if (span) {
    next = current.slice(0, span.start) + sectionText + current.slice(span.end);
  } else {
    // append — 기존 바이트를 건드리지 않고 뒤에 붙인다(빈 줄 하나 확보).
    const sep = current === "" ? "" : current.endsWith("\n\n") ? "" : current.endsWith("\n") ? "\n" : "\n\n";
    next = current + sep + sectionText + "\n";
  }
  if (next === current) {
    items.push({ surface, file: filePath, status: "unchanged" });
    return;
  }
  fs.writeFileSync(filePath, next);
  items.push({ surface, file: filePath, status: span ? "updated" : "created" });
}

/** managed 섹션만 제거한다(사용자 파일·경계 밖 불가침). 제거 후 내용이 비면 파일 삭제. */
function removeSection(filePath: string, surface: RulesSurface, items: RulesDeployItem[]) {
  let current: string;
  try {
    current = fs.readFileSync(filePath, "utf8");
  } catch {
    return; // 파일 없음 = 지울 것 없음
  }
  const span = findSection(current);
  if (span === "malformed" || !span) return; // 손상/미존재 섹션은 건드리지 않는다
  const rest = (current.slice(0, span.start) + current.slice(span.end)).replace(/\n{3,}/g, "\n\n");
  if (rest.trim() === "") {
    fs.rmSync(filePath);
    items.push({ surface, file: filePath, status: "removed" });
    return;
  }
  fs.writeFileSync(filePath, rest);
  items.push({ surface, file: filePath, status: "removed" });
}

// ── 전체 관리 파일(~/.claude/localmind-rules.md) — 페르소나식 whole-file managed ──

function isManagedFile(filePath: string): boolean {
  try {
    return fs.readFileSync(filePath, "utf8").includes(RULES_MARKER);
  } catch {
    return false;
  }
}
function writeManagedFile(filePath: string, surface: RulesSurface, content: string, items: RulesDeployItem[]) {
  if (fs.existsSync(filePath) && !isManagedFile(filePath)) {
    items.push({ surface, file: filePath, status: "skipped-unmanaged" });
    return;
  }
  let current: string | null = null;
  try {
    current = fs.readFileSync(filePath, "utf8");
  } catch {
    current = null;
  }
  if (current === content) {
    items.push({ surface, file: filePath, status: "unchanged" });
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  items.push({ surface, file: filePath, status: current === null ? "created" : "updated" });
}
function removeManagedFile(filePath: string, surface: RulesSurface, items: RulesDeployItem[]) {
  if (fs.existsSync(filePath) && isManagedFile(filePath)) {
    fs.rmSync(filePath);
    items.push({ surface, file: filePath, status: "removed" });
  }
}

// ── 배포 ─────────────────────────────────────────────────────────────

/** 규칙 정본을 읽어 각 표면의 산출물을 생성·갱신·정리한다. */
export function deployRules(opts: RulesDeployOptions = {}): RulesDeployResult {
  const registry = loadRules(opts.rulesDir ?? rulesDir());
  const claudeHome = opts.claudeHome ?? defaultClaudeHome();
  const codexHome = opts.codexHome ?? defaultCodexHome();

  const items: RulesDeployItem[] = [];
  const skippedTargets: RulesDeployResult["skippedTargets"] = [];
  const warnings = [...registry.warnings];
  const pruneSkipped = registry.problems.length > 0;

  const globalCompose: ComposedRuleset = compose(registry.base, []);
  const globalEmpty = globalCompose.docs.length === 0;

  // ── Claude 글로벌 ──
  if (fs.existsSync(claudeHome)) {
    const importFile = path.join(claudeHome, "localmind-rules.md");
    const claudeMd = path.join(claudeHome, "CLAUDE.md");
    if (globalEmpty) {
      if (!pruneSkipped) {
        removeManagedFile(importFile, "claude-global", items);
        removeSection(claudeMd, "claude-global", items);
      }
    } else {
      writeManagedFile(importFile, "claude-global", renderClaudeImportFile(globalCompose), items);
      upsertSection(claudeMd, "claude-global", renderClaudeGlobalStubSection(), items);
    }
  } else {
    skippedTargets.push({ target: "claude-global", reason: `${claudeHome} 폴더가 없습니다 (Claude Code 미설치?)` });
  }

  // ── Codex 글로벌 ──
  if (fs.existsSync(codexHome)) {
    const agentsMd = path.join(codexHome, "AGENTS.md");
    if (globalEmpty) {
      if (!pruneSkipped) removeSection(agentsMd, "codex-global", items);
    } else {
      upsertSection(agentsMd, "codex-global", renderCodexGlobalSection(globalCompose), items);
    }
  } else {
    skippedTargets.push({ target: "codex-global", reason: `${codexHome} 폴더가 없습니다 (Codex CLI 미설치?)` });
  }

  // ── repo (cwd in-place) ──
  let project: string | null | undefined = undefined;
  if (opts.repoDir) {
    const repoDir = path.resolve(expandHome(opts.repoDir));
    if (!fs.existsSync(repoDir) || !fs.statSync(repoDir).isDirectory()) {
      skippedTargets.push({ target: "repo", reason: `${repoDir} 폴더가 없습니다` });
    } else {
      const { project: matched, ambiguous } = matchProject(path.basename(repoDir), registry.overlays.keys());
      if (ambiguous.length > 0) warnings.push(`repo "${path.basename(repoDir)}"가 여러 overlay와 모호하게 매칭됩니다(${ambiguous.join(", ")}) — repo 표면 배포를 건너뜁니다(base는 글로벌 표면이 주입)`);
      project = matched;
      const overlay = matched ? registry.overlays.get(matched) ?? [] : [];
      // repo 표면은 **overlay-only**. base는 글로벌 표면(Claude @import·Codex ~/.codex/AGENTS.md)이
      // 이미 주입하므로, repo에 base를 다시 인라인하면 Codex가 base를 이중 계상해 32KiB를 압박한다
      // (T090 확정). overlay 없는 repo는 repo 파일을 만들지 않는다(base는 글로벌이 책임).
      const repoCompose = compose([], overlay);
      const agentsMd = path.join(repoDir, "AGENTS.md");
      const claudeMd = path.join(repoDir, "CLAUDE.md");
      if (repoCompose.docs.length === 0) {
        if (!pruneSkipped) {
          removeSection(agentsMd, "repo", items);
          removeSection(claudeMd, "repo", items);
        }
      } else {
        upsertSection(agentsMd, "repo", renderRepoAgentsSection(repoCompose), items);
        upsertSection(claudeMd, "repo", renderRepoClaudeStubSection(), items);
      }
    }
  }

  return {
    baseCount: registry.base.length,
    project,
    items,
    problems: registry.problems,
    warnings,
    skippedTargets,
    pruneSkipped,
  };
}

/** 결과를 비개발자도 읽을 수 있는 한국어로 요약한다. */
export function formatRulesResult(r: RulesDeployResult): string {
  const lines: string[] = [];
  if (r.baseCount === 0 && r.problems.length === 0) {
    lines.push("배포할 base 규칙이 없습니다 — 규칙 정본 폴더 base/에 규칙 문서(.md)를 추가하세요.");
  } else {
    lines.push(`base 규칙 ${r.baseCount}개 처리${r.project ? ` · overlay 프로젝트: ${r.project}` : ""}:`);
  }
  const label: Record<RulesStatus, string> = {
    created: "생성됨",
    updated: "갱신됨",
    unchanged: "변경 없음",
    removed: "정리됨(managed 산출물 제거 — 정본에서 사라진 규칙)",
    "skipped-unmanaged": "건너뜀(직접 만든 파일 보호)",
    "skipped-malformed": "건너뜀(managed 섹션이 손상됨 — 수동 확인 필요)",
  };
  for (const it of r.items) lines.push(`  [${it.surface}] ${it.file}: ${label[it.status]}`);
  for (const s of r.skippedTargets) lines.push(`${s.target} 배포 건너뜀: ${s.reason}`);
  for (const p of r.problems) lines.push(`문제: ${p.file} — ${p.reason}`);
  if (r.pruneSkipped) lines.push("검증 문제가 있어 정리(prune)는 건너뛰었습니다 — 문제를 고친 뒤 다시 배포하세요.");
  for (const w of r.warnings) lines.push(`참고: ${w}`);
  return lines.join("\n");
}
