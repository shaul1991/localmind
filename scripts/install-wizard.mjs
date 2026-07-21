/**
 * specs/046 — 웹 설치 위저드(능동 부트스트랩 서버).
 * specs/040 `bootstrap-guide.mjs`(읽기 전용 안내판)의 **능동 승격판**이다. 차이:
 *   - 준비물 점검(runChecks 재사용)에 더해 **사용자 확인을 거친 화이트리스트 단계 실행**과 진행 스트리밍,
 *   - 토큰·설정의 **서버측 `.env` 기록**(원문 미노출), MCP 등록·폴링 확인을 제공한다.
 * 불변식(goal Constraint·spec FR-5): Node 내장 모듈만(설치 전 무의존) · `127.0.0.1` 전용 바인딩 ·
 *   Host 헤더 검증(DNS rebinding 차단) · 실행은 고정 id 화이트리스트 · 비밀값은 서버 밖으로 안 나감.
 * 설치 로직은 재구현하지 않고 기존 embedding-up.sh·mcp-install.sh·doctor.sh를 자식 프로세스로 호출한다(FR-6).
 * great-reduction r2(2026-07-22): 구 스택(up.sh)·백엔드 토큰(claude/gemini) 단계 소멸 —
 * "스택 기동"은 임베딩 엔진 기동(embedding-up.sh)으로, 비밀 항목은 EMBEDDINGS_KEY 하나로 축소.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runChecks } from "./bootstrap-guide.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PORT = Number(process.env.GUIDE_PORT) || 8799; // 040 가이드와 같은 포트 노브(guide→위저드 전환)
export const BIND_HOST = "127.0.0.1"; // 특권 서버 — 루프백 전용(외부 인터페이스 노출 금지)

// ── 화이트리스트(실행 정본) — 클라이언트는 임의 명령이 아니라 id만 보낸다(FR-5·AC-3) ──────
// 파괴적 명령(down/clean/purge/trash-empty)·비화이트리스트 id는 애초에 이 맵에 없어 실행 불가.
export const COMMANDS = {
  up: { script: "embedding-up.sh", label: "임베딩 엔진 켜기", streams: true },
  "mcp-install": { script: "mcp-install.sh", label: "Claude Code 연결", streams: true },
  doctor: { script: "doctor.sh", label: "진단(읽기 전용)", streams: true },
};

// ── 비밀 항목 화이트리스트 — 임의 .env 키 주입 금지, 알려진 항목만 기록(FR-3·AC-4) ─────────
export const SECRET_KEYS = {
  embeddings: "EMBEDDINGS_KEY",
};

/** 화이트리스트 조회. 문자열이 아니거나 미등록/파괴적 id면 null(=거부). */
export function resolveCommand(id) {
  if (typeof id !== "string") return null;
  if (!Object.prototype.hasOwnProperty.call(COMMANDS, id)) return null;
  return COMMANDS[id];
}

/** 비밀 항목 id → 실제 env 변수명. 알려진 항목만, 그 외 null. */
export function resolveSecretKey(id) {
  if (typeof id !== "string") return null;
  return Object.prototype.hasOwnProperty.call(SECRET_KEYS, id) ? SECRET_KEYS[id] : null;
}

/**
 * Host 헤더 검증(DNS rebinding 차단, AC-7). 루프백 호스트명만 허용:
 * 127.0.0.1 · localhost · ::1 (+ 선택 포트). 그 외 도메인·사설 IP·위조는 거부.
 */
