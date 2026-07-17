/**
 * 논리 command invocation matrix와 Gemini CLI native TOML wrapper 생성/동기화 (specs/044 FR-5).
 *
 * Gemini wrapper는 두 번째 수동 정본이 아니라 매 deploy에서 재생성하는 adapter다. workspace의
 * 동명 skill lookup이나 self-asserted fingerprint를 신뢰하지 않고, verified packaged canonical
 * body를 generated prompt에 결정적으로 inline한다. `{{args}}`는 generated workflow 경계 밖에 한 번.
 * source hash는 감사용 comment이며 authorization이나 runtime attestation이 아니다.
 *
 * 형식은 2026-07-12 공식 재확인: `~/.gemini/commands/<name>.toml`, `prompt` 필수/`description` 선택,
 * `{{args}}` 본문 치환, `!{...}`/`@{...}` preprocessing directive.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  type SkillPackage,
  type ActivationClass,
  type SideEffectClass,
  splitFrontmatter,
  isTextResourcePath,
  hasCommandMarker,
  commandMarkerText,
  TARGET_METADATA_FILES,
} from "./skill-contract.js";
import { replaceManagedFile, pruneManagedFile, recoverManagedFile, type FsOps, type ReconcileResult } from "./reconcile.js";
import { enforcementFor, type EnforcementLevel, type WorkflowTargetId } from "./workflow-policy.js";

// ── invocation matrix ──────────────────────────────────────────────────────
// 논리 ID는 같지만 native invocation token은 runtime 공식 문법을 따른다.
// Codex는 bare `/name`을 등록하지 않으므로 `$name`으로 표기한다(존재하지 않는 slash 약속 금지).

export interface RuntimeInvocations {
  claude: string; // Claude Code: /name
  codex: string; // Codex: $name
  gemini: string; // Gemini CLI: auto skill 또는 /name wrapper
}

export function invocationsFor(logicalId: string, argHint = ""): RuntimeInvocations {
  const arg = argHint ? ` ${argHint}` : "";
  return {
    claude: `/${logicalId}${arg}`,
    codex: `$${logicalId}${arg}`,
    gemini: `auto skill 또는 /${logicalId}${arg} wrapper`,
  };
}

export interface InvocationReportRow {
  logicalId: string;
  claude: string;
  codex: string;
  gemini: string;
  activation: ActivationClass;
  sideEffects: SideEffectClass;
  enforcement: Record<Exclude<WorkflowTargetId, "canonical-seed">, EnforcementLevel>;
}

/**
 * 논리 ID별 invocation matrix와 activation/enforcement를 정직하게 보고한다(문서·요약용).
 * Codex는 `$name`으로만 표기하고 존재하지 않는 bare `/name`을 약속하지 않는다.
 */
export function invocationReport(skills: SkillPackage[]): InvocationReportRow[] {
  return skills
    .filter((s) => s.policy)
    .map((s) => {
      const inv = invocationsFor(s.name);
      return {
        logicalId: s.name,
        claude: inv.claude,
        codex: inv.codex,
        gemini: inv.gemini,
        activation: s.policy!.activation,
        sideEffects: s.policy!.sideEffects,
        enforcement: {
          "claude-skill": enforcementFor("claude-skill", s.policy!),
          "agent-skill": enforcementFor("agent-skill", s.policy!),
          "gemini-command": enforcementFor("gemini-command", s.policy!),
        },
      } as InvocationReportRow;
    })
    .sort((a, b) => a.logicalId.localeCompare(b.logicalId));
}

// ── TOML basic-string encoder(안전) ─────────────────────────────────────────

/**
 * TOML basic string 하나로 인코딩한다. quote/backslash/control/LF를 escape하고 invalid
 * Unicode scalar(lone surrogate)는 거부한다. multiline delimiter에 의존하지 않는다.
 */
export function tomlBasicString(s: string): string {
  let out = '"';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0xd800 && cp <= 0xdfff) {
      throw new Error("TOML 인코딩 실패: 유효하지 않은 Unicode scalar(lone surrogate)");
    }
    switch (ch) {
      case '"':
        out += '\\"';
        break;
      case "\\":
        out += "\\\\";
        break;
      case "\b":
        out += "\\b";
        break;
      case "\t":
        out += "\\t";
        break;
      case "\n":
        out += "\\n";
        break;
      case "\f":
        out += "\\f";
        break;
      case "\r":
        out += "\\r";
        break;
      default:
        if (cp < 0x20 || cp === 0x7f) out += `\\u${cp.toString(16).padStart(4, "0").toUpperCase()}`;
        else out += ch;
    }
  }
  return out + '"';
}

