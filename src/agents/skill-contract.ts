/**
 * Agent Skills 표준 계약 — SKILL.md frontmatter/디렉토리 바인딩/자원 순회/manifest 바인딩과
 * packaged workflow 중립성 검증 (specs/044 FR-1·FR-3).
 *
 * 정본은 Agent Skills 표준 `SKILL.md` 하나다(agentskills.io/specification, 2026-07-12 재확인):
 * name(1~64, 소문자·숫자·하이픈, 시작/끝/연속 하이픈 금지, 디렉토리명 일치)·description(1~1024)
 * 필수, scripts/references/assets 선택. frontmatter는 ad-hoc 정규식이 아니라 검증된 YAML 1.2
 * parser(`yaml` 2.9.0, ISC, node>=14.6 — 2026-07-12 재확인)로 읽고 zod로 검증한다.
 *
 * runtime 경로·호출 문법·native wrapper는 adapter가 소유한다(이 모듈은 provider/runtime를 모름).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseDocument, visit } from "yaml";
import { z } from "zod";
import { MANAGED_MARKER } from "./deploy.js";

// ── 이름 결합 managed marker ─────────────────────────────────────────────
// skills.ts(016 계승)의 `managed-by: localmind (skill: <name>)`와 동일 규율. 이름까지
// 일치해야 managed로 인정한다 — 복사·개명된 fork는 자동으로 소유권에서 벗어난다.

export function skillMarkerText(name: string): string {
  return `${MANAGED_MARKER} (skill: ${name})`;
}
export function skillMarkerComment(name: string): string {
  return `<!-- ${skillMarkerText(name)} — localmind 정본(데이터 폴더 skills/)에서 배포됨. 수정은 정본에서. -->`;
}
export function commandMarkerText(name: string): string {
  return `${MANAGED_MARKER} (command: ${name})`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 엄격 UTF-8 디코딩 — 잘못된 바이트는 replacement로 뭉개지 않고 null을 반환한다(R1-09). */
export function decodeUtf8Strict(buf: Buffer): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return null;
  }
}

/**
 * 내용에 이 이름으로 바인딩된 skill marker가 **생성된 HTML 주석 형식** 안에 있는가.
 * 본문·코드·인용에 marker 문자열만 언급한 사용자 파일을 오소유하지 않는다(FR-6, 소유권 계약 5:
 * "내용을 읽어 ownership을 추측하지 않는다"). generated marker는 항상 `<!-- … managed-by:
 * localmind (skill: <name>) … -->` 단일 줄이다.
 */
export function hasSkillMarker(content: string, name: string): boolean {
  // 주석이 곧바로 managed-by로 시작해야 한다(주석 중간에 marker 문자열을 prose로 언급한
  // 사용자 파일을 오소유하지 않는다 — R1-09).
  return new RegExp(`<!--[ \\t]*managed-by: localmind \\(skill: ${escapeRegex(name)}\\)[^\\n]*-->`, "m").test(content);
}

/** 임의 이름의 skill marker(HTML 주석 형식)가 하나라도 있는가 — 완전성 판정용. */
export function hasAnySkillMarker(content: string): boolean {
  return /<!--[ \t]*managed-by: localmind \(skill: [a-z0-9-]+\)[^\n]*-->/m.test(content);
}

// ── 표준/안전 검증 규칙(모든 canonical skill 공통) ────────────────────────

const NAME_RE = /^(?!-)(?!.*--)[a-z0-9-]{1,64}(?<!-)$/;
const MAX_FRONTMATTER_BYTES = 64 * 1024;

export type ActivationClass = "intent" | "explicit" | "delegated-or-explicit";
export type SideEffectClass = "docs-only" | "mutating" | "report-only";
export interface WorkflowPolicy {
  activation: ActivationClass;
  sideEffects: SideEffectClass;
}

