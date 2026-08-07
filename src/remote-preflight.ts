import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

type Env = NodeJS.ProcessEnv;
type McpEntry = {
  type?: string;
  url?: string;
  headers?: Record<string, string>;
};

type PreflightCode =
  | "OK"
  | "NO_CONFIG"
  | "MULTIPLE_CONFIGS"
  | "UNSAFE_SCOPE"
  | "NOT_HTTP"
  | "CONFIG_INVALID"
  | "CONNECTION_FAILED"
  | "WRONG_IDENTITY";

export type RemotePreflightResult = {
  ok: boolean;
  code: PreflightCode;
  message: string;
  scope?: "local" | "project" | "user";
  deploymentId?: string;
};

export type RemotePreflightOptions = {
  home: string;
  projectDir: string;
  expectedDeploymentId: string;
  env?: Env;
  serverName?: string;
  timeoutMs?: number;
};

type Definition = { scope: "local" | "project" | "user"; entry: McpEntry };

type JsonRead = { value?: Record<string, unknown>; invalid: boolean };

function readJson(file: string): JsonRead {
  if (!fs.existsSync(file)) return { invalid: false };
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value)
      ? { value: value as Record<string, unknown>, invalid: false }
      : { invalid: true };
  } catch {
    return { invalid: true };
  }
}

function objectAt(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const child = (value as Record<string, unknown>)[key];
  return child && typeof child === "object" && !Array.isArray(child)
    ? child as Record<string, unknown>
    : undefined;
}

function entryAt(container: Record<string, unknown> | undefined, name: string): McpEntry | undefined {
  const entry = objectAt(container, name);
  return entry as McpEntry | undefined;
}

function hasInvalidObject(container: Record<string, unknown> | undefined, key: string): boolean {
  return container !== undefined && key in container && objectAt(container, key) === undefined;
}

function collectDefinitions(home: string, projectDir: string, name: string): { definitions: Definition[]; invalid: boolean } {
  const userRead = readJson(path.join(home, ".claude.json"));
  const userConfig = userRead.value;
  const projectPath = path.resolve(projectDir);
  const projects = objectAt(userConfig, "projects");
  const localProject = objectAt(projects, projectPath);
  const projectRead = readJson(path.join(projectPath, ".mcp.json"));
  const localServers = objectAt(localProject, "mcpServers");
  const projectServers = objectAt(projectRead.value, "mcpServers");
  const userServers = objectAt(userConfig, "mcpServers");
  const local = entryAt(localServers, name);
  const project = entryAt(projectServers, name);
  const user = entryAt(userServers, name);
  const definitions = [
    local && { scope: "local" as const, entry: local },
    project && { scope: "project" as const, entry: project },
    user && { scope: "user" as const, entry: user },
  ].filter((v): v is Definition => Boolean(v));
  const invalid = userRead.invalid
    || projectRead.invalid
    || hasInvalidObject(userConfig, "projects")
    || hasInvalidObject(userConfig, "mcpServers")
    || hasInvalidObject(projects, projectPath)
    || hasInvalidObject(localProject, "mcpServers")
    || hasInvalidObject(projectRead.value, "mcpServers")
    || hasInvalidObject(localServers, name)
    || hasInvalidObject(projectServers, name)
    || hasInvalidObject(userServers, name);
  return { definitions, invalid };
}

function expand(value: string, env: Env): string | undefined {
  let missing = false;
  const expanded = value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (_all, key: string, fallback?: string) => {
    const found = env[key];
    if (found !== undefined && found !== "") return found;
    if (fallback !== undefined) return fallback;
    missing = true;
    return "";
  });
  return missing ? undefined : expanded;
}

function usesOnlyEnv(value: string, allowed: Set<string>): boolean {
  return [...value.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)/g)]
    .every((match) => allowed.has(match[1]));
}

function safeResult(code: PreflightCode, message: string, extra: Partial<RemotePreflightResult> = {}): RemotePreflightResult {
  return { ok: code === "OK", code, message, ...extra };
}

