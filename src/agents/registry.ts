/**
 * 페르소나 에이전트 레지스트리 — 정본 로드·검증 (specs/016 FR-1·FR-2).
 *
 * 정본은 `<데이터폴더>/agents/*.md` 파일 하나 = 페르소나 하나. frontmatter가 이름·설명·
 * 대상 도구별 모델을 선언하고, 본문이 시스템 프롬프트다. 배포(deploy.ts)와 MCP 도구가
 * 이 모듈을 재사용한다. 노트가 아니므로 brain 색인에서 제외된다(FR-10).
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

export interface ClaudeTarget {
  model: string;
  tools?: string;
}
export interface CodexTarget {
  model: string;
  reasoning_effort?: "low" | "medium" | "high" | "xhigh";
  sandbox?: string;
}
export interface Persona {
  name: string;
  description: string;
  targets: { claude?: ClaudeTarget; codex?: CodexTarget };
  /** frontmatter 이후 본문 전체 = 시스템 프롬프트 */
  prompt: string;
  /** 정본 파일명(레지스트리 폴더 기준) — 문제 보고용 */
  file: string;
}
export interface RegistryProblem {
  file: string;
  reason: string;
}
export interface Registry {
  personas: Persona[];
  problems: RegistryProblem[];
  /** 알 수 없는 필드 등 — 오류는 아니지만 알려줄 것(전방 호환) */
  warnings: string[];
}

function expandHome(p: string): string {
  return p.replace(/^~(?=$|\/)/, process.env.HOME ?? "~");
}

/**
 * 레지스트리 정본 위치 = 첫 노트 폴더의 agents/ (기본 ~/.localmind/agents).
 * 노트 폴더 안에 있어야 기존 backup(git)에 자동 편입되고(FR-9), brain이 같은 경로를
 * 색인에서 제외한다(FR-10) — NOTES_DIR를 옮긴 사용자도 규칙이 유지되도록 노트 폴더에
 * 결합한다(self-review 중대-3). LOCALMIND_AGENTS_DIR로 재지정 가능.
 */
export function agentsDir(): string {
  const env = process.env.LOCALMIND_AGENTS_DIR?.trim();
  if (env) return path.resolve(expandHome(env));
  return path.join(firstNotesDir(), "agents");
}

/** 첫 노트 폴더(NOTES_DIR 첫 항목, 라벨 표기 허용) — agents/·skills/(018) 정본의 기준
 *  경로. 노트 폴더 하위여야 기존 backup(git)에 자동 편입된다. */
export function firstNotesDir(): string {
  const notesRaw = process.env.NOTES_DIR?.trim();
  if (notesRaw) {
    const first = notesRaw.split(",")[0]?.trim();
    if (first) {
      const eq = first.indexOf("=");
      return path.resolve(expandHome(eq > 0 ? first.slice(eq + 1).trim() : first));
    }
  }
  return path.resolve(path.join(process.env.HOME ?? ".", ".localmind"));
}

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// model은 산출물(YAML/TOML)에 삽입되므로 형식을 깨는 문자(따옴표·공백·제어문자)를 막는다.
// export: specs/050 binding.ts가 바인딩의 모델 식별자에 같은 형식 규칙을 재사용한다(F-12, 복제 금지).
export const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._/:\[\]-]*$/;
export const MODEL_MSG = "model에는 영문·숫자·._/:[]-만 쓸 수 있습니다";

const claudeTargetSchema = z.object({
  model: z.string().min(1, "targets.claude.model이 비어 있습니다").regex(MODEL_RE, MODEL_MSG),
  tools: z.string().optional(),
});
const codexTargetSchema = z.object({
  model: z.string().min(1, "targets.codex.model이 비어 있습니다").regex(MODEL_RE, MODEL_MSG),
  reasoning_effort: z.enum(["low", "medium", "high", "xhigh"]).optional(),
  sandbox: z.string().optional(),
});