export interface SkillPackage {
  name: string;
  description: string;
  root: string;
  /** POSIX relative, sorted, regular files only(SKILL.md 포함) */
  files: string[];
  /** mode & 0o111 != 0 인 relative 경로(executable bit 보존 검증용) */
  executableFiles: string[];
  managedSource: boolean;
  /** frontmatter의 name/description 외 top-level 키(사용자 custom skill 전방호환) */
  extraFrontmatterKeys: string[];
  /** normalized canonical payload의 sha256(generated marker/policy 제외) */
  canonicalPayloadHash: string;
  /** packaged manifest에서 온 정책(packaged mode에서만) */
  policy?: WorkflowPolicy;
}

export interface SkillProblem {
  nameOrPath: string;
  reason: string;
}

export interface SkillRegistry {
  skills: SkillPackage[];
  problems: SkillProblem[];
}

export interface LoadOptions {
  /** packaged mode: manifest 1:1 바인딩 + 중립성 검증을 강제한다 */
  packaged?: boolean;
  /** packaged mode에서 이미 로드/검증한 manifest(없으면 이 함수가 catalog.json을 읽는다) */
  manifest?: Manifest;
  /** manifest 파일 경로(packaged mode 기본: <root>/catalog.json) */
  manifestPath?: string;
}

// ── frontmatter parsing(YAML 1.2 + zod) ──────────────────────────────────

interface ParsedSkill {
  name: string;
  description: string;
  extraKeys: string[];
  /** frontmatter 이후 본문(원문, marker 포함) */
  body: string;
}

const frontmatterShape = z.object({
  name: z.string(),
  description: z.string(),
});

/**
 * SKILL.md 원문을 frontmatter 블록과 body로 나눈다. 닫는 구분자는 **정확히 `---` 한 줄**이어야
 * 한다 — `---not-a-delimiter` 같은 접두 위장은 frontmatter 종료로 인정하지 않는다(R1-09).
 */
export function splitFrontmatter(src: string): { fm: string; body: string } | { error: string } {
  const norm = src.replace(/\r\n/g, "\n");
  if (!norm.startsWith("---\n")) {
    return { error: "frontmatter(--- 로 시작하는 머리말)가 없습니다" };
  }
  const lines = norm.split("\n");
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      end = i;
      break;
    }
  }
  if (end < 0) return { error: "frontmatter가 닫히지 않았습니다(정확한 --- 줄 누락)" };
  return { fm: lines.slice(1, end).join("\n"), body: lines.slice(end + 1).join("\n") };
}

/** body에서 이름 결합 managed marker 주석 줄을 제거한다(본문 비어있음 판정·중립성 스캔 공통). */
export function bodyWithoutMarker(body: string): string {
  return body.replace(/^[ \t]*<!--[ \t]*managed-by: localmind[^\n]*-->[ \t]*\n?/gm, "");
}

/** frontmatter를 YAML 1.2 core schema로 읽고 name/description을 검증한다. */
function parseSkillMd(src: string): ParsedSkill | { error: string } {
  const split = splitFrontmatter(src);
  if ("error" in split) return split;
  const { fm, body } = split;

  if (Buffer.byteLength(fm, "utf8") > MAX_FRONTMATTER_BYTES) {
    return { error: "frontmatter가 64 KiB를 넘습니다" };
  }

  const doc = parseDocument(fm, { version: "1.2", schema: "core" });
  if (doc.errors.length > 0) {
    return { error: `frontmatter YAML 오류: ${doc.errors[0].message}` };
  }
  if (doc.warnings.length > 0) {
    // custom/비표준 tag 등 — 최소 계약에서 거부
    return { error: `frontmatter에 지원하지 않는 YAML 구성(태그 등)이 있습니다: ${doc.warnings[0].message}` };
  }
  // alias/anchor 거부(maxAliasCount로는 안 걸림 — 2026-07-12 실측)
  let hasAliasOrAnchor = false;
  visit(doc, {
    Alias() {
      hasAliasOrAnchor = true;
    },
    Node(_key, node) {
      if ((node as { anchor?: string }).anchor) hasAliasOrAnchor = true;
    },
  });
  if (hasAliasOrAnchor) return { error: "frontmatter에 YAML alias/anchor는 허용하지 않습니다" };

  const js = doc.toJS();
  if (js === null || typeof js !== "object" || Array.isArray(js)) {
    return { error: "frontmatter 최상위는 매핑(key: value)이어야 합니다" };
  }
  const parsed = frontmatterShape.safeParse(js);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path?.length ? `${issue.path.join(".")}: ` : "";
    return { error: `frontmatter: ${where}${issue?.message ?? "형식 오류"}` };
  }
  const description = parsed.data.description;
  if (description.trim().length === 0) return { error: "description이 비어 있습니다" };
  if (description.length > 1024) return { error: "description은 1024자를 넘을 수 없습니다" };

  return {
    name: parsed.data.name,
    description,
    extraKeys: Object.keys(js as Record<string, unknown>).filter((k) => k !== "name" && k !== "description"),
    body,
  };
}