export function hostAllowed(hostHeader) {
  if (typeof hostHeader !== "string" || hostHeader === "") return false;
  if (/[\u0000-\u0020]/.test(hostHeader)) return false; // 제어문자·공백 포함 거부(엄격 — self-review 경미-3)
  const h = hostHeader.toLowerCase();
  // host[:port] 분해 — IPv6는 [..] 대괄호. host 내부에 추가 콜론/문자가 있으면 거부(엄격 매칭).
  const m = /^(\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::(\d{1,5}))?$/.exec(h);
  if (!m) return false;
  if (m[2] !== undefined) {
    const port = Number(m[2]);
    if (port < 1 || port > 65535) return false; // 포트 범위 검증
  }
  let host = m[1];
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

/** 비밀값 마스킹 — 원문을 절대 반환하지 않고 설정 여부 + 끝 4자 힌트만(design §4.7). */
export function maskSecret(name, value) {
  const v = String(value == null ? "" : value);
  const hint = v.length > 4 ? "…" + v.slice(-4) : "";
  return { name, set: v.length > 0, hint };
}

export const MAX_SECRET_LEN = 8192;

/**
 * 비밀 값 검증 — 개행(`\r`/`\n`)·과도한 길이 거부. 개행을 막지 않으면 `.env`에 임의 키 라인을
 * 주입/덮어쓸 수 있다(예: `LITELLM_MASTER_KEY` 변조 — goal Non-goal "임의 .env 편집" 위반). self-review 중대-1.
 */
export function isValidSecretValue(value) {
  const v = String(value == null ? "" : value);
  if (v.length > MAX_SECRET_LEN) return false;
  if (/[\r\n]/.test(v)) return false;
  return true;
}

/** 비밀 저장 응답 객체(순수) — body에 원문이 실리지 않음을 구조적으로 보장(AC-4). 실제 기록은 handleSecret. */
export function buildSecretResponse(keyId, value) {
  const envName = resolveSecretKey(keyId);
  if (!envName) return { status: 400, envName: null, body: { error: "알 수 없는 설정 항목이에요." } };
  if (value && !isValidSecretValue(value))
    return { status: 400, envName: null, body: { error: "열쇠 형식이 올바르지 않아요(줄바꿈이나 너무 긴 값은 넣을 수 없어요)." } };
  const m = maskSecret(envName, value);
  return { status: 200, envName, body: { key: keyId, set: m.set, hint: m.hint } };
}

/** `claude mcp list` 출력에서 localmind 등록 여부 감지. 'localmind-remote'는 오탐하지 않음(정확 매칭). */
export function parseMcpList(output) {
  if (typeof output !== "string") return false;
  return output.split(/\r?\n/).some((line) => /^\s*localmind:\s/.test(line));
}

const RE_META = /[.*+?^${}()|[\]\\]/g;

/**
 * 서버측 `.env` 기록 — 있으면 그 줄 교체(in-place, 주석·순서 보존), 없으면 append. chmod 600
 * (키 라인 in-place 교체·chmod 600은 구 스택 스크립트에서 계승한 관례, specs/015 FR-9).
 */
export function writeEnvVar(envPath, name, value) {
  // 방어(defense in depth): 개행 든 값은 여기서도 거부한다 — buildSecretResponse가 먼저 막지만
  // 이 함수는 불변식(한 줄 = 한 키)을 스스로 지킨다. self-review 중대-1.
  if (/[\r\n]/.test(String(value))) throw new Error("env 값에 줄바꿈은 허용되지 않아요.");
  let content = "";
  try {
    content = fs.readFileSync(envPath, "utf8");
  } catch {
    content = "";
  }
  const lines = content.length ? content.split("\n") : [];
  const re = new RegExp("^" + name.replace(RE_META, "\\$&") + "=");
  let replaced = false;
  const out = lines.map((l) => {
    if (re.test(l)) {
      replaced = true;
      return `${name}=${value}`;
    }
    return l;
  });
  if (!replaced) {
    if (out.length && out[out.length - 1] === "") out.pop(); // 이중 빈 줄 방지
    out.push(`${name}=${value}`);
  }
  let result = out.join("\n");
  if (!result.endsWith("\n")) result += "\n";
  fs.writeFileSync(envPath, result);
  try {
    fs.chmodSync(envPath, 0o600); // OAuth 토큰·키가 담기므로 소유자 전용
  } catch {
    /* 일부 파일시스템은 chmod 미지원 — 무해 */
  }
  return true;
}

function envFilePath() {
  return process.env.LOCALMIND_ENV_FILE || path.join(ROOT, ".env"); // 테스트 격리 관례(mcp-install.sh와 동일)
}

/**
 * 화이트리스트 명령 실행(스트리밍). 미등록 id면 spawn을 호출하지 않고 rejected로 즉시 반환(AC-3).
 * spawnFn 주입으로 테스트에서 실제 프로세스 없이 검증한다.
 */
export function runCommand(id, opts = {}) {
  const { spawnFn = spawn, onData = () => {}, env } = opts;
  return new Promise((resolve) => {
    const cmd = resolveCommand(id);
    if (!cmd) {
      resolve({ ok: false, rejected: true, code: null });
      return;
    }
    const scriptPath = path.join(ROOT, "scripts", cmd.script);
    let child;
    try {
      child = spawnFn("bash", [scriptPath], {
        cwd: ROOT,
        // LOCALMIND_STREAM: 자식 스크립트가 로그 소각을 풀고 개행 진행을 내도록(단계 0c 결론).
        env: { ...process.env, LOCALMIND_STREAM: "1", ...(env || {}) },
      });
    } catch (e) {
      resolve({ ok: false, rejected: false, error: e && e.message, code: null });
      return;
    }
    if (child.stdout && child.stdout.on) child.stdout.on("data", (d) => onData(d.toString()));
    if (child.stderr && child.stderr.on) child.stderr.on("data", (d) => onData(d.toString()));
    child.on("error", (e) => resolve({ ok: false, rejected: false, error: e && e.message, code: null }));
    child.on("close", (code) => resolve({ ok: code === 0, rejected: false, code }));
  });
}

/** MCP 등록 여부 조회(상태 비변경 읽기). spawnSyncFn 주입 가능(테스트). */
export function checkMcpRegistered(spawnSyncFn = spawnSync) {
  try {
    // timeout 3s: 단일 스레드 서버가 폴링 중 오래 블록되지 않게(self-review 경미-2). mcp list는 보통 빠름.
    const r = spawnSyncFn("claude", ["mcp", "list"], { timeout: 3000, encoding: "utf8" });
    if (!r || r.error) return { registered: false, reason: "claude CLI를 실행하지 못했어요." };
    return { registered: parseMcpList(String(r.stdout || "")) };
  } catch {
    return { registered: false, reason: "확인 중 오류가 났어요." };
  }
}

// ── 정적 자산(자기완결 — 외부 리소스 0, 인라인 CSS/JS, 강한 CSP) ─────────────
function readWizardHtml() {
  return fs.readFileSync(path.join(ROOT, "public", "wizard", "index.html"), "utf8");
}

// 강한 CSP: 외부 리소스 전면 금지, 스트리밍/폴링 위해 connect-src 'self'만. img data: 허용(인라인 SVG/이모지).
const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; " +
  "connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function securityHeaders(contentType) {
  return {
    "content-type": contentType,
    "content-security-policy": CSP,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "cache-control": "no-store",
  };
}