/** description을 single-line로 정규화한다(CR/LF/tab·연속 whitespace → ASCII space 하나 + trim). */
export function foldDescription(desc: string): string {
  return desc.replace(/\s+/g, " ").trim();
}

const GEMINI_DIRECTIVE_RE = /\{\{args\}\}|!\{|@\{/;

/** canonical body/reference에 Gemini preprocessing directive가 있으면 validation error. */
function assertNoDirectives(where: string, text: string): void {
  if (GEMINI_DIRECTIVE_RE.test(text)) {
    throw new Error(`${where}에 Gemini directive(\`{{args}}\`/\`!{...}\`/\`@{...}\`)가 있어 wrapper로 렌더할 수 없습니다`);
  }
}

// ── 생성 envelope의 고정 리터럴(render와 validator가 공유해 드리프트 방지, R3-02) ──────────
const REQUEST_HEAD = "LocalMind generated command request:";
const REQUEST_DISCLAIMER = "The command request carries arguments but is not runtime attestation. Apply the activation policy in the generated workflow below.";
const WF_BEGIN = "--- BEGIN LOCALMIND GENERATED WORKFLOW ---";
const WF_END = "--- END LOCALMIND GENERATED WORKFLOW ---";
const REF_BEGIN = "--- BEGIN REFERENCE:";
const REF_END = "--- END REFERENCE ---";

/** 생성 prompt envelope의 고정 prefix(workflow 본문 앞) — logical-id를 name에 결정적으로 바인딩한다. */
function generatedPromptPrefix(name: string): string {
  return (
    `${REQUEST_HEAD}\n` +
    `logical-id=${name}\n` +
    "raw-args={{args}}\n\n" +
    `${REQUEST_DISCLAIMER}\n\n` +
    `${WF_BEGIN}\n`
  );
}
/** 생성 prompt envelope의 고정 suffix(workflow 본문 뒤). */
const GENERATED_PROMPT_SUFFIX = `\n${WF_END}`;

/**
 * inline되는 body/reference가 예약된 workflow/reference 경계 구분자를 포함하면 위조로 보고 거부한다
 * (R1-15). {{args}}가 암호학적으로 경계를 보장할 수 없으므로, 경계 문자열 자체의 재유입을 렌더 전에
 * 막아 주입된 fixture가 경계를 위조하지 못하게 한다.
 */
const BOUNDARY_MARKERS = [WF_BEGIN, WF_END, REF_BEGIN, REF_END];
function assertNoBoundaryForgery(where: string, text: string): void {
  for (const m of BOUNDARY_MARKERS) {
    if (text.includes(m)) {
      throw new Error(`${where}에 예약된 경계 구분자("${m}")가 있어 wrapper로 안전하게 렌더할 수 없습니다`);
    }
  }
}

/** reference 상대경로에 제어문자/개행/경계 구분자가 있으면 거부한다(경계/헤더 위조 방지, R1-15). */
function assertSafeRefPath(rel: string): void {
  if (/[\u0000-\u001f\u007f]/.test(rel)) {
    throw new Error(`reference 경로에 제어문자가 있어 wrapper로 렌더할 수 없습니다: ${JSON.stringify(rel)}`);
  }
  if (rel.includes("---")) {
    throw new Error(`reference 경로에 경계 구분자 문자열(---)이 있어 wrapper로 렌더할 수 없습니다: ${rel}`);
  }
}

export interface InlineRef {
  path: string;
  content: string;
  hash: string;
}

/**
 * template SKILL.md에서 frontmatter/marker를 제거한 canonical workflow body를 얻는다.
 * frontmatter가 없거나 닫히지 않은 malformed 입력은 전체를 본문으로 삼지 않고 예외를 던진다(R1-15).
 */
export function canonicalBody(skillMd: string): string {
  const split = splitFrontmatter(skillMd);
  if ("error" in split) {
    throw new Error(`wrapper 렌더 실패 — SKILL.md frontmatter가 유효하지 않습니다: ${split.error}`);
  }
  return split.body.replace(/^[ \t]*<!--[ \t]*managed-by: localmind[^\n]*-->[ \t]*\n?/gm, "").trim();
}

/** packaged skill이 wrapper self-containment 규칙을 만족하는가(text만, executable/binary 없음). */
export function wrapperSelfContained(skill: SkillPackage): boolean {
  for (const rel of skill.files) {
    if (rel === "SKILL.md" || TARGET_METADATA_FILES.has(rel)) continue;
    if (skill.executableFiles.includes(rel)) return false; // 실행 전제 금지
    if (!isTextResourcePath(rel)) return false; // 비-text 자원 금지
  }
  return true;
}

/** 실행에 필수인 UTF-8 text reference를 결정적 순서로 모은다(경계/경로 위조는 렌더 전에 거부). */
export function gatherRefs(skill: SkillPackage): InlineRef[] {
  const refs: InlineRef[] = [];
  for (const rel of skill.files) {
    if (rel === "SKILL.md" || TARGET_METADATA_FILES.has(rel)) continue;
    if (!isTextResourcePath(rel)) continue;
    assertSafeRefPath(rel);
    const content = fs.readFileSync(path.join(skill.root, rel), "utf8");
    assertNoBoundaryForgery(`reference ${rel}`, content);
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    refs.push({ path: rel, content, hash });
  }
  return refs.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * verified packaged canonical skill에서 Gemini command TOML wrapper를 결정적으로 렌더한다.
 * comment(marker/source-hash) → description → prompt(logical-id/raw-args/workflow boundary) 순서.
 */
export function renderGeminiCommand(skill: SkillPackage): string {
  const name = skill.name;
  const body = canonicalBody(fs.readFileSync(path.join(skill.root, "SKILL.md"), "utf8"));
  assertNoDirectives(`workflow body(${name})`, body);
  assertNoBoundaryForgery(`workflow body(${name})`, body);
  const refs = gatherRefs(skill);

  let workflow = body;
  for (const r of refs) {
    assertNoDirectives(`reference ${r.path}`, r.content);
    workflow += `\n\n${REF_BEGIN} ${r.path} (sha256: ${r.hash}) ---\n${r.content}\n${REF_END}`;
  }

  const prompt = generatedPromptPrefix(name) + workflow + GENERATED_PROMPT_SUFFIX;

  return [
    `# ${commandMarkerText(name)}`,
    `# source-payload-sha256: ${skill.canonicalPayloadHash}`,
    `description = ${tomlBasicString(foldDescription(skill.description))}`,
    `prompt = ${tomlBasicString(prompt)}`,
    "",
  ].join("\n");
}

// ── workspace collision resolution ──────────────────────────────────────────

export type Resolution = "resolved" | "equivalent-shadow" | "ambiguous-shadow" | "unmanaged-shadow" | "unverified";

export interface WorkspaceContext {
  cwd: string;
  repoRoot: string;
}

/** cwd에서 repoRoot까지(경계 포함) 상위 디렉토리를 나열한다. */
function ancestorsUpTo(cwd: string, repoRoot: string): string[] {
  const out: string[] = [];
  let cur = path.resolve(cwd);
  const root = path.resolve(repoRoot);
  for (let i = 0; i < 64; i++) {
    out.push(cur);
    if (cur === root) break;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return out;
}

/**
 * cwd가 repoRoot 안(같거나 하위)인지 lexical로 검증한다. 밖이면 무관한 상위를 스캔하지 않고
 * `unverified`로 처리한다(R1-11).
 */
export function cwdInsideRepo(cwd: string, repoRoot: string): boolean {
  const c = path.resolve(cwd);
  const r = path.resolve(repoRoot);
  return c === r || c.startsWith(r + path.sep);
}

/**
 * Codex repo `.agents/skills/<id>`가 user skill을 shadow하는지 검사한다.
 * cwd가 repo 밖이면 unverified. 같은 이름 항목이 symlink/비디렉토리면 따라가지 않고 ambiguous-shadow.
 * 실제 디렉토리는 exact validator로 판정해 package-equivalent이면 equivalent-shadow, 아니면 ambiguous-shadow.
 */
export function resolveCodexRepoSkill(logicalId: string, ws: WorkspaceContext, isEquivalent: (dir: string) => boolean): Resolution {
  if (!cwdInsideRepo(ws.cwd, ws.repoRoot)) return "unverified";
  for (const dir of ancestorsUpTo(ws.cwd, ws.repoRoot)) {
    const skillDir = path.join(dir, ".agents", "skills", logicalId);
    let st: fs.Stats;
    try {
      st = fs.lstatSync(skillDir);
    } catch {
      continue; // 없음 — 상위 계속
    }
    if (st.isSymbolicLink() || !st.isDirectory()) return "ambiguous-shadow"; // 따라가지 않음
    return isEquivalent(skillDir) ? "equivalent-shadow" : "ambiguous-shadow";
  }
  return "resolved";
}

export interface GeminiResolution {
  command: Resolution;
  /** workspace skill이 auto-activation 후보를 바꾸는가(그렇다면 auto parity 미검증) */
  skillShadow: boolean;
}

/** Gemini workspace command/skill collision을 검사한다. cwd가 repo 밖이면 unverified. */
export function resolveGeminiWorkspace(logicalId: string, ws: WorkspaceContext, expectedCommandContent: string): GeminiResolution {
  if (!cwdInsideRepo(ws.cwd, ws.repoRoot)) return { command: "unverified", skillShadow: false };
  let command: Resolution = "resolved";
  for (const dir of ancestorsUpTo(ws.cwd, ws.repoRoot)) {
    const cmd = path.join(dir, ".gemini", "commands", `${logicalId}.toml`);
    let st: fs.Stats;
    try {
      st = fs.lstatSync(cmd);
    } catch {
      continue; // 없음 — 상위 계속
    }
    if (st.isSymbolicLink() || !st.isFile()) {
      command = "unmanaged-shadow"; // symlink/특수 파일은 따라가지 않고 unmanaged로 본다
      break;
    }
    const content = fs.readFileSync(cmd, "utf8");
    command = content === expectedCommandContent ? "equivalent-shadow" : "unmanaged-shadow";
    break;
  }
  const pathExists = (p: string): boolean => {
    try {
      fs.lstatSync(p);
      return true;
    } catch {
      return false;
    }
  };
  let skillShadow = false;
  for (const dir of ancestorsUpTo(ws.cwd, ws.repoRoot)) {
    // 존재하기만 하면(디렉토리·symlink·특수) auto-activation 후보를 바꿀 수 있으므로 미검증으로 본다.
    if (pathExists(path.join(dir, ".gemini", "skills", logicalId)) || pathExists(path.join(dir, ".agents", "skills", logicalId))) {
      skillShadow = true;
      break;
    }
  }
  return { command, skillShadow };
}

// ── command file sync(reconcile 재사용) ──────────────────────────────────────

export interface GeminiSyncItem {
  logicalId: string;
  status: ReconcileResult["status"] | "skipped-unavailable" | "skipped-dependency";
  reason?: string;
  invocation?: string;
  resolution?: Resolution;
  skillShadowUnverified?: boolean;
}

export interface GeminiSyncOptions {
  /** packaged 검증 통과한 template registry의 skill들(정본 wrapper 소스) */
  templates: SkillPackage[];
  /** 각 logical ID가 wrapper eligible한가(active data source가 managed+equivalent) */
  eligible: (logicalId: string) => boolean;
  /** eligible하지 않은 이유(fork/invalid 구분 보고용) */
  ineligibleReason: (logicalId: string) => string;
  commandsDir: string;
  available: boolean;
  /** 정본 문제로 source-absence 정리를 보류할지(skill-dir target sweep과 동일 조건, F-18). */
  pruneSuppressed?: boolean;
  ops?: FsOps;
  workspace?: WorkspaceContext;
  /** R4-02: command mutation 직전 runtime parent/root 신원 재검(위반 시 problem). */
  guard?: () => string | null;
}

const cmdOwnedBy = (name: string) => (file: string) => {
  try {
    return hasCommandMarker(fs.readFileSync(file, "utf8"), name);
  } catch {
    return false;
  }
};

/** commandsDir의 이름 결합 managed `.toml` 파일 이름(확장자 제외) 목록. */
function managedTomlNames(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".toml") && !e.name.startsWith("."))
      .map((e) => e.name.slice(0, -".toml".length))
      .filter((name) => cmdOwnedBy(name)(path.join(dir, `${name}.toml`)));
  } catch {
    return [];
  }
}

/**
 * 문자열 s를 **정확히 하나의 유효하게 종료된 TOML basic string**으로 decode한다(닫는 따옴표 뒤
 * 잔여물 금지). 유효한 escape만 인정하고, raw control 문자(개행 포함)·dangling backslash·미종료·
 * 유효하지 않은 Unicode scalar(surrogate/범위 초과)를 거부한다(null 반환). escaped final quote
 * (`"...\"`)는 닫는 따옴표가 escape되어 미종료로 판정된다.
 */
export function decodeTomlBasicString(s: string): string | null {
  if (s.length < 2 || s[0] !== '"') return null;
  let out = "";
  let i = 1;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\") {
      const n = s[i + 1];
      if (n === undefined) return null; // dangling backslash
      switch (n) {
        case '"': out += '"'; i += 2; break;
        case "\\": out += "\\"; i += 2; break;
        case "b": out += "\b"; i += 2; break;
        case "t": out += "\t"; i += 2; break;
        case "n": out += "\n"; i += 2; break;
        case "f": out += "\f"; i += 2; break;
        case "r": out += "\r"; i += 2; break;
        case "u":
        case "U": {
          const hexLen = n === "u" ? 4 : 8;
          const hex = s.slice(i + 2, i + 2 + hexLen);
          if (hex.length !== hexLen || !/^[0-9a-fA-F]+$/.test(hex)) return null;
          const cp = parseInt(hex, 16);
          if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null; // 유효하지 않은 scalar
          out += String.fromCodePoint(cp);
          i += 2 + hexLen;
          break;
        }
        default:
          return null; // 유효하지 않은 escape
      }
      continue;
    }
    if (c === '"') return i === s.length - 1 ? out : null; // 닫는 따옴표 뒤 잔여물 금지
    const cp = c.codePointAt(0)!;
    if (cp < 0x20 || cp === 0x7f) return null; // raw control char 금지
    out += c;
    i++;
  }
  return null; // 미종료
}