// ── payload 정규화 & fingerprint ──────────────────────────────────────────

/**
 * **target-normalized** payload — generated managed marker와 target-specific invocation-control
 * metadata(`disable-model-invocation`)를 제거한다. 배포된 target(Claude/shared)을 clean canonical과
 * 비교(멱등·cross-target hash)할 때 쓴다. 정본 정체성 계산에는 쓰지 않는다(R1-02).
 */
export function normalizeSkillMdPayload(src: string): string {
  const split = splitFrontmatter(src.replace(/\r\n/g, "\n"));
  if ("error" in split) return src.replace(/\r\n/g, "\n");
  let { fm } = split;
  const { body } = split;
  // frontmatter에서 generated Claude invocation-control 키 제거(target에서만 생성되는 필드)
  fm = fm
    .split("\n")
    .filter((line) => !/^disable-model-invocation\s*:/.test(line))
    .join("\n");
  return `---\n${fm}\n---\n${bodyWithoutMarker(body)}`;
}

/**
 * **canonical-identity** payload — managed marker 주석만 제거하고 나머지 frontmatter/본문은 그대로
 * 둔다. 정본(template/data)이 provider field(`disable-model-invocation` 등)를 포함하면 그것을 정체성에
 * 반영해 clean template과 다른 hash가 나오게 한다(fork 감지의 핵심 — R1-02).
 */
export function canonicalIdentityPayload(src: string): string {
  const split = splitFrontmatter(src.replace(/\r\n/g, "\n"));
  if ("error" in split) return src.replace(/\r\n/g, "\n");
  return `---\n${split.fm}\n---\n${bodyWithoutMarker(split.body)}`;
}

function isExecutable(mode: number): boolean {
  return (mode & 0o111) !== 0;
}

/**
 * target-specific invocation-control metadata 파일 — target-normalized hash에서만 제외한다(생성 policy).
 * 정본 정체성 hash에는 포함한다(정본이 이 파일을 가지면 fork로 감지).
 */
export const TARGET_METADATA_FILES: ReadonlySet<string> = new Set(["agents/openai.yaml"]);

type HashMode = "canonical-identity" | "target-normalized";

/**
 * payload hash 인코딩 버전. delimiter(NUL) 기반 tuple 인코딩은 자원 내용이 NUL을 담으면 다음
 * tuple 경계를 위조할 수 있어(R2-02) length-framed로 교체했다. 인코딩을 바꾸면 버전을 올린다.
 */
const PAYLOAD_HASH_VERSION = "localmind/skill-payload/v2";

/**
 * payload hash — sorted relative path + SKILL payload + 그 밖 regular resource bytes + executable
 * bit로 결정적으로 계산한다. 모든 필드를 length-frame(`<byteLen>:<정확한 바이트>`)하고 hash mode와
 * tuple 개수를 도메인으로 함께 프레임해, 어떤 자원 바이트도 인접 tuple 경계를 위조할 수 없게 한다.
 * - `canonical-identity`: 정본 정체성(marker만 제거, provider field/openai.yaml 포함). fork 감지용.
 * - `target-normalized`: 배포 target 비교용(marker + disable-model-invocation + openai.yaml 제외).
 */
