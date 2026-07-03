/**
 * 페르소나 배포 — 레지스트리 정본을 Claude Code·Codex 설정으로 내보낸다 (specs/016 FR-3~FR-8).
 *
 * 원칙: 파일이 정본, 산출물은 파생·재생성. 산출물에는 managed 마커를 넣고,
 * 마커 있는 파일만 갱신·삭제한다(사용자가 직접 만든 파일은 불가침 — FR-5).
 * 정본에서 사라진 페르소나의 산출물은 prune한다(FR-6). 단, 레지스트리에 검증 문제가
 * 있으면 prune을 건너뛴다 — 깨진 정본 때문에 이름을 알 수 없는 상태에서 지웠다간
 * 멀쩡한 산출물이 날아갈 수 있기 때문.
 */
import fs from "node:fs";
import path from "node:path";
import { agentsDir, loadRegistry, type Persona, type Registry, type RegistryProblem } from "./registry.js";

export const MANAGED_MARKER = "managed-by: localmind";

/**
 * 마커에 페르소나 이름을 바인딩한다(self-review 중대-1). 산출물을 복사해 개인화한
 * 파일은 마커의 이름과 파일명이 달라지므로 갱신·prune 대상에서 자동으로 벗어난다 —
 * "직접 만든 파일 불가침"이 복사본에도 성립한다.
 */
function markerFor(name: string): string {
  return `${MANAGED_MARKER} (persona: ${name})`;
}

/** 내용 어딘가에 이 이름으로 바인딩된 마커가 있는가. 첫 매치만 보면 description에
 *  마커 형식 문자열이 들어간 자기 산출물을 놓친다(재검 P2) — 전체 매치를 훑는다. */
function hasMarkerFor(content: string, name: string): boolean {
  for (const m of content.matchAll(/managed-by: localmind \(persona: ([a-z0-9-]+)\)/g)) {
    if (m[1] === name) return true;
  }
  return false;
}

export interface DeployOptions {
  registryDir?: string;
  claudeAgentsDir?: string;
  codexHome?: string;
}
export interface DeployItem {
  target: "claude" | "codex";
  /** 산출물 경로(대상 폴더 기준 상대) */
  file: string;
  status: "created" | "updated" | "unchanged" | "skipped-unmanaged" | "pruned";
}
export interface DeployResult {
  personaCount: number;
  items: DeployItem[];
  problems: RegistryProblem[];
  warnings: string[];
  skippedTargets: { target: "claude" | "codex"; reason: string }[];
  pruneSkipped: boolean;
}

function expandHome(p: string): string {
  return p.replace(/^~(?=$|\/)/, process.env.HOME ?? "~");
}

function defaultClaudeAgentsDir(): string {
  const env = process.env.LOCALMIND_CLAUDE_AGENTS_DIR?.trim();
  if (env) return path.resolve(expandHome(env));
  return path.join(process.env.HOME ?? ".", ".claude", "agents");
}

function defaultCodexHome(): string {
  const env = (process.env.LOCALMIND_CODEX_HOME ?? process.env.CODEX_HOME)?.trim();
  if (env) return path.resolve(expandHome(env));
  return path.join(process.env.HOME ?? ".", ".codex");
}

// ── 변환(순수 함수) ──────────────────────────────────────────────────

function yamlQuote(s: string): string {
  return JSON.stringify(s); // JSON 문자열은 유효한 YAML 큰따옴표 스칼라다
}

/** TOML이 허용하지 않는 원시 제어문자를 \uXXXX로 바꾼다(self-review 경미-2). 탭·개행은
 *  유지, 단독 CR(\x0D)은 TOML이 거부하므로 포함한다(재검 P5). */