/** tomlBasicString을 예외 없이 감싼다(lone surrogate 등에서 throw → null). */
function safeTomlEncode(s: string): string | null {
  try {
    return tomlBasicString(s);
  } catch {
    return null;
  }
}

/**
 * decode된 prompt가 renderGeminiCommand의 **고정 생성 envelope**인지 검증한다(R3-02). 4줄 스키마와
 * 종료된 TOML 문자열만으로는 임의 지시문이 통과하므로, 실제 envelope를 증명한다:
 * - 고정 request prefix + disclaimer + logical-id=<name> 정확 바인딩 + raw-args={{args}} 1회(고정 위치);
 * - 정확히 한 쌍의 outer workflow 경계(내부에 재출현 금지, 뒤 잔여물 없음);
 * - workflow 안에 directive({{args}}/!{/@{) 재유입 금지;
 * - reference가 있으면 각 블록 헤더가 유일·명확하고 기록 hash가 실제 content hash와 일치.
 */
function validateGeneratedPrompt(promptRaw: string, name: string): boolean {
  const prefix = generatedPromptPrefix(name);
  const suffix = GENERATED_PROMPT_SUFFIX;
  if (!promptRaw.startsWith(prefix) || !promptRaw.endsWith(suffix)) return false;
  if (promptRaw.length < prefix.length + suffix.length) return false;
  const workflow = promptRaw.slice(prefix.length, promptRaw.length - suffix.length);
  // outer 경계는 정확히 한 쌍(prefix/suffix) — 내부 재출현/위조 금지.
  if (workflow.includes(WF_BEGIN) || workflow.includes(WF_END)) return false;
  // directive/추가 args 재유입 금지(render의 assertNoDirectives 대칭 — raw-args는 prefix에 1회뿐).
  if (GEMINI_DIRECTIVE_RE.test(workflow)) return false;
  // reference 블록 검증(없으면 body만).
  const refMarker = `\n\n${REF_BEGIN} `;
  const firstRef = workflow.indexOf(refMarker);
  const body = firstRef === -1 ? workflow : workflow.slice(0, firstRef);
  if (body.includes(REF_BEGIN) || body.includes(REF_END)) return false;
  if (firstRef === -1) return true;
  let i = firstRef;
  while (i < workflow.length) {
    if (!workflow.startsWith(refMarker, i)) return false; // 각 블록은 `\n\n--- BEGIN REFERENCE: `로 시작
    const headerStart = i + 2; // `\n\n` 건너뜀 → REF_BEGIN 시작
    const headerEnd = workflow.indexOf("\n", headerStart);
    if (headerEnd === -1) return false;
    const header = workflow.slice(headerStart, headerEnd);
    const m = /^--- BEGIN REFERENCE: (.+) \(sha256: ([0-9a-f]{64})\) ---$/.exec(header);
    if (!m) return false;
    const refPath = m[1];
    if (refPath.includes("---") || /[\u0000-\u001f\u007f]/.test(refPath)) return false;
    const contentStart = headerEnd + 1;
    const endIdx = workflow.indexOf(`\n${REF_END}`, contentStart);
    if (endIdx === -1) return false;
    const refContent = workflow.slice(contentStart, endIdx);
    if (refContent.includes(REF_BEGIN) || refContent.includes(REF_END)) return false;
    if (crypto.createHash("sha256").update(refContent).digest("hex") !== m[2]) return false;
    i = endIdx + `\n${REF_END}`.length;
  }
  return true;
}