function computePayloadHash(root: string, files: string[], executableSet: Set<string>, mode: HashMode): string {
  const h = crypto.createHash("sha256");
  // length-framed 필드: 바이트 길이(십진) + ':' + 정확한 바이트. 길이가 바이트 수를 못 박아
  // 내용이 어떤 delimiter/NUL을 담아도 경계가 모호해지지 않는다.
  const field = (data: string | Buffer): void => {
    const b = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
    h.update(String(b.length));
    h.update(":");
    h.update(b);
  };
  const included = files.filter((rel) => !(mode === "target-normalized" && TARGET_METADATA_FILES.has(rel)));
  field(`${PAYLOAD_HASH_VERSION}\0${mode}`); // 버전 + hash mode 도메인 분리
  field(String(included.length)); // tuple 개수
  for (const rel of included) {
    field(rel);
    field(executableSet.has(rel) ? "x" : "-");
    const abs = path.join(root, rel);
    if (rel === "SKILL.md") {
      const raw = fs.readFileSync(abs, "utf8");
      field(mode === "canonical-identity" ? canonicalIdentityPayload(raw) : normalizeSkillMdPayload(raw));
    } else {
      field(fs.readFileSync(abs));
    }
  }
  return h.digest("hex");
}

// ── 안전한 자원 순회(symlink/special 거부) ───────────────────────────────

interface TraversalResult {
  files: string[];
  executable: Set<string>;
}

/**
 * skill 디렉토리 하위의 regular file을 sorted POSIX 상대경로로 모은다.
 * symlink/special file/디렉토리 탈출은 문제로 던진다(rule 5).
 */
function traverseSkill(realRoot: string): TraversalResult {
  const files: string[] = [];
  const executable = new Set<string>();
  const walk = (dir: string): void => {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      const st = fs.lstatSync(abs);
      if (st.isSymbolicLink()) throw new Error(`심볼릭 링크는 허용하지 않습니다: ${path.relative(realRoot, abs)}`);
      if (st.isDirectory()) {
        walk(abs);
      } else if (st.isFile()) {
        const rel = path.relative(realRoot, abs).split(path.sep).join("/");
        files.push(rel);
        if (isExecutable(st.mode)) executable.add(rel);
      } else {
        throw new Error(`일반 파일이 아닌 항목이 있습니다: ${path.relative(realRoot, abs)}`);
      }
    }
  };
  walk(realRoot);
  files.sort();
  return { files, executable };
}

/**
 * 이미 skill인 디렉토리 하나를 순회해 **target-normalized** payload hash와 파일 목록을 계산한다.
 * 배포된 target의 멱등(up-to-date)·cross-target 비교에 쓴다. symlink/special file은 실패로 본다.
 */
