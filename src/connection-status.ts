/**
 * specs/039 — 웹 설정 페이지 '연결 상태' 수집기(읽기 전용).
 * 각 설정이 지금 ok|missing|unknown 인지 판정한다. **시크릿 '값'은 다루지 않고 '존재 여부'만**
 * 본다(AC-8) — 반환 객체엔 시크릿 원문이 없다. 판정 불가는 예외가 아니라 unknown으로 흡수한다
 * (FR-6·AC-3). repo 밖 사용자 config(claude_desktop_config.json·~/.claude.json)는 **읽기만** 한다.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RepoTarget } from "./ui-status.js";

export type CheckStatus = "ok" | "missing" | "unknown";

export interface Connections {
  claudeAuth: CheckStatus;
  claudeCodeMcp: CheckStatus;
  claudeDesktopMcp: CheckStatus;
  gemini: CheckStatus;
  codex: CheckStatus;
  notesDir: CheckStatus;
}

export type McpConfigInput =
  | { kind: "missing" }
  | { kind: "unreadable" }
  | { kind: "parsed"; data: unknown };

/**
 * MCP config에 localmind 항목이 있으면 ok, 파일은 읽었으나 없으면 missing,
 * 파일이 없거나 파싱 실패면 unknown(연결 여부를 알 수 없음 — 틀린 "안됨"보다 정직한 "확인 불가").
 */
export function classifyMcpConfig(input: McpConfigInput): CheckStatus {
  if (input.kind !== "parsed") return "unknown";
  const data = input.data;
  // top-level이 정상 객체가 아니면(배열·문자열 등 손상) 연결 여부를 알 수 없음 → unknown(정직한 "확인 불가").
  if (!data || typeof data !== "object" || Array.isArray(data)) return "unknown";
  const servers = (data as { mcpServers?: unknown }).mcpServers;
  // 정상 config인데 mcpServers가 없거나 비정상이면 '연결 안 됨'(missing).
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) return "missing";
  return (servers as Record<string, unknown>).localmind ? "ok" : "missing";
}

/** 값이 비어있지 않으면 ok, 아니면 missing. 값 자체는 노출하지 않는다(존재 여부만). */
export function classifyPresence(value: string | undefined | null): CheckStatus {
  return value != null && String(value).trim().length > 0 ? "ok" : "missing";
}

/** OS별 Claude Desktop 설정 파일 경로(scripts/mcp-desktop.sh와 동일 규칙). */
export function claudeDesktopConfigPath(homedir: string, platform: NodeJS.Platform): string {
  if (platform === "darwin") {
    return path.join(homedir, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  if (platform === "win32") {
    const appdata = process.env.APPDATA || path.join(homedir, "AppData", "Roaming");
    return path.join(appdata, "Claude", "claude_desktop_config.json");
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(homedir, ".config");
  return path.join(xdg, "Claude", "claude_desktop_config.json");
}

/** .env 비실행 파싱 → key→value 맵. **내부 전용**(반환/로그 금지) — read-env.sh와 같은 규칙. */
function readEnvMap(envFile: string): Record<string, string> {
  const map: Record<string, string> = {};
  let raw: string;
  try {
    raw = fs.readFileSync(envFile, "utf8");
  } catch {
    return map;
  }
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    const value = t
      .slice(eq + 1)
      .trim()
      .replace(/^"(.*)"$/, "$1")
      .replace(/^'(.*)'$/, "$1");
    map[key] = value;
  }
  return map;
}

/** MCP config 파일을 읽어 판정 입력으로. 실패는 예외가 아니라 missing/unreadable로 흡수(FR-6). */
function readMcpConfig(filePath: string): McpConfigInput {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return { kind: "missing" };
  }
  try {
    return { kind: "parsed", data: JSON.parse(raw) };
  } catch {
    return { kind: "unreadable" };
  }
}

function safeExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

export interface ConnectionInputs {
  envFile: string;
  folders: RepoTarget[];
  homedir?: string;
  platform?: NodeJS.Platform;
  /** codex 로그인 신호 디렉터리(기본 ~/.codex 또는 $CODEX_HOME) */
  codexHome?: string;
}

/**
 * 파일·환경을 읽어 연결 상태를 조립한다. 모든 IO 실패는 unknown/missing으로 흡수(FR-6),
 * 반환에 시크릿 원문 없음(AC-8).
 */
export function readConnections(inputs: ConnectionInputs): Connections {
  const home = inputs.homedir ?? os.homedir();
  const platform = inputs.platform ?? process.platform;
  const env = readEnvMap(inputs.envFile);
  const codexHome = inputs.codexHome ?? process.env.CODEX_HOME ?? path.join(home, ".codex");

  return {
    // 인증: .env의 OAuth 토큰 존재(값 미노출). .env.example 기본값은 빈 값이라 존재=실제 설정.
    claudeAuth: classifyPresence(env.CLAUDE_CODE_OAUTH_TOKEN),
    // Claude Code: ~/.claude.json top-level mcpServers.localmind (Live-Verify 2026-07-07).
    claudeCodeMcp: classifyMcpConfig(readMcpConfig(path.join(home, ".claude.json"))),
    // Claude Desktop: OS별 claude_desktop_config.json의 mcpServers.localmind.
    claudeDesktopMcp: classifyMcpConfig(readMcpConfig(claudeDesktopConfigPath(home, platform))),
    // Gemini: .env의 API 키 존재(.env.example 기본값 빈 값).
    gemini: classifyPresence(env.GEMINI_API_KEY),
    // codex: .env 기본값(CODEX_DEFAULT_MODEL 등)이 채워져 있어 무의미 → 실제 신호는 ~/.codex 로그인.
    codex: safeExists(codexHome) ? "ok" : "missing",
    // 노트 폴더: 해석된 폴더 중 하나라도 실재하면 ok.
    notesDir: inputs.folders.some((f) => safeExists(f.dir)) ? "ok" : "missing",
  };
}