/**
 * 파일 내용이 LocalMind가 생성한 **완전한** Gemini command wrapper인지 — 4줄 스키마뿐 아니라 decode된
 * canonical TOML과 실제 생성 envelope·reference hash까지 정확히 만족하는지 판정한다(R3-01/R3-02).
 * "현재 render 바이트와 동일"이 아니라 "이전 버전이라도 안전하게 복원 가능한 진짜 생성물인가"를 본다 —
 * 중단된 A→B swap의 롤백 backup(직전 버전 A)은 복구하되(FR-6/AC-13/AC-20), escaped-quote·중복 키·
 * trailing junk·truncated·marker-only·wrong-name·**임의 schema-valid prompt**·wrong logical-id·
 * raw-args 누락/중복·workflow 경계 위조·비정규 Unicode escape·reference hash 불일치는 모두 거부한다.
 * self-asserted source-hash는 형식(64 hex)만 보고 attestation으로 신뢰하지 않는다.
 */
export function isGeneratedWrapperFile(content: string, name: string): boolean {
  if (content.includes("\r")) return false;
  const lines = content.split("\n");
  // 정확히 4개의 내용 줄 + 종료 개행 뒤의 빈 원소(종료 개행 하나, 뒤 잔여물 없음).
  if (lines.length !== 5 || lines[4] !== "") return false;
  if (lines[0] !== `# ${commandMarkerText(name)}`) return false;
  if (!/^# source-payload-sha256: [0-9a-f]{64}$/.test(lines[1])) return false;
  // description: decode → canonical 재인코딩 동일 + folded + non-empty.
  if (!lines[2].startsWith("description = ")) return false;
  const descQuoted = lines[2].slice("description = ".length);
  const descRaw = decodeTomlBasicString(descQuoted);
  if (descRaw === null || safeTomlEncode(descRaw) !== descQuoted) return false;
  if (foldDescription(descRaw) !== descRaw || descRaw.length === 0) return false;
  // prompt: decode → canonical 재인코딩 동일 + 고정 생성 envelope.
  if (!lines[3].startsWith("prompt = ")) return false;
  const promptQuoted = lines[3].slice("prompt = ".length);
  const promptRaw = decodeTomlBasicString(promptQuoted);
  if (promptRaw === null || safeTomlEncode(promptRaw) !== promptQuoted) return false;
  if (!validateGeneratedPrompt(promptRaw, name)) return false;
  return true;
}

/**
 * 복구 완전성 판정 — 고아 backup/stage가 **완전한 생성 wrapper**인가(현재 버전 동일성이 아님).
 * 현재 render와의 동일성(멱등 판단)은 replaceManagedFile이 별도로 수행한다. 이 분리가 중단된 swap의
 * 유효한 롤백 backup(직전 버전)을 복구하면서도 위조/truncated backup은 거부하게 한다(R3-01).
 */
const cmdGeneratedComplete = (name: string) => (file: string): boolean => {
  try {
    return isGeneratedWrapperFile(fs.readFileSync(file, "utf8"), name);
  } catch {
    return false;
  }
};

/** packaged catalog의 각 logical ID에 대해 Gemini wrapper를 생성/갱신/prune한다. */
export function syncGeminiCommands(o: GeminiSyncOptions): GeminiSyncItem[] {
  const ops = o.ops;
  const items: GeminiSyncItem[] = [];
  for (const tpl of o.templates) {
    const name = tpl.name;
    const inv = `/${name}`;
    if (!o.available) {
      items.push({ logicalId: name, status: "skipped-unavailable", reason: `${o.commandsDir} 폴더가 없습니다 (Gemini CLI 미설치?)`, invocation: inv });
      continue;
    }

    const eligible = o.eligible(name) && wrapperSelfContained(tpl);

    if (!eligible) {
      // fail-closed: name-bound managed wrapper retire, unmanaged/absent는 각각 보존/dependency
      const pr = pruneManagedFile({ parent: o.commandsDir, fileName: `${name}.toml`, ownedBy: cmdOwnedBy(name), ops, guard: o.guard });
      const reason = wrapperSelfContained(tpl) ? o.ineligibleReason(name) : "self-contained 아님(executable/binary 전제)";
      if (pr.status === "pruned") items.push({ logicalId: name, status: "pruned", reason, invocation: inv });
      else if (pr.status === "skipped-unmanaged") items.push({ logicalId: name, status: "skipped-unmanaged", reason: "unmanaged wrapper 보존", invocation: inv });
      else if (pr.status === "problem") items.push({ logicalId: name, status: "problem", reason: pr.reason, invocation: inv });
      else items.push({ logicalId: name, status: "skipped-dependency", reason, invocation: inv });
      continue;
    }

    // eligible: **결정적 render를 먼저** 한다 — 완전성 콜백을 render 성공 뒤에만 만들어, render가
    // 실패하면 어떤 backup도 승격하지 않는다(R2-03). 이후 복구/교체가 같은 content를 재사용한다.
    let content: string;
    try {
      content = renderGeminiCommand(tpl);
    } catch (err) {
      items.push({ logicalId: name, status: "problem", reason: (err as Error).message, invocation: inv });
      continue;
    }

    // 고아 복구는 eligible한 경우에만 한다 — ineligible(reserved fork 등) wrapper를 visible name으로
    // 복구해 곧 prune하는 잠깐의 재노출을 막는다(R1-07.5). 완전성은 **완전한 생성 wrapper 스키마**로
    // 엄격 판정한다 — escaped-quote/중복-키 같은 truncated·invalid backup은 거부하되(R2-03), 중단된
    // A→B swap의 유효한 롤백 backup(직전 버전)은 복구해 전진한다(R3-01). 현재 버전과의 동일성 판단은
    // replaceManagedFile이 별도로 수행한다.
    const rec = recoverManagedFile({ parent: o.commandsDir, fileName: `${name}.toml`, ownedBy: cmdOwnedBy(name), isComplete: cmdGeneratedComplete(name), ops, guard: o.guard });
    if (rec && rec.status === "problem") {
      items.push({ logicalId: name, status: "problem", reason: rec.reason, invocation: inv });
      continue;
    }

    const r = replaceManagedFile({ parent: o.commandsDir, fileName: `${name}.toml`, content, ownedBy: cmdOwnedBy(name), ops, guard: o.guard });
    const item: GeminiSyncItem = { logicalId: name, status: r.status, reason: r.reason, invocation: inv };
    if (o.workspace) {
      const g = resolveGeminiWorkspace(name, o.workspace, content);
      item.resolution = g.command;
      item.skillShadowUnverified = g.skillShadow;
    } else {
      item.resolution = "unverified";
    }
    items.push(item);
  }

  // source-absence 정리(D-2②): template 집합에 없는 이름의 managed wrapper를 은퇴시킨다.
  // skill-dir target sweep과 동일 조건(available && !pruneSuppressed) — 정본 문제 시 보류(F-18).
  if (o.available && !o.pruneSuppressed) {
    const templateNames = new Set(o.templates.map((t) => t.name));
    for (const entry of managedTomlNames(o.commandsDir)) {
      if (templateNames.has(entry)) continue;
      const pr = pruneManagedFile({ parent: o.commandsDir, fileName: `${entry}.toml`, ownedBy: cmdOwnedBy(entry), ops, guard: o.guard });
      if (pr.status === "pruned") items.push({ logicalId: entry, status: "pruned", reason: "packaged 정본에서 은퇴됨", invocation: `/${entry}` });
      else if (pr.status === "problem") items.push({ logicalId: entry, status: "problem", reason: pr.reason, invocation: `/${entry}` });
    }
  }
  return items;
}