export function inspectSkillDir(skillDir: string): { hash: string; files: string[]; executable: string[] } | { error: string } {
  try {
    const t = traverseSkill(skillDir);
    return { hash: computePayloadHash(skillDir, t.files, t.executable, "target-normalized"), files: t.files, executable: [...t.executable].sort() };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/**
 * 디렉토리가 이름 `name`에 결합된 **완전한 유효 managed skill**인가(R1-07.4). 복구의 isComplete로
 * 쓴다 — "marker만 있으면 완전"이 아니라 traversal(무-symlink) + frontmatter 유효 + name 일치 +
 * marker 존재 + marker 제외 본문 비어있지 않음을 모두 만족해야 한다.
 */
export function isCompleteManagedSkill(dir: string, name: string): boolean {
  let src: Buffer;
  try {
    const st = fs.lstatSync(path.join(dir, "SKILL.md"));
    if (st.isSymbolicLink() || !st.isFile()) return false;
    src = fs.readFileSync(path.join(dir, "SKILL.md"));
  } catch {
    return false;
  }
  const text = decodeUtf8Strict(src);
  if (text === null) return false;
  if (!hasSkillMarker(text, name)) return false;
  const parsed = parseSkillMd(text);
  if ("error" in parsed) return false;
  if (parsed.name !== name) return false;
  if (bodyWithoutMarker(parsed.body).trim().length === 0) return false;
  // 자원 순회가 symlink/special로 실패하지 않아야 완전한 artifact다.
  try {
    traverseSkill(dir);
  } catch {
    return false;
  }
  return true;
}

/** source root가 symlink이면 한 번 realpath로 고정한다(traversal boundary). */
export function resolveSourceRoot(root: string): string {
  try {
    const st = fs.lstatSync(root);
    if (st.isSymbolicLink()) return fs.realpathSync(root);
  } catch {
    /* 없으면 그대로 반환 — 상위에서 처리 */
  }
  return root;
}

// ── manifest(catalog.json) ────────────────────────────────────────────────

const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    workflows: z.record(
      z.string(),
      z
        .object({
          activation: z.enum(["intent", "explicit", "delegated-or-explicit"]),
          sideEffects: z.enum(["docs-only", "mutating", "report-only"]),
        })
        .strict(),
    ),
  })
  .strict();

export type Manifest = z.infer<typeof manifestSchema>;

/**
 * JSON 텍스트에서 같은 object 안의 중복 키를 찾는다. `JSON.parse`는 중복 키를 조용히 마지막
 * 값으로 덮어쓰므로(위조 위험 — R1-09) 파싱 전에 직접 검출한다. 문자열/이스케이프/중첩을 인식한다.
 */
export function findDuplicateKey(text: string): string | null {
  const containers: ("obj" | "arr")[] = [];
  const seenStack: Set<string>[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '"') {
      const start = i;
      i++;
      while (i < n) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      let j = i;
      while (j < n && /\s/.test(text[j])) j++;
      if (containers[containers.length - 1] === "obj" && text[j] === ":") {
        let key: string;
        try {
          key = JSON.parse(text.slice(start, i)) as string;
        } catch {
          key = text.slice(start + 1, i - 1);
        }
        const seen = seenStack[seenStack.length - 1];
        if (seen.has(key)) return key;
        seen.add(key);
      }
      continue;
    }
    if (c === "{") {
      containers.push("obj");
      seenStack.push(new Set());
    } else if (c === "[") {
      containers.push("arr");
      seenStack.push(new Set());
    } else if (c === "}" || c === "]") {
      containers.pop();
      seenStack.pop();
    }
    i++;
  }
  return null;
}

export function loadManifest(manifestPath: string): { manifest: Manifest } | { error: string } {
  let raw: string;
  try {
    raw = fs.readFileSync(manifestPath, "utf8");
  } catch {
    return { error: `activation manifest(catalog.json)를 읽을 수 없습니다: ${manifestPath}` };
  }
  const dup = findDuplicateKey(raw);
  if (dup !== null) {
    return { error: `catalog.json에 중복 키가 있습니다(duplicate key): "${dup}"` };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return { error: `catalog.json이 유효한 JSON이 아닙니다: ${(err as Error).message}` };
  }
  const parsed = manifestSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path?.length ? `${issue.path.join(".")}: ` : "";
    return { error: `catalog.json 형식 오류 — ${where}${issue?.message ?? "unknown"}` };
  }
  return { manifest: parsed.data };
}

// ── 중립성 검증(localmind packaged workflow 전용) ─────────────────────────

/**
 * 재유입 금지 토큰 — provider 이름, 구체 model ID/alias, runtime 전용 tool 식별자,
 * runtime placeholder, 구체 optional adapter 이름. 소문자로 비교한다.
 * adapter/reference fixture는 검사 대상이 아니다(FR-3, AC-8).
 * 표준 용어 `Agent Skills`는 runtime 전용 `Agent tool/type`과 구분해 허용한다.
 */