/** 비스트리밍 GET 라우트(테스트 가능). 스트리밍(POST /api/run)·비밀(POST /api/secret)은 서버에서 직접. */
export async function handleStatic(method, url) {
  if (method !== "GET") {
    return { status: 405, contentType: "text/plain; charset=utf-8", body: "GET만 지원해요." };
  }
  const p = String(url || "/").split("?")[0].split("#")[0];
  if (p === "/" || p === "") return { status: 200, contentType: "text/html; charset=utf-8", body: readWizardHtml() };
  if (p === "/api/checks")
    return { status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(await runChecks()) };
  if (p === "/api/mcp-status")
    return { status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(checkMcpRegistered()) };
  if (p === "/favicon.ico") return { status: 204, contentType: "image/x-icon", body: "" };
  return { status: 404, contentType: "text/plain; charset=utf-8", body: "없는 경로예요." };
}

// ── 요청 바디 파싱(작은 JSON만 허용 — 폭주 방지) ─────────────────────────────
function readJsonBody(req, limit = 64 * 1024) {
  return new Promise((resolve) => {
    let data = "";
    let done = false;
    // 한 번만 resolve. req.destroy()는 'close'만 발생시키고 'end'/'error'는 안 오므로(self-review 중대-2)
    // 'close'에서도 resolve해 핸들러가 행 걸리지 않게 한다.
    const finish = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    let over = false;
    req.on("data", (c) => {
      if (over) return;
      data += c;
      if (data.length > limit) {
        // 한도 초과 — 즉시 거부하되 소켓은 파기하지 않는다(파기 시 클라이언트가 응답 대신
        // ECONNRESET을 받음, self-review 중대-2 재수정). 남은 바디는 resume으로 드레인해 깔끔히 닫는다.
        over = true;
        data = "";
        finish(null);
        req.resume();
      }
    });
    req.on("end", () => {
      if (over) return;
      try {
        finish(JSON.parse(data || "{}"));
      } catch {
        finish(null);
      }
    });
    req.on("close", () => finish(null));
    req.on("error", () => finish(null));
  });
}