function escapeControl(s: string): string {
  return s.replace(/[\x00-\x08\x0B-\x0D\x0E-\x1F\x7F]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/** TOML 기본 문자열("...")용 이스케이프 */
function tomlString(s: string): string {
  return `"${escapeControl(s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')).replace(/\n/g, "\\n")}"`;
}

/** TOML 다중행 기본 문자열("""...""")용 — 백슬래시·따옴표·제어문자를 이스케이프한다 */
function tomlMultiline(s: string): string {
  const escaped = escapeControl(s.replace(/\\/g, "\\\\").replace(/"/g, '\\"'));
  return `"""\n${escaped}\n"""`;
}

/** Claude Code 서브에이전트 파일(~/.claude/agents/<name>.md) */
export function renderClaudeAgent(p: Persona): string {
  const t = p.targets.claude!;
  const lines = [
    "---",
    `name: ${p.name}`,
    `description: ${yamlQuote(p.description)}`,
    ...(t.tools ? [`tools: ${yamlQuote(t.tools)}`] : []),
    `model: ${t.model}`,
    "---",
    `<!-- ${markerFor(p.name)} — localmind 레지스트리에서 생성됨. 수정은 정본(agents/${p.file})에서. -->`,
    "",
    p.prompt,
    "",
  ];
  return lines.join("\n");
}

/** Codex 프로필(<codexHome>/<name>.config.toml) — `codex exec -p <name>` 위임용 */
export function renderCodexProfile(p: Persona): string {
  const t = p.targets.codex!;
  const lines = [
    `# ${markerFor(p.name)} — localmind 레지스트리에서 생성됨. 수정은 정본(agents/${p.file})에서.`,
    `model = ${tomlString(t.model)}`,
    ...(t.reasoning_effort ? [`model_reasoning_effort = ${tomlString(t.reasoning_effort)}`] : []),
    ...(t.sandbox ? [`sandbox_mode = ${tomlString(t.sandbox)}`] : []),
    "",
  ];
  return lines.join("\n");
}

/** Codex 네이티브 에이전트(<codexHome>/agents/<name>.toml) — 페르소나 지침 포함 */
export function renderCodexAgent(p: Persona): string {
  const t = p.targets.codex!;
  const lines = [
    `# ${markerFor(p.name)} — localmind 레지스트리에서 생성됨. 수정은 정본(agents/${p.file})에서.`,
    `name = ${tomlString(p.name)}`,
    `description = ${tomlString(p.description)}`,
    `model = ${tomlString(t.model)}`,
    ...(t.reasoning_effort ? [`model_reasoning_effort = ${tomlString(t.reasoning_effort)}`] : []),
    `developer_instructions = ${tomlMultiline(p.prompt)}`,
    "",
  ];
  return lines.join("\n");
}

// ── 배포 ─────────────────────────────────────────────────────────────

/**
 * 이 파일이 "페르소나 name의 localmind 산출물"인지 판정한다. 파일 전체를 읽고
 * (앞부분 몇 백 자만 보면 긴 description에서 오판한다 — self-review 중대-2),
 * 마커에 바인딩된 이름까지 일치해야 managed다(복사본 보호 — self-review 중대-1).
 */
function isManagedFor(filePath: string, name: string): boolean {
  try {
    return hasMarkerFor(fs.readFileSync(filePath, "utf8"), name);
  } catch {
    return false;
  }
}

/** 파일 하나를 멱등하게 쓴다. 이 페르소나의 산출물이 아닌 기존 파일은 불가침(FR-5). */
function writeManaged(target: "claude" | "codex", filePath: string, relFile: string, name: string, content: string, items: DeployItem[]) {
  if (fs.existsSync(filePath)) {
    if (!isManagedFor(filePath, name)) {
      items.push({ target, file: relFile, status: "skipped-unmanaged" });
      return;
    }
    const current = fs.readFileSync(filePath, "utf8");
    if (current === content) {
      items.push({ target, file: relFile, status: "unchanged" });
      return;
    }
    fs.writeFileSync(filePath, content);
    items.push({ target, file: relFile, status: "updated" });
    return;
  }
  fs.writeFileSync(filePath, content);
  items.push({ target, file: relFile, status: "created" });
}

/** dir의 managed 파일 중 keep에 없는 이름을 지운다(FR-6). 파일명과 마커 이름이
 *  일치하는 파일만 산출물로 인정한다 — 복사·개명된 파일은 사용자 소유로 보고 남긴다. */
function pruneManaged(
  target: "claude" | "codex",
  dir: string,
  suffix: string,
  keep: Set<string>,
  items: DeployItem[],
) {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(suffix)) continue;
    const name = e.name.slice(0, -suffix.length);
    if (keep.has(name)) continue;
    const full = path.join(dir, e.name);
    if (!isManagedFor(full, name)) continue;
    fs.rmSync(full);
    items.push({ target, file: path.relative(dir, full) || e.name, status: "pruned" });
  }
}

/** 레지스트리를 읽어 Claude Code·Codex 산출물을 생성·갱신·정리한다. */
export function deployAgents(opts: DeployOptions = {}): DeployResult {
  const registryDir = opts.registryDir ?? agentsDir();
  const claudeDir = opts.claudeAgentsDir ?? defaultClaudeAgentsDir();
  const codexHome = opts.codexHome ?? defaultCodexHome();

  const registry: Registry = loadRegistry(registryDir);
  const items: DeployItem[] = [];
  const skippedTargets: DeployResult["skippedTargets"] = [];

  // 대상 가용성: 도구가 설치된 흔적(상위 폴더)이 있어야 배포한다(FR-8).
  // ~/.claude가 없는데 만들어 버리면 "도구 미설치" 상태를 가리게 된다.
  const claudeAvailable = fs.existsSync(path.dirname(claudeDir));
  if (!claudeAvailable) {
    skippedTargets.push({ target: "claude", reason: `${path.dirname(claudeDir)} 폴더가 없습니다 (Claude Code 미설치?)` });
  } else {
    fs.mkdirSync(claudeDir, { recursive: true });
  }
  const codexAvailable = fs.existsSync(codexHome);
  const codexAgentsDir = path.join(codexHome, "agents");
  if (!codexAvailable) {
    skippedTargets.push({ target: "codex", reason: `${codexHome} 폴더가 없습니다 (Codex CLI 미설치?)` });
  } else {
    fs.mkdirSync(codexAgentsDir, { recursive: true });
  }

  const claudeNames = new Set<string>();
  const codexNames = new Set<string>();

  for (const p of registry.personas) {
    if (p.targets.claude && claudeAvailable) {
      claudeNames.add(p.name);
      writeManaged("claude", path.join(claudeDir, `${p.name}.md`), `${p.name}.md`, p.name, renderClaudeAgent(p), items);
    }
    if (p.targets.codex && codexAvailable) {
      codexNames.add(p.name);
      writeManaged("codex", path.join(codexHome, `${p.name}.config.toml`), `${p.name}.config.toml`, p.name, renderCodexProfile(p), items);
      writeManaged("codex", path.join(codexAgentsDir, `${p.name}.toml`), `agents/${p.name}.toml`, p.name, renderCodexAgent(p), items);
    }
  }

  const pruneSkipped = registry.problems.length > 0;
  if (!pruneSkipped) {
    if (claudeAvailable) pruneManaged("claude", claudeDir, ".md", claudeNames, items);
    if (codexAvailable) {
      pruneManaged("codex", codexHome, ".config.toml", codexNames, items);
      pruneManaged("codex", codexAgentsDir, ".toml", codexNames, items);
    }
  }

  return {
    personaCount: registry.personas.length,
    items,
    problems: registry.problems,
    warnings: registry.warnings,
    skippedTargets,
    pruneSkipped,
  };
}

/** 결과를 비개발자도 읽을 수 있는 한국어로 요약한다. */
export function formatDeployResult(r: DeployResult): string {
  const lines: string[] = [];
  if (r.personaCount === 0 && r.problems.length === 0) {
    lines.push("배포할 페르소나가 없습니다 — 레지스트리 폴더에 페르소나 정의(.md)를 추가하세요.");
  } else {
    lines.push(`페르소나 ${r.personaCount}개 처리:`);
  }
  const label: Record<DeployItem["status"], string> = {
    created: "생성됨",
    updated: "갱신됨",
    unchanged: "변경 없음",
    "skipped-unmanaged": "건너뜀(직접 만든 파일 보호)",
    pruned: "정리됨(정본에서 삭제됨)",
  };
  for (const it of r.items) {
    lines.push(`  [${it.target}] ${it.file}: ${label[it.status]}`);
  }
  for (const s of r.skippedTargets) {
    lines.push(`${s.target} 배포 건너뜀: ${s.reason}`);
  }
  for (const p of r.problems) {
    lines.push(`문제: ${p.file} — ${p.reason}`);
  }
  if (r.pruneSkipped) {
    lines.push("검증 문제가 있어 정리(prune)는 건너뛰었습니다 — 문제를 고친 뒤 다시 배포하세요.");
  }
  for (const w of r.warnings) {
    lines.push(`참고: ${w}`);
  }
  return lines.join("\n");
}
