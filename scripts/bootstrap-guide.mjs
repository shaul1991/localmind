/**
 * specs/040 — 설치 전 시각적 설치 가이드(무의존 부트스트랩 서버).
 * Node 내장 모듈만 사용한다(http·fs·path·child_process·url). node_modules·dist·tsx·외부 패키지
 * 의존 금지 — fresh clone에서 `make guide`(= node scripts/bootstrap-guide.mjs)로 바로 실행된다.
 * 읽기 전용: GET만, 점검은 상태 비변경 명령만 spawn, 명령을 대신 실행하는 엔드포인트는 없다(복사만).
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PORT = Number(process.env.GUIDE_PORT) || 8799; // GUIDE_PORT: 테스트/충돌 회피용
const REPO = "https://github.com/shaul1991/localmind";

/** HTML 속성 컨텍스트 이스케이프(data-cmd 등). 현재 값은 안전하나 원칙상 방어(self-review 경미-4). */
function escAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// ── 점검: 순수 판정(테스트 대상) + spawn 어댑터(우아한 저하) ──────────────

/** spawnSync 결과 → ok|missing|unknown. ENOENT=명령없음(missing), 타임아웃/기타(unknown). */
export function classifyExit(res) {
  if (!res) return "unknown";
  if (res.error) return res.error.code === "ENOENT" ? "missing" : "unknown";
  if (res.signal) return "unknown"; // 타임아웃 등으로 종료됨
  return res.status === 0 ? "ok" : "missing";
}

/** process.version("v20.x") → node≥20이면 ok, 미만 missing, 파싱 불가 unknown. */
export function classifyNode(versionStr) {
  const m = /^v?(\d+)/.exec(String(versionStr || ""));
  if (!m) return "unknown";
  return Number(m[1]) >= 20 ? "ok" : "missing";
}

function sp(cmd, args) {
  try {
    return spawnSync(cmd, args, { timeout: 4000, stdio: "ignore" });
  } catch (e) {
    return { error: e };
  }
}

/** ollama(:11434) — 응답 ok, 연결거부 missing(미실행/미설치·선택), 타임아웃/기타 unknown. */
function checkOllama() {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port: 11434, path: "/api/tags", timeout: 2000 }, (res) => {
      res.resume();
      resolve("ok");
    });
    req.on("timeout", () => {
      req.destroy();
      resolve("unknown");
    });
    req.on("error", () => resolve("missing"));
  });
}

/** 준비물 상태 집계. setup.sh preflight(docker+info·node·make·git·.env·ollama)를 미러(AC-9). */
export async function runChecks() {
  return {
    dockerInstalled: classifyExit(sp("docker", ["--version"])),
    dockerRunning: classifyExit(sp("docker", ["info"])),
    node: classifyNode(process.version),
    make: classifyExit(sp("make", ["--version"])),
    git: classifyExit(sp("git", ["--version"])),
    env: fs.existsSync(path.join(ROOT, ".env")) ? "ok" : "missing",
    ollama: await checkOllama(),
  };
}

// ── 스타일: 034 토큰·.badge·.card·.copy-btn 재사용(빌드 불필요 정적 파일) + 가이드 전용 ──