export const NEUTRALITY_FORBIDDEN_TOKENS: readonly string[] = [
  // provider/제품 이름
  "claude",
  "codex",
  "gemini",
  "openai",
  "anthropic",
  "antigravity",
  // 구체 model ID/alias
  "opus",
  "sonnet",
  "haiku",
  "fable",
  "gpt-",
  "claude-",
  "gemini-",
  // runtime 전용 tool 식별자
  "askuserquestion",
  "webfetch",
  "websearch",
  "capture_note",
  "search_notes",
  "context7",
  // runtime placeholder/directive
  "$arguments",
  "{{args}}",
  "!{",
  "@{",
  // 구체 optional adapter 이름
  "localmind-review",
];

/** `Agent` 단독 tool/type 참조(표준 용어 `Agent Skills`는 제외). */
const AGENT_TOOL_RE = /\bagent\b(?!\s+skills?\b)(?=\s+(tool|type|도구|서브에이전트|subagent))/i;

export interface NeutralityFinding {
  where: string; // 어디서(frontmatter/body/resource path)
  token: string;
}

/** 한 텍스트에서 금지 토큰을 찾는다. */
function scanText(where: string, text: string): NeutralityFinding[] {
  const lower = text.toLowerCase();
  const found: NeutralityFinding[] = [];
  for (const tok of NEUTRALITY_FORBIDDEN_TOKENS) {
    if (lower.includes(tok)) found.push({ where, token: tok });
  }
  if (AGENT_TOOL_RE.test(text)) found.push({ where, token: "Agent tool/type" });
  return found;
}

const TEXT_RESOURCE_RE = /\.(md|markdown|txt|json|ya?ml|toml)$/i;

/** 확장자로 UTF-8 text resource(inline 가능)인지 판정한다. */
export function isTextResourcePath(rel: string): boolean {
  return TEXT_RESOURCE_RE.test(rel);
}

/**
 * 내용에 이 이름으로 바인딩된 command marker가 **생성된 TOML `#` 주석 줄** 안에 있는가.
 * 본문에 marker 문자열만 언급한 사용자 command 파일을 오소유하지 않는다(FR-6).
 */
export function hasCommandMarker(content: string, name: string): boolean {
  // 주석(`#`)이 곧바로 managed-by로 시작해야 한다 — 줄 중간 prose 언급은 소유가 아니다(R1-09).
  return new RegExp(`^[ \\t]*#[ \\t]*managed-by: localmind \\(command: ${escapeRegex(name)}\\)`, "m").test(content);
}

/**
 * packaged skill의 중립성을 검사한다. frontmatter 키는 정확히 name/description이어야 하고
 * description/body/UTF-8 text resource에 금지 토큰이 0건이어야 한다.
 */
export function scanPackagedNeutrality(skill: SkillPackage): NeutralityFinding[] {
  const findings: NeutralityFinding[] = [];
  if (skill.extraFrontmatterKeys.length > 0) {
    for (const k of skill.extraFrontmatterKeys) {
      findings.push({ where: "frontmatter", token: `unexpected key: ${k}` });
    }
  }
  findings.push(...scanText("description", skill.description));
  for (const rel of skill.files) {
    const abs = path.join(skill.root, rel);
    if (rel === "SKILL.md") {
      const split = splitFrontmatter(fs.readFileSync(abs, "utf8"));
      const body = "error" in split ? "" : split.body;
      findings.push(...scanText("body", bodyWithoutMarker(body)));
    } else if (TEXT_RESOURCE_RE.test(rel)) {
      findings.push(...scanText(rel, fs.readFileSync(abs, "utf8")));
    }
  }
  return findings;
}

// ── registry loader ────────────────────────────────────────────────────────

/**
 * skill 디렉토리들을 읽어 검증한다. 잘못된 항목은 problems로 격리한다.
 * packaged mode이면 manifest 1:1 바인딩과 중립성까지 강제한다.
 */