export async function runRemotePreflight(options: RemotePreflightOptions): Promise<RemotePreflightResult> {
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,63}$/u.test(options.expectedDeploymentId)) {
    return safeResult("CONFIG_INVALID", "기대 deployment id는 1~64자의 공개 안전한 식별자여야 합니다.");
  }
  const env = options.env ?? process.env;
  const collected = collectDefinitions(options.home, options.projectDir, options.serverName ?? "localmind");
  if (collected.invalid) {
    return safeResult("CONFIG_INVALID", "Claude Code MCP 설정 중 읽거나 판정할 수 없는 항목이 있습니다.");
  }
  const { definitions } = collected;
  if (definitions.length === 0) {
    return safeResult("NO_CONFIG", "Claude Code에 localmind 등록이 없습니다.");
  }
  if (definitions.length > 1) {
    return safeResult("MULTIPLE_CONFIGS", "localmind 등록이 여러 스코프에 있어 정본을 안전하게 고를 수 없습니다.");
  }

  const { scope, entry } = definitions[0];
  if (scope !== "user") {
    return safeResult("UNSAFE_SCOPE", "원격 localmind는 저장소가 바꿀 수 없는 user scope에 하나만 등록해야 합니다.", { scope });
  }
  if (entry.type !== "http" && entry.type !== "streamable-http") {
    return safeResult("NOT_HTTP", "활성 localmind 등록이 원격 HTTP가 아닙니다.", { scope });
  }
  if (typeof entry.url !== "string") {
    return safeResult("CONFIG_INVALID", "원격 HTTP URL 설정을 읽을 수 없습니다.", { scope });
  }
  if (!usesOnlyEnv(entry.url, new Set(["LOCALMIND_MCP_URL"]))) {
    return safeResult("CONFIG_INVALID", "원격 HTTP URL에는 LOCALMIND_MCP_URL만 사용할 수 있습니다.", { scope });
  }
  const url = expand(entry.url, env);
  if (!url) return safeResult("CONFIG_INVALID", "원격 HTTP URL의 환경변수가 설정되지 않았습니다.", { scope });

  if (!entry.headers || typeof entry.headers !== "object" || Array.isArray(entry.headers)) {
    return safeResult("CONFIG_INVALID", "원격 HTTP 인증 헤더가 필요합니다.", { scope });
  }
  const headerEntries = Object.entries(entry.headers);
  if (headerEntries.length !== 1 || headerEntries[0][0].toLowerCase() !== "authorization"
    || headerEntries[0][1] !== "Bearer ${MCP_AUTH_TOKEN}") {
    return safeResult("CONFIG_INVALID", "Authorization은 Bearer MCP_AUTH_TOKEN 환경변수로 설정해야 합니다.", { scope });
  }
  const headers: Record<string, string> = {};
  for (const [key, rawValue] of headerEntries) {
    const value = expand(rawValue as string, env);
    if (value === undefined) return safeResult("CONFIG_INVALID", "HTTP 헤더의 환경변수가 설정되지 않았습니다.", { scope });
    headers[key] = value;
  }

  let client: Client | undefined;
  try {
    client = new Client({ name: "localmind-remote-preflight", version: "1" });
    const timeoutMs = options.timeoutMs ?? 8_000;
    const timedFetch = (input: string | URL | Request, init: RequestInit = {}) => fetch(input, {
      ...init,
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs),
    });
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers },
      fetch: timedFetch,
    });
    await client.connect(transport);
    const result = await client.callTool({ name: "whoami", arguments: {} });
    if (result.isError || !Array.isArray(result.content)) throw new Error("whoami failed");
    const text = result.content
      .filter((item): item is { type: "text"; text: string } => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("\n");
    const deploymentId = text.match(/(?:^|\n)(?:🧠\s*)?deployment:\s*([^\n]+)/)?.[1]?.trim();
    if (!deploymentId) throw new Error("identity missing");
    if (deploymentId !== options.expectedDeploymentId) {
      return safeResult("WRONG_IDENTITY", "연결된 LocalMind가 기대한 정본과 다릅니다. 검색·저장을 중단하세요.", { scope });
    }
    return safeResult("OK", "원격 HTTP 정본 identity를 확인했습니다.", { scope, deploymentId });
  } catch {
    return safeResult("CONNECTION_FAILED", "원격 LocalMind 연결 또는 인증에 실패했습니다.", { scope });
  } finally {
    await client?.close().catch(() => undefined);
  }
}