function readStyle() {
  let base = "";
  try {
    base = fs.readFileSync(path.join(ROOT, "public", "ui", "style.css"), "utf8");
  } catch {
    // style.css를 못 읽어도(경로 이동 등) 최소 토큰으로 저하 — 무의존 불변 유지
    base = `:root{--color-bg:#f8fafc;--color-surface:#fff;--color-border:#e2e8f0;--color-text:#0f172a;
--color-text-dim:#64748b;--color-primary:#2563eb;--color-on-primary:#fff;--color-ok:#15803d;
--color-warn:#b45309;--color-idle:#475569;--color-on-state:#fff;--space-sm:8px;--space-md:16px;--radius-card:10px}
body{background:var(--color-bg);color:var(--color-text);font:15px/1.6 system-ui,sans-serif}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font:12px/1.4 system-ui;color:var(--color-on-state)}
.badge.ok{background:var(--color-ok)}.badge.warn{background:var(--color-warn)}.badge.idle{background:var(--color-idle)}
.card{background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-card);padding:16px}
.copy-btn{height:28px;padding:0 8px;border-radius:6px;border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text);font:12px system-ui;cursor:pointer}
.copy-btn.copied{background:var(--color-ok);color:var(--color-on-state)}`;
  }
  const guide = `
/* specs/040 가이드 전용 */
body{margin:0}
.guide{max-width:760px;margin:0 auto;padding:24px 16px}
.guide h1{font:600 22px/1.4 system-ui;margin:0 0 4px}
.guide h2{font:600 18px/1.4 system-ui;margin:28px 0 10px;display:flex;align-items:center;gap:12px}
.guide .dim{color:var(--color-text-dim);font:13px/1.6 system-ui;margin:2px 0}
.guide .note{background:var(--color-bg);margin:12px 0}
.guide .card{margin:8px 0}
.prq,.step{padding:10px 0;border-bottom:1px solid var(--color-border)}
.prq:last-child,.step:last-child{border-bottom:0}
.prq b,.step b{margin-left:6px}
.step .n{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:999px;background:var(--color-primary);color:var(--color-on-primary);font:600 13px system-ui}
.cmd{font:13px ui-monospace,monospace;background:var(--color-bg);color:var(--color-text);padding:3px 8px;border-radius:6px;display:inline-block;max-width:100%;overflow-x:auto;white-space:nowrap;vertical-align:middle}
.guide details{margin:6px 0;font:13px/1.6 system-ui}
.guide summary{cursor:pointer;color:var(--color-primary)}
#refresh{font:12px system-ui;color:var(--color-primary);background:none;border:1px solid var(--color-border);border-radius:6px;padding:3px 8px;cursor:pointer}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}`;
  return base + "\n" + guide;
}

// ── HTML(비개발자 눈높이 상세 가이드 — design.md §4 콘텐츠) ──────────────

function prq(check, name, what, why, cmd, cmdLabel, help) {
  return `<div class="prq"><span class="badge idle" data-check="${check}">확인 중…</span><b>${name}</b>
    <div class="dim">${what}${why ? " · " + why : ""}</div>
    ${cmd ? `<div><code class="cmd" data-cmd="${escAttr(cmd)}">${cmdLabel || cmd}</code></div>` : ""}
    ${help ? `<details><summary>막히면</summary>${help}</details>` : ""}</div>`;
}