async function handleRun(req, res) {
  const body = await readJsonBody(req);
  const cmd = body && resolveCommand(body.id);
  if (!cmd) {
    // 화이트리스트 밖·파괴 명령 — 실행하지 않고 거부(AC-3). spawn은 부르지 않음.
    res.writeHead(400, securityHeaders("application/json; charset=utf-8"));
    res.end(JSON.stringify({ error: "허용되지 않은 단계예요.", rejected: true }));
    return;
  }
  // 청크 스트리밍(무의존): content-length 없이 res.write → chunked. 클라이언트는 fetch+getReader로 수신.
  res.writeHead(200, securityHeaders("text/plain; charset=utf-8"));
  const result = await runCommand(body.id, { onData: (chunk) => res.write(chunk) });
  // 종료 신호. 널 바이트( ) 프리픽스 — 스크립트 텍스트 로그에는 나오지 않아 본문과 충돌하지 않음
  // (self-review 경미-1: 평문 '__STATUS__:'가 로그에 우연히 나오면 오파싱하던 문제).
  res.write(`\n\u0000__STATUS__:${JSON.stringify({ ok: result.ok, code: result.code })}\n`);
  res.end();
}

async function handleSecret(req, res) {
  const body = await readJsonBody(req);
  const value = body && typeof body.value === "string" ? body.value : "";
  const built = buildSecretResponse(body && body.key, value);
  if (built.status !== 200) {
    res.writeHead(built.status, securityHeaders("application/json; charset=utf-8"));
    res.end(JSON.stringify(built.body));
    return;
  }
  if (built.body.set) writeEnvVar(envFilePath(), built.envName, value); // 서버측에만 기록, 원문은 응답에 없음
  res.writeHead(200, securityHeaders("application/json; charset=utf-8"));
  res.end(JSON.stringify(built.body)); // {key, set, hint} — 원문 없음(AC-4)
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      if (!hostAllowed(req.headers.host)) {
        // fail-closed: 위조 Host·외부 접근 거부(AC-7).
        res.writeHead(403, securityHeaders("application/json; charset=utf-8"));
        res.end(JSON.stringify({ error: "허용되지 않은 접근이에요(로컬에서만 열려요)." }));
        return;
      }
      const method = req.method;
      const p = String(req.url || "/").split("?")[0];
      if (method === "POST" && p === "/api/run") return void (await handleRun(req, res));
      if (method === "POST" && p === "/api/secret") return void (await handleSecret(req, res));
      const r = await handleStatic(method, req.url);
      res.writeHead(r.status, securityHeaders(r.contentType));
      res.end(r.body);
    } catch (e) {
      res.writeHead(500, securityHeaders("text/plain; charset=utf-8"));
      res.end("위저드 오류: " + (e && e.message));
    }
  });
}

// ── 서버 기동(127.0.0.1 전용 · 포트 충돌 시 다음 포트 · 브라우저 자동 오픈) ──
function openBrowser(url) {
  if (process.env.LOCALMIND_NO_OPEN || !process.stdout.isTTY) return;
  const opener = process.platform === "darwin" ? "open" : process.platform === "linux" ? "xdg-open" : "start";
  try {
    spawnSync(opener, [url], { stdio: "ignore", shell: process.platform === "win32" });
  } catch {
    /* 실패 무해 — 아래 URL 안내로 대체 */
  }
}

export function start(port = DEFAULT_PORT, triesLeft = 20) {
  const server = createServer();
  server.on("error", (e) => {
    if (e.code === "EADDRINUSE" && triesLeft > 0) start(port + 1, triesLeft - 1);
    else {
      console.error("위저드 서버를 시작하지 못했어요:", e.message);
      process.exit(1);
    }
  });
  server.listen(port, BIND_HOST, () => {
    const url = `http://${BIND_HOST}:${port}/`;
    console.log(`\n🧠 localmind 설치 마법사가 열렸어요: ${url}`);
    console.log("   브라우저가 자동으로 안 열리면 위 주소를 직접 여세요. (중지: Ctrl+C)\n");
    openBrowser(url);
  });
  return server;
}

function isMainModule() {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}
if (isMainModule()) start();