export function loadSkillRegistry(root: string, opts: LoadOptions = {}): SkillRegistry {
  const skills: SkillPackage[] = [];
  const problems: SkillProblem[] = [];

  let manifest: Manifest | undefined = opts.manifest;
  if (opts.packaged && !manifest) {
    const manifestPath = opts.manifestPath ?? path.join(root, "catalog.json");
    const loaded = loadManifest(manifestPath);
    if ("error" in loaded) {
      problems.push({ nameOrPath: "catalog.json", reason: loaded.error });
      return { skills, problems };
    }
    manifest = loaded.manifest;
  }

  const realRoot = resolveSourceRoot(root);
  // 정본 root 부재/비정상은 source 문제로 표면화한다 — 의도적 빈 폴더(clean)와 구분한다(R1-03).
  let rootStat: fs.Stats;
  try {
    rootStat = fs.lstatSync(realRoot);
  } catch {
    problems.push({ nameOrPath: root, reason: "정본 폴더가 없거나 읽을 수 없습니다(부재 기반 prune 방지)" });
    if (opts.packaged && manifest) return bindManifest({ skills, problems }, manifest);
    return { skills, problems };
  }
  if (rootStat.isSymbolicLink()) {
    problems.push({ nameOrPath: root, reason: "정본 경로가 해석되지 않는 심볼릭 링크입니다" });
    if (opts.packaged && manifest) return bindManifest({ skills, problems }, manifest);
    return { skills, problems };
  }
  if (!rootStat.isDirectory()) {
    problems.push({ nameOrPath: root, reason: "정본 경로가 폴더가 아닙니다" });
    if (opts.packaged && manifest) return bindManifest({ skills, problems }, manifest);
    return { skills, problems };
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(realRoot, { withFileTypes: true });
  } catch (err) {
    problems.push({ nameOrPath: root, reason: `정본 폴더를 읽을 수 없습니다: ${(err as Error).message}` });
    if (opts.packaged && manifest) return bindManifest({ skills, problems }, manifest);
    return { skills, problems };
  }

  const dirNames: string[] = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith(".")) continue;
    const abs = path.join(realRoot, e.name);
    let st: fs.Stats;
    try {
      st = fs.lstatSync(abs);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) {
      problems.push({ nameOrPath: e.name, reason: "심볼릭 링크 디렉토리는 skill source로 순회하지 않습니다" });
      continue;
    }
    if (!st.isDirectory()) continue;
    if (!fs.existsSync(path.join(abs, "SKILL.md"))) continue;
    dirNames.push(e.name);
  }

  for (const dirName of dirNames) {
    const skillRoot = path.join(realRoot, dirName);
    const skillMdPath = path.join(skillRoot, "SKILL.md");
    // symlink/비파일은 내용을 따라 읽지 않고 문제로 보고한다(R1-09).
    let mdStat: fs.Stats;
    try {
      mdStat = fs.lstatSync(skillMdPath);
    } catch (err) {
      problems.push({ nameOrPath: dirName, reason: `SKILL.md를 읽을 수 없습니다: ${(err as Error).message}` });
      continue;
    }
    if (mdStat.isSymbolicLink() || !mdStat.isFile()) {
      problems.push({ nameOrPath: dirName, reason: "SKILL.md가 심볼릭 링크/일반 파일이 아닙니다(대상 내용을 따라가지 않음)" });
      continue;
    }
    let src: string;
    try {
      const decoded = decodeUtf8Strict(fs.readFileSync(skillMdPath));
      if (decoded === null) {
        problems.push({ nameOrPath: dirName, reason: "SKILL.md가 유효한 UTF-8이 아닙니다" });
        continue;
      }
      src = decoded;
    } catch (err) {
      problems.push({ nameOrPath: dirName, reason: `SKILL.md를 읽을 수 없습니다: ${(err as Error).message}` });
      continue;
    }
    const parsed = parseSkillMd(src);
    if ("error" in parsed) {
      problems.push({ nameOrPath: dirName, reason: parsed.error });
      continue;
    }
    if (!NAME_RE.test(parsed.name)) {
      problems.push({ nameOrPath: dirName, reason: `name은 1~64자 소문자·숫자·하이픈(시작/끝/연속 하이픈 금지)이어야 합니다: "${parsed.name}"` });
      continue;
    }
    if (parsed.name !== dirName) {
      problems.push({ nameOrPath: dirName, reason: `name("${parsed.name}")이 디렉토리명("${dirName}")과 다릅니다` });
      continue;
    }
    // marker 주석만 남고 실제 본문이 없으면 빈 본문으로 거부한다(R1-09).
    if (bodyWithoutMarker(parsed.body).trim().length === 0) {
      problems.push({ nameOrPath: dirName, reason: "SKILL.md 본문(Markdown body)이 비어 있습니다" });
      continue;
    }

    let traversal: TraversalResult;
    try {
      traversal = traverseSkill(skillRoot);
    } catch (err) {
      problems.push({ nameOrPath: dirName, reason: (err as Error).message });
      continue;
    }

    const canonicalPayloadHash = computePayloadHash(skillRoot, traversal.files, traversal.executable, "canonical-identity");
    const skill: SkillPackage = {
      name: parsed.name,
      description: parsed.description,
      root: skillRoot,
      files: traversal.files,
      executableFiles: [...traversal.executable].sort(),
      managedSource: hasSkillMarker(src, parsed.name),
      extraFrontmatterKeys: parsed.extraKeys,
      canonicalPayloadHash,
    };
    skills.push(skill);
  }

  if (opts.packaged && manifest) {
    const bound = bindManifest({ skills, problems }, manifest);
    for (const s of bound.skills) {
      // packaged skill은 이름 결합 managed marker가 반드시 있어야 한다(markerless 위조 거부 — R1-09).
      if (!s.managedSource) {
        bound.problems.push({ nameOrPath: s.name, reason: "packaged skill에 이름 결합 managed marker가 없습니다" });
      }
      // 선언된 text resource는 strict UTF-8이어야 한다(R1-09).
      for (const rel of s.files) {
        if (rel === "SKILL.md" || !TEXT_RESOURCE_RE.test(rel)) continue;
        if (decodeUtf8Strict(fs.readFileSync(path.join(s.root, rel))) === null) {
          bound.problems.push({ nameOrPath: s.name, reason: `packaged text resource가 유효한 UTF-8이 아닙니다: ${rel}` });
        }
      }
      const findings = scanPackagedNeutrality(s);
      if (findings.length > 0) {
        bound.problems.push({
          nameOrPath: s.name,
          reason: `packaged workflow 중립성 위반: ${findings.map((f) => `${f.where}[${f.token}]`).join(", ")}`,
        });
      }
    }
    return bound;
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return { skills, problems };
}

/** manifest ID 집합과 skill 디렉토리 집합의 정확한 1:1 바인딩을 검증하고 policy를 붙인다. */
function bindManifest(reg: SkillRegistry, manifest: Manifest): SkillRegistry {
  const skillNames = new Set(reg.skills.map((s) => s.name));
  const manifestIds = new Set(Object.keys(manifest.workflows));

  for (const id of manifestIds) {
    if (!skillNames.has(id)) {
      reg.problems.push({ nameOrPath: id, reason: `manifest에 있는 workflow "${id}"의 skill 디렉토리가 없습니다` });
    }
  }
  for (const s of reg.skills) {
    if (!manifestIds.has(s.name)) {
      reg.problems.push({ nameOrPath: s.name, reason: `skill 디렉토리 "${s.name}"이 manifest(catalog.json)에 선언되지 않았습니다` });
    } else {
      s.policy = manifest.workflows[s.name];
    }
  }
  reg.skills.sort((a, b) => a.name.localeCompare(b.name));
  return reg;
}