function renderHtml() {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>localmind 설치 가이드</title><link rel="stylesheet" href="/style.css"></head>
<body><main class="guide">
<h1>🧠 localmind 설치 가이드</h1>
<p class="dim">내 컴퓨터 안에 '1인 비서실'을 차립니다. 아래를 <b>위에서부터 차례로</b> 따라 하세요.
명령은 <b>[복사]</b> → 터미널에 붙여넣기 하면 됩니다.</p>
<div class="card note">ⓘ 이 페이지는 설치를 <b>안내</b>할 뿐, 아무것도 대신 실행하지 않아요(복사만 — 안전합니다).</div>

<h2>1. 준비물 <button id="refresh" type="button">↻ 새로고침</button></h2>
<div class="card">
${prq("dockerInstalled", "Docker Desktop", "무엇: 여러 프로그램을 서로 간섭 없이 돌리는 '컨테이너' 도구", "왜: localmind 두뇌가 이 위에서 돕니다", "https://www.docker.com/products/docker-desktop/", "docker.com 에서 설치", "설치 후 <b>실행</b>해서 메뉴바에 고래 아이콘이 뜨고 'Running'이 될 때까지 기다리세요.")}
${prq("dockerRunning", "Docker 실행 중", "무엇: 설치만으론 부족 — Docker Desktop 앱이 켜져 있어야 해요", "", "", "", "Docker Desktop을 실행하세요. 고래 아이콘이 초록/Running이면 됩니다.")}
${prq("node", "Node.js 20 이상", "무엇: 앱과 localmind를 잇는 도구", "왜: MCP 연결에 필요", "https://nodejs.org", "nodejs.org 에서 LTS 설치", "설치 후 <b>터미널을 새로 열고</b> <code class=\"cmd\" data-cmd=\"node -v\">node -v</code> 가 v20 이상인지 확인하세요.")}
${prq("make", "make", "무엇: 설치 명령을 묶어 실행하는 도구(보통 기본 설치돼 있어요)", "", "xcode-select --install", "Mac: xcode-select --install", "Mac은 위 명령으로 설치돼요. 설치 후 터미널을 새로 여세요.")}
${prq("git", "git", "무엇: localmind 코드를 내려받는 도구(보통 기본 설치돼 있어요)", "", "", "", "없다면 https://git-scm.com 에서 설치하거나, Mac은 xcode-select --install 로 함께 설치돼요.")}
${prq("env", ".env 설정 파일", "무엇: 내 설정이 담기는 파일 — make setup이 자동으로 만들어줘요", "", "", "", "아직 없어도 정상이에요. make setup이 만듭니다.")}
${prq("ollama", "ollama (선택)", "무엇: 의미 검색(임베딩)을 Mac에서 더 빠르게(Metal)", "왜: 없어도 되지만 있으면 빠름", "", "", "설치 전엔 없음이 정상이에요. 나중에 make doctor로 최적화할 수 있어요.")}
</div>

<h2>2. 설치 (복사 → 붙여넣기)</h2>
<div class="card">
<div class="step"><span class="n">1</span><b>터미널 열기</b>
  <div class="dim">명령을 입력하는 검은 창이에요. <b>Mac</b>: ⌘+Space를 눌러 "터미널"을 검색 → Enter.</div>
  <div class="dim"><b>Windows</b>: 아래 명령들은 리눅스 환경(WSL2)이 필요해요 — PowerShell에서
  <code class="cmd" data-cmd="wsl --install">wsl --install</code> 후 재부팅하고, 시작 메뉴에서 "Ubuntu"를 열어
  그 안에서 진행하세요. <b>(Windows는 아직 미검증 — WSL2로 동작이 기대되지만 문제가 있으면 알려주세요.)</b></div></div>
<div class="step"><span class="n">2</span><b>localmind 받기</b>
  <div><code class="cmd" data-cmd="git clone ${REPO}">git clone ${REPO}</code></div>
  <div><code class="cmd" data-cmd="cd localmind">cd localmind</code></div>
  <div class="dim">예상: 폴더가 만들어지고 그 안으로 이동합니다. (이미 받았으면 이 단계는 건너뛰기)</div></div>
<div class="step"><span class="n">3</span><b>설치 실행</b>
  <div><code class="cmd" data-cmd="make setup">make setup</code></div>
  <div class="dim">준비물 점검 → 설치 → 연결을 한국어로 한 단계씩 안내해요. 수 분 걸리고(다운로드 포함),
  질문이 나오면 대개 <b>Enter</b> 또는 <b>y</b>를 누르면 됩니다.</div>
  <details><summary>에러가 나면</summary>아래 <b>3. 문제 해결</b>을 보세요.</details></div>
</div>

<h2>다음 단계</h2>
<div class="card"><div class="dim">설치가 끝나면 → <b>첫 사용 튜토리얼</b>(docs/tutorial.md).
Claude Desktop을 쓴다면 연결도 한 줄:</div>
<div><code class="cmd" data-cmd="make mcp-desktop">make mcp-desktop</code></div></div>

<h2>3. 문제 해결</h2>
<div class="card">
<details><summary>docker compose 에러가 떠요 (또는 'Gordon' 도우미)</summary>
  Docker Desktop이 <b>실행 중</b>인지 확인한 뒤 다시 <code class="cmd" data-cmd="make setup">make setup</code>.</details>
<details><summary>'make: command not found'</summary>
  Mac은 <code class="cmd" data-cmd="xcode-select --install">xcode-select --install</code> 후 다시 시도하세요.</details>
<details><summary>포트가 이미 쓰인대요</summary>
  이미 떠 있는 stack이 있을 수 있어요. 자세한 해결은 docs/troubleshooting.md 를 참고하세요.</details>
</div>
</main>
<script>
(function(){
  // 명령 chip마다 복사 버튼(클립보드 성공 시 '복사됨', 미가용 시 드래그 선택 폴백)
  document.querySelectorAll('.cmd[data-cmd]').forEach(function(chip){
    var b=document.createElement('button'); b.className='copy-btn'; b.type='button'; b.textContent='복사';
    b.style.marginLeft='8px'; b.setAttribute('aria-label','명령 복사');
    b.addEventListener('click', function(){
      var t=chip.getAttribute('data-cmd');
      (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject())
        .then(function(){ b.textContent='복사됨 ✓'; b.classList.add('copied'); setTimeout(function(){b.textContent='복사';b.classList.remove('copied');},1500); })
        .catch(function(){ var r=document.createRange(); r.selectNodeContents(chip); var s=getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent='드래그해 복사'; });
    });
    chip.after(b);
  });
  // 준비물 실시간 점검 → 배지 갱신
  var OPT={ollama:1};
  function load(){
    document.querySelectorAll('.badge[data-check]').forEach(function(b){b.className='badge idle';b.textContent='확인 중…';});
    fetch('/api/checks').then(function(r){return r.json();}).then(function(d){
      document.querySelectorAll('.badge[data-check]').forEach(function(b){
        var k=b.getAttribute('data-check'), st=d[k]||'unknown';
        if(st==='ok'){b.className='badge ok';b.textContent='됨';}
        else if(st==='missing'){ if(OPT[k]){b.className='badge idle';b.textContent='선택 · 없음';} else {b.className='badge warn';b.textContent='안됨';} }
        else {b.className='badge idle';b.textContent='확인 불가';}
      });
    }).catch(function(){
      document.querySelectorAll('.badge[data-check]').forEach(function(b){b.className='badge idle';b.textContent='확인 불가';});
    });
  }
  document.getElementById('refresh').addEventListener('click', load);
  load();
})();
</script>
</body></html>`;
}

// ── 라우팅(테스트 대상): GET만, 명령 실행 엔드포인트 없음 ────────────────

export async function handle(method, url) {
  if (method !== "GET") {
    return { status: 405, contentType: "text/plain; charset=utf-8", body: "이 가이드는 읽기 전용이에요 (GET만 지원)." };
  }
  const p = String(url || "/").split("?")[0].split("#")[0];
  if (p === "/" || p === "") return { status: 200, contentType: "text/html; charset=utf-8", body: renderHtml() };
  if (p === "/api/checks") return { status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(await runChecks()) };
  if (p === "/style.css") return { status: 200, contentType: "text/css; charset=utf-8", body: readStyle() };
  if (p === "/favicon.ico") return { status: 204, contentType: "image/x-icon", body: "" };
  return { status: 404, contentType: "text/plain; charset=utf-8", body: "없는 경로예요." };
}

// ── 서버 기동(127.0.0.1 전용 · 포트 충돌 시 다음 포트 · 브라우저 자동 오픈) ──

function openBrowser(url) {
  if (process.env.LOCALMIND_NO_OPEN || !process.stdout.isTTY) return;
  let opener = null;
  if (process.platform === "darwin") opener = "open";
  else if (process.platform === "linux") opener = "xdg-open";
  else opener = "start";
  try {
    spawnSync(opener, [url], { stdio: "ignore", shell: process.platform === "win32" });
  } catch {
    /* 실패 무해 — 아래 URL 안내로 대체 */
  }
}

function start(port, triesLeft) {
  const server = http.createServer(async (req, res) => {
    try {
      const { status, contentType, body } = await handle(req.method, req.url);
      res.writeHead(status, { "content-type": contentType });
      res.end(body);
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("가이드 오류: " + (e && e.message));
    }
  });
  server.on("error", (e) => {
    if (e.code === "EADDRINUSE" && triesLeft > 0) {
      start(port + 1, triesLeft - 1);
    } else {
      console.error("가이드 서버를 시작하지 못했어요:", e.message);
      process.exit(1);
    }
  });
  server.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}/`;
    console.log(`\n🧠 localmind 설치 가이드가 열렸어요: ${url}`);
    console.log("   브라우저가 자동으로 안 열리면 위 주소를 직접 여세요. (중지: Ctrl+C)\n");
    openBrowser(url);
  });
}

// isMain: 양쪽을 realpath로 정규화해 비교한다. path.resolve는 심링크를 풀지 않지만
// fileURLToPath(import.meta.url)는 Node가 realpath로 반환 → 심링크 경로(예: macOS /tmp→/private/tmp,
// 심링크된 홈/볼륨)에서 클론 시 두 값이 달라 서버가 조용히 미기동했다(self-review 중대-1).
function isMainModule() {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}
if (isMainModule()) start(DEFAULT_PORT, 20);