// ── frontmatter 미니 파서 ────────────────────────────────────────────
// 외부 YAML 의존성을 더하지 않기 위해(specs/010 공급망 고정), 이 스키마가 쓰는 형태만
// 지원하는 결정적 파서를 둔다: 최상위 `key: value`(+ `targets:` 블록), targets 아래
// 2칸 들여쓰기 대상명, 그 아래 4칸(이상) 들여쓰기 `key: value`. 값의 따옴표는 벗긴다.

type Fm = { top: Record<string, string>; targets: Record<string, Record<string, string>> };

function unquote(v: string): string {
  const t = v.trim();
  // 따옴표 값: 닫는 따옴표까지가 값이고 그 뒤(주석 등)는 버린다.
  if (t.startsWith('"') || t.startsWith("'")) {
    const q = t[0];
    const close = t.indexOf(q, 1);
    if (close > 0) return t.slice(1, close);
  }
  // 일반 값: YAML 규약대로 인라인 주석(공백 + #)을 벗긴다(도그푸드에서 발견한 회귀).
  const hash = t.search(/\s#/);
  return (hash >= 0 ? t.slice(0, hash) : t).trim();
}

function parseFrontmatter(src: string): { fm: Fm; body: string } | { error: string } {
  if (!src.startsWith("---\n") && src.trim() !== "---") {
    return { error: "frontmatter(--- 로 시작하는 머리말)가 없습니다" };
  }
  const end = src.indexOf("\n---", 3);
  if (end < 0) return { error: "frontmatter가 닫히지 않았습니다(--- 누락)" };
  const head = src.slice(4, end);
  const bodyStart = src.indexOf("\n", end + 1);
  const body = bodyStart >= 0 ? src.slice(bodyStart + 1) : "";

  const fm: Fm = { top: {}, targets: {} };
  let inTargets = false;
  let currentTarget: string | null = null;
  for (const rawLine of head.split("\n")) {
    if (!rawLine.trim() || rawLine.trim().startsWith("#")) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trim();
    const colon = line.indexOf(":");
    if (colon <= 0) return { error: `해석할 수 없는 줄: "${line}"` };
    const key = line.slice(0, colon).trim();
    const value = unquote(line.slice(colon + 1));

    if (indent === 0) {
      if (key === "targets" && value === "") {
        inTargets = true;
        currentTarget = null;
      } else {
        inTargets = false;
        currentTarget = null;
        fm.top[key] = value;
      }
    } else if (inTargets && indent === 2 && value === "") {
      currentTarget = key;
      fm.targets[key] = fm.targets[key] ?? {};
    } else if (inTargets && currentTarget && indent >= 4) {
      fm.targets[currentTarget][key] = value;
    } else {
      return { error: `들여쓰기를 해석할 수 없습니다: "${rawLine}"` };
    }
  }
  return { fm, body };
}

const KNOWN_TOP = new Set(["name", "description", "targets"]);
const KNOWN_TARGETS = new Set(["claude", "codex"]);
const KNOWN_CLAUDE = new Set(["model", "tools"]);
const KNOWN_CODEX = new Set(["model", "reasoning_effort", "sandbox"]);

function validate(fm: Fm, body: string, file: string, warnings: string[]): Persona | { reason: string } {
  const name = fm.top.name?.trim() ?? "";
  if (!name) return { reason: "필수 필드 name이 없습니다" };
  if (!NAME_RE.test(name)) return { reason: `name은 kebab-case여야 합니다(소문자·숫자·하이픈): "${name}"` };
  const description = fm.top.description?.trim() ?? "";
  if (!description) return { reason: "필수 필드 description이 없습니다" };

  for (const k of Object.keys(fm.top)) {
    if (!KNOWN_TOP.has(k)) warnings.push(`${file}: 알 수 없는 필드 "${k}" — 무시하고 진행합니다`);
  }
  for (const t of Object.keys(fm.targets)) {
    if (!KNOWN_TARGETS.has(t)) warnings.push(`${file}: 알 수 없는 대상 "${t}" — 무시하고 진행합니다`);
  }

  const targets: Persona["targets"] = {};
  if (fm.targets.claude) {
    for (const k of Object.keys(fm.targets.claude)) {
      if (!KNOWN_CLAUDE.has(k)) warnings.push(`${file}: targets.claude의 알 수 없는 필드 "${k}" — 무시하고 진행합니다`);
    }
    const r = claudeTargetSchema.safeParse(fm.targets.claude);
    if (!r.success) return { reason: `targets.claude: ${r.error.issues[0]?.message ?? "형식 오류"}` };
    targets.claude = { model: r.data.model, ...(r.data.tools ? { tools: r.data.tools } : {}) };
  }
  if (fm.targets.codex) {
    for (const k of Object.keys(fm.targets.codex)) {
      if (!KNOWN_CODEX.has(k)) warnings.push(`${file}: targets.codex의 알 수 없는 필드 "${k}" — 무시하고 진행합니다`);
    }
    const r = codexTargetSchema.safeParse(fm.targets.codex);
    if (!r.success) {
      const issue = r.error.issues[0];
      const where = issue?.path?.length ? `${issue.path.join(".")}: ` : "";
      return { reason: `targets.codex: ${where}${issue?.message ?? "형식 오류"}` };
    }
    targets.codex = r.data;
  }
  if (!targets.claude && !targets.codex) {
    return { reason: "대상(targets)이 하나도 없습니다 — targets.claude 또는 targets.codex를 지정하세요" };
  }

  return { name, description, targets, prompt: body.trim(), file };
}

/** 레지스트리 폴더의 정의를 모두 읽어 검증한다. 잘못된 항목은 problems로 격리한다. */
export function loadRegistry(dir: string = agentsDir()): Registry {
  const personas: Persona[] = [];
  const problems: RegistryProblem[] = [];
  const warnings: string[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { personas, problems, warnings }; // 폴더 없음 = 빈 레지스트리(AC-8)
  }

  for (const e of entries) {
    if (e.name.startsWith(".") || !e.name.toLowerCase().endsWith(".md")) continue;
    if (!e.isFile()) {
      // 조용히 사라지면 사용자는 "왜 배포가 안 되지"를 알 수 없다(self-review 경미-4)
      if (e.isSymbolicLink()) warnings.push(`${e.name}: 심볼릭 링크는 지원하지 않습니다 — 실제 파일을 두세요`);
      continue;
    }
    const file = e.name;
    let src: string;
    try {
      // CRLF 정본(윈도우 편집기 등)도 동일하게 해석한다(self-review 경미-1)
      src = fs.readFileSync(path.join(dir, file), "utf8").replace(/\r\n/g, "\n");
    } catch (err) {
      problems.push({ file, reason: `파일을 읽을 수 없습니다: ${(err as Error).message}` });
      continue;
    }
    const parsed = parseFrontmatter(src);
    if ("error" in parsed) {
      problems.push({ file, reason: parsed.error });
      continue;
    }
    const v = validate(parsed.fm, parsed.body, file, warnings);
    if ("reason" in v) {
      problems.push({ file, reason: v.reason });
      continue;
    }
    personas.push(v);
  }

  // name 중복: 어느 한쪽을 임의로 채택하지 않는다(AC-4) — 전부 문제로 격리.
  const byName = new Map<string, Persona[]>();
  for (const p of personas) {
    byName.set(p.name, [...(byName.get(p.name) ?? []), p]);
  }
  const unique: Persona[] = [];
  for (const [name, group] of byName) {
    if (group.length === 1) {
      unique.push(group[0]);
    } else {
      for (const p of group) {
        problems.push({ file: p.file, reason: `name "${name}" 중복 — ${group.map((g) => g.file).join(", ")} 가 같은 이름을 씁니다` });
      }
    }
  }

  unique.sort((a, b) => a.name.localeCompare(b.name));
  return { personas: unique, problems, warnings };
}
