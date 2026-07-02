/**
 * second-brain 레이어: .md 노트(정본)에 대한 로컬 RAG.
 *
 *  - 노트는 NOTES_DIR의 마크다운 파일이 정본. NOTES_DIR는 쉼표로 여러 폴더 지정 가능.
 *  - 임베딩 인덱스는 파생물( 첫 폴더의 .brain-index.json ). 파일 해시로 증분 갱신.
 *  - 임베딩은 게이트웨이(bge-m3), 종합은 localmind 채팅(claude/codex)을 쓴다.
 *
 * pgvector/포트 노출이 필요 없도록 인덱스는 로컬 파일 + 인메모리 코사인으로 처리한다
 * (개인 지식 규모엔 충분). stdout은 MCP 전용이므로 이 모듈은 어떤 것도 stdout에 쓰지 않는다.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface NoteFolder {
  label: string;
  dir: string;
}

function expandHome(p: string): string {
  return p.startsWith("~") ? path.join(process.env.HOME ?? ".", p.slice(1)) : p;
}

// NOTES_DIR는 쉼표로 여러 폴더를 지정할 수 있다(주제/프로젝트별 분리).
//   NOTES_DIR="/notes/work,/notes/personal"
//   라벨을 직접 주려면  NOTES_DIR="work=/notes/work,life=/notes/personal"
// 라벨은 출처 표기(label/파일명)와 folder 스코프 필터에 쓰인다. 미지정 시 폴더명에서 자동.
function parseFolders(): NoteFolder[] {
  const raw = (process.env.NOTES_DIR ?? path.join(process.env.HOME ?? ".", ".localmind")).trim();
  const used = new Set<string>();
  const folders: NoteFolder[] = [];
  for (const spec of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const eq = spec.indexOf("=");
    let label = eq > 0 ? spec.slice(0, eq).trim() : "";
    let dir = path.resolve(expandHome(eq > 0 ? spec.slice(eq + 1).trim() : spec));
    if (!label) label = path.basename(dir).replace(/^\.+/, "") || "notes"; // 선행 점 제거(.localmind→localmind)
    let uniq = label;
    for (let n = 2; used.has(uniq); n++) uniq = `${label}-${n}`; // 라벨 충돌 방지
    used.add(uniq);
    folders.push({ label: uniq, dir });
  }
  return folders.length
    ? folders
    : [{ label: "notes", dir: path.resolve(path.join(process.env.HOME ?? ".", ".localmind")) }];
}

const FOLDERS = parseFolders();
const FOLDER_BY_LABEL = new Map(FOLDERS.map((f) => [f.label, f]));
// 인덱스는 기본적으로 첫 노트 폴더 안에 두되(기존 호환), git/싱크 볼트를 더럽히지
// 않도록 BRAIN_INDEX로 위치를 바꿀 수 있다.
const INDEX_PATH = process.env.BRAIN_INDEX ?? path.join(FOLDERS[0].dir, ".brain-index.json");

const EMB_URL = (process.env.EMBEDDINGS_URL ?? "http://localhost:4000/v1").replace(/\/$/, "");
// 키 하드코딩 폴백 없음(specs/014 FR-7) — 게이트웨이 키는 설치마다 임의 생성되므로
// MCP 등록 env(make mcp-install가 전달) 또는 호출 환경에서 와야 한다.
const EMB_KEY = process.env.EMBEDDINGS_KEY ?? process.env.LITELLM_MASTER_KEY ?? "";
const EMB_MODEL = process.env.EMBEDDINGS_MODEL ?? "text-embedding-3-small";

const GATEWAY_URL = (process.env.LOCALMIND_URL ?? "http://localhost:8787").replace(/\/$/, "");
const GATEWAY_KEY = process.env.LOCALMIND_API_KEY?.trim();
const ANSWER_MODEL = process.env.MCP_DEFAULT_MODEL ?? "sonnet";

const MAX_CHUNK = Math.max(400, Number(process.env.BRAIN_CHUNK_SIZE ?? 2000));

// ── specs/004: 쿼리 로그 (관측 레이어 — 실패 질의 분석의 데이터원) ─────────
// 개인 쿼리 패턴이 담기므로 로컬 전용(.gitignore + 백업 시드 제외). 분석: make query-report.
const QUERY_LOG_PATH =
  process.env.QUERY_LOG ?? path.join(process.env.HOME ?? ".", ".localmind", "query-log.jsonl");

interface QueryLogRecord {
  ts: string;
  tool: "search_notes" | "ask_brain" | "capture_note";
  query: string;
  hitCount: number;
  success: boolean;
  folder?: string | null;
  captureValidation?: string | null;
  sources?: string[];
}

/** fire-and-forget 로깅 — 기록 실패가 검색·캡처 응답을 절대 막지 않는다(004 FR-2).
 *  stdout은 MCP 프로토콜 전용이므로 오류는 stderr에만 남긴다. */
let queryLogDirReady = false; // mkdir은 첫 호출에만 — 매 검색마다 동기 FS 호출 방지(D-5)
function logQuery(rec: QueryLogRecord): void {
  try {
    if (!queryLogDirReady) {
      fs.mkdirSync(path.dirname(QUERY_LOG_PATH), { recursive: true });
      queryLogDirReady = true;
    }
    fs.appendFile(QUERY_LOG_PATH, JSON.stringify(rec) + "\n", (err) => {
      if (err) process.stderr.write(`[localmind-brain] 쿼리 로그 기록 실패(무시): ${err.message}\n`);
    });
  } catch (e) {
    process.stderr.write(`[localmind-brain] 쿼리 로그 기록 실패(무시): ${(e as Error).message}\n`);
  }
}

const INDEX_VERSION = 4; // 3→4: 임베딩 메타(embeddingModel·dims) 기록 + 청크 분할 방식 변경(specs/013)

interface IndexedChunk {
  path: string;
  text: string;
  vector: number[];
}
export interface FileEntry {
  hash: string;
  folder: string;
  chunks: IndexedChunk[];
  linksOut: string[]; // 본문 [[위키링크]]에서 추출한 원본 타겟 문자열(미해결 포함)
}
export interface BrainIndex {
  version: number;
  /** 이 인덱스를 만든 임베딩 모델명 — 현재 설정과 다르면 전체 재색인(specs/013 FR-5). */
  embeddingModel?: string;
  /** 임베딩 벡터 차원 — 첫 임베딩 후 기록. 쿼리 벡터와 다르면 재색인(같은 모델명으로
   *  다른 모델이 라우팅된 경우까지 방어 — 차원이 섞이면 NaN 코사인·무의미 결과가 난다). */
  dims?: number;
  files: Record<string, FileEntry>;
}

function ensureDirs(): void {
  for (const f of FOLDERS) fs.mkdirSync(f.dir, { recursive: true });
}

// 인메모리 캐시: 인덱스 파일(76MB까지 관찰됨)을 매 조회마다 파싱하지 않도록,
// 파일 stat(mtime+size)이 마지막 로드와 같으면 파싱된 객체를 재사용한다.
// mtime 해상도가 1초인 파일시스템에선 같은 초 내 외부 변경을 놓칠 수 있어 size도 함께 본다.
let cachedIndex: BrainIndex | null = null;
let cachedStat: { mtimeMs: number; size: number } | null = null;

// 각 인덱스 객체가 "언제의 디스크"에서 왔는지를 객체 자체에 스냅샷한다(symbol 키 —
// JSON 직렬화에 안 섞임). saveIndex의 reload-merge 기준을 공유 cachedStat이 아니라
// 이 스냅샷으로 잡아야, 중간의 무관한 loadIndex(다른 도구 호출·watcher)가 cachedStat을
// 전진시켜 병합을 무력화하는 경합이 없다(specs/013 self-review 결함 1).
const LOAD_STAT = Symbol("localmind.loadStat");
type LoadStat = { mtimeMs: number; size: number } | null; // null = 로드 시점에 디스크 파일 없음
function setLoadStat(idx: BrainIndex, stat: LoadStat): void {
  (idx as unknown as Record<symbol, LoadStat>)[LOAD_STAT] = stat;
}
function getLoadStat(idx: BrainIndex): LoadStat | undefined {
  return (idx as unknown as Record<symbol, LoadStat | undefined>)[LOAD_STAT];
}

// 테스트 계측: doEnsureIndexed 실제 실행 횟수(single-flight 검증용).
let indexRunCount = 0;

/** 테스트 전용: 캐시 상태·실행 카운터를 초기화한다(프로덕션 코드에서 호출 금지). */
export function _resetIndexCacheForTest(): void {
  cachedIndex = null;
  cachedStat = null;
  indexRunCount = 0;
}

/** 테스트 전용: doEnsureIndexed가 실제로 실행된 횟수. */
export function _indexRunCountForTest(): number {
  return indexRunCount;
}

/** 내부·테스트용: 인덱스 파일을 읽는다(캐시 경유). */
export function loadIndex(): BrainIndex {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(INDEX_PATH);
  } catch {
    // 파일 없음 → 낡은 캐시를 반환하지 않도록 무효화하고 빈 인덱스.
    cachedIndex = null;
    cachedStat = null;
    const empty: BrainIndex = { version: INDEX_VERSION, files: {} };
    setLoadStat(empty, null);
    return empty;
  }

  if (cachedIndex && cachedStat && cachedStat.mtimeMs === stat.mtimeMs && cachedStat.size === stat.size) {
    return cachedIndex; // 캐시 적중 — 디스크 재파싱 생략
  }

  try {
    const idx = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as BrainIndex;
    if (idx.version === INDEX_VERSION && idx.files) {
      // 임베딩 모델이 바뀐 인덱스는 벡터가 호환되지 않는다 — 전체 재색인(013 FR-5).
      if (idx.embeddingModel !== undefined && idx.embeddingModel !== EMB_MODEL) {
        notifyReindexOnce(`임베딩 모델이 바뀌어(${idx.embeddingModel} → ${EMB_MODEL})`);
      } else {
        cachedIndex = idx;
        cachedStat = { mtimeMs: stat.mtimeMs, size: stat.size };
        setLoadStat(idx, cachedStat);
        return idx;
      }
    } else if (typeof idx?.version === "number") {
      // 스키마 버전 업그레이드(예: 013의 청크 분할·메타 도입) — 조용히 수 분 재색인하지
      // 않도록 사유를 안내한다(FR-4, self-review 결함 2).
      notifyReindexOnce(`인덱스 형식이 바뀌어(v${idx.version} → v${INDEX_VERSION})`);
    }
  } catch {
    /* 손상 → 새로 만든다 */
  }
  // 버전 불일치(스키마 변경)·모델 변경·손상 → 전체 재인덱싱. 캐시는 무효화.
  cachedIndex = null;
  cachedStat = null;
  const fresh: BrainIndex = { version: INDEX_VERSION, embeddingModel: EMB_MODEL, files: {} };
  setLoadStat(fresh, { mtimeMs: stat.mtimeMs, size: stat.size });
  return fresh;
}

// 재색인 사유 안내는 loadIndex가 반복 호출돼도 한 번만 출력한다.
let reindexNotified = false;
function notifyReindexOnce(reason: string): void {
  if (reindexNotified) return;
  reindexNotified = true;
  process.stderr.write(
    `[localmind-brain] ${reason} 노트를 처음부터 다시 색인합니다. 노트가 많으면 시간이 걸릴 수 있어요.\n`,
  );
}

// ── 다중 프로세스 쓰기 안전(specs/013 FR-6) ─────────────────────────────────
// 인메모리 캐시·single-flight는 프로세스 안에서만 유효하다. Claude Desktop + Claude Code +
// Cursor처럼 stdio MCP 프로세스가 여럿이면 같은 인덱스 파일에 각자 로드→수정→저장을 해서
// 마지막 쓰기가 이긴다(다른 쪽 임베딩 유실). 파일 락으로 쓰기 구간을 직렬화하고, 쓰기
// 직전에 디스크가 내 로드 시점 이후 바뀌었으면 다시 읽어 병합한다(reload-merge).

const LOCK_PATH = `${INDEX_PATH}.lock`;
const LOCK_STALE_MS = Math.max(1000, Number(process.env.BRAIN_LOCK_STALE_MS ?? 10_000));

/** 동기 대기(외부 의존성 없이). saveIndex가 동기 함수라 setTimeout을 쓸 수 없다. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** 락 획득: O_EXCL 생성. 실패 시 재시도하되, 락 파일이 LOCK_STALE_MS보다 오래됐으면
 *  죽은 프로세스의 고아 락으로 보고 제거한다. 최악의 경우에도 유한 시간 안에 진행한다
 *  (영구 대기 금지 — 락은 정확성 보조 수단이고 최종 방어는 reload-merge다). */
function acquireLock(): void {
  const deadline = Date.now() + LOCK_STALE_MS * 2;
  for (;;) {
    try {
      fs.closeSync(fs.openSync(LOCK_PATH, "wx"));
      return;
    } catch {
      try {
        const st = fs.statSync(LOCK_PATH);
        if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
          fs.rmSync(LOCK_PATH, { force: true }); // stale — 강제 해제 후 재시도
          continue;
        }
      } catch {
        continue; // 락이 방금 사라짐 — 즉시 재시도
      }
      if (Date.now() > deadline) {
        fs.rmSync(LOCK_PATH, { force: true }); // 데드라인 초과 — 영구 대기 대신 강제 진행
        continue;
      }
      sleepSync(50);
    }
  }
}

function releaseLock(): void {
  fs.rmSync(LOCK_PATH, { force: true });
}

/** 같은 파일 키가 양쪽에 있으면: 해시가 같으면 내 것 유지, 다르면 실제 파일 내용(정본)과
 *  일치하는 쪽을 채택한다. 디스크에만 있는 키는 보존한다(다른 프로세스가 색인한 파일).
 *  삭제 반영의 지연(내가 지운 키를 디스크가 아직 갖고 있는 경우 등)은 다음 스캔에서
 *  수렴한다 — 파일이 정본이므로 인덱스는 언제나 재유도 가능. */
function mergeIndexFromDisk(ours: BrainIndex, disk: BrainIndex): void {
  for (const [key, dfe] of Object.entries(disk.files)) {
    const ofe = ours.files[key];
    if (!ofe) {
      ours.files[key] = dfe;
      continue;
    }
    if (ofe.hash === dfe.hash) continue;
    // 충돌: 현재 파일 내용의 해시와 일치하는 쪽이 최신이다.
    const f = FOLDER_BY_LABEL.get(dfe.folder);
    if (!f) continue;
    try {
      const cur = sha(fs.readFileSync(path.join(f.dir, key.slice(dfe.folder.length + 1)), "utf8"));
      if (dfe.hash === cur && ofe.hash !== cur) ours.files[key] = dfe;
    } catch {
      /* 파일 없음 — 내 것 유지, 다음 스캔에서 정리 */
    }
  }
  if (ours.dims === undefined && disk.dims !== undefined) ours.dims = disk.dims;
}

/** 내부·테스트용: 인덱스 파일을 원자적으로 저장한다(락 + reload-merge + 캐시 갱신). */
export function saveIndex(idx: BrainIndex): void {
  acquireLock();
  try {
    // reload-merge: 이 객체의 로드 시점 이후 다른 프로세스가 저장했으면 병합(FR-6).
    // 기준은 객체별 스냅샷(LOAD_STAT) — 공유 cachedStat을 기준으로 삼으면 중간의 무관한
    // loadIndex가 기준을 전진시켜 병합이 무력화된다(self-review 결함 1). 스냅샷이 없는
    // 객체(테스트·외부 조립)는 cachedStat으로 폴백.
    try {
      const stat = fs.statSync(INDEX_PATH);
      const base = getLoadStat(idx) === undefined ? cachedStat : getLoadStat(idx);
      if (!base || base.mtimeMs !== stat.mtimeMs || base.size !== stat.size) {
        const disk = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as BrainIndex;
        // 버전·임베딩 모델이 다른 인덱스(마이그레이션·모델 교체 중)는 병합하지 않는다 —
        // 낡은 벡터를 되살리면 차원 불일치가 재발한다.
        if (disk.version === idx.version && disk.files && disk.embeddingModel === idx.embeddingModel) {
          mergeIndexFromDisk(idx, disk);
        }
      }
    } catch {
      /* 디스크에 없음/손상 — 그대로 저장 */
    }

    // 원자적 쓰기: 같은 디렉토리의 temp 파일에 쓰고 rename으로 교체한다(rename은 동일
    // 파일시스템 내에서 원자적). 쓰기 도중 중단돼도 기존 인덱스 파일은 온전하다.
    // temp 이름에 pid를 붙여, 락 경합의 극단(동시 stale 강제 해제)에서도 서로의 temp를
    // 밟지 않는다(self-review 결함 5).
    const tmp = `${INDEX_PATH}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(idx));
    fs.renameSync(tmp, INDEX_PATH);
    // 방금 저장한 내용을 캐시에 반영 → 자기 저장 직후 조회가 디스크를 다시 읽지 않는다.
    try {
      const stat = fs.statSync(INDEX_PATH);
      cachedIndex = idx;
      cachedStat = { mtimeMs: stat.mtimeMs, size: stat.size };
      setLoadStat(idx, cachedStat);
    } catch {
      cachedIndex = null;
      cachedStat = null;
    }
  } finally {
    releaseLock();
  }
}

/** 인덱스를 비워 전체 재색인을 유도한다(병합 없이 덮어씀 — 모델·차원 교체용).
 *  saveIndex의 merge를 타면 낡은 벡터가 되살아나므로 반드시 이 경로를 쓴다. */
function resetIndex(): void {
  acquireLock();
  try {
    const empty: BrainIndex = { version: INDEX_VERSION, embeddingModel: EMB_MODEL, files: {} };
    const tmp = `${INDEX_PATH}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(empty));
    fs.renameSync(tmp, INDEX_PATH);
    try {
      const stat = fs.statSync(INDEX_PATH);
      cachedIndex = empty;
      cachedStat = { mtimeMs: stat.mtimeMs, size: stat.size };
      setLoadStat(empty, cachedStat);
    } catch {
      cachedIndex = null;
      cachedStat = null;
    }
  } finally {
    releaseLock();
  }
}

function listMarkdown(dir: string, isRoot = true): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue; // 숨김 파일/디렉토리 제외(인덱스 포함)
    // 백업 덤프(make backup)는 노트 폴더 '루트'의 memory.md로 떨어진다 — 루트만 제외하고
    // 하위 폴더의 memory.md 노트는 정상 색인한다.
    if (isRoot && e.name === "memory.md") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listMarkdown(full, false));
    else if (e.name.toLowerCase().endsWith(".md")) out.push(full);
  }
  return out;
}

/** MAX_CHUNK를 넘는 문단을 분할한다 — 잘라 버리지 않는다(유실 0, specs/013 FR-4).
 *  경계는 늦은 것 우선(줄 → 문장 끝 → 공백), 창의 절반보다 이른 경계는 무시하고,
 *  경계가 전혀 없으면 고정 창으로 자른다. */
function splitLongParagraph(p: string): string[] {
  const out: string[] = [];
  let rest = p;
  while (rest.length > MAX_CHUNK) {
    const window = rest.slice(0, MAX_CHUNK);
    const boundaries = [
      window.lastIndexOf("\n"),
      Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? ")),
      window.lastIndexOf(" "),
    ];
    const found = boundaries.find((b) => b >= MAX_CHUNK / 2);
    const cut = found === undefined ? MAX_CHUNK : found + 1;
    const piece = rest.slice(0, cut).trimEnd();
    if (piece) out.push(piece);
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

/** 텍스트를 임베딩 청크로 나눈다. 어떤 청크도 MAX_CHUNK를 넘지 않고, 원문 내용(공백 제외)은
 *  전부 청크 어딘가에 존재한다(specs/013 AC-6 불변식). 테스트를 위해 export. */
export function chunkText(text: string): string[] {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    for (const piece of splitLongParagraph(p)) {
      if (cur && (cur.length + 2 + piece.length) > MAX_CHUNK) {
        chunks.push(cur);
        cur = piece;
      } else {
        cur = cur ? `${cur}\n\n${piece}` : piece;
      }
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** 텍스트에서 위키링크([[target]], [[target|alias]])의 target을 추출한다. 표시 텍스트(alias)는 버린다. */
export function extractLinks(text: string): string[] {
  const links: string[] = [];
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const target = m[1].trim();
    if (target) links.push(target);
  }
  return links;
}

// 대소문자 무시 비교용. macOS/Windows는 파일시스템이 기본적으로 대소문자를 구분하지
// 않고 Obsidian 자체도 링크 해석 시 대소문자를 구분하지 않으므로, [[Note-B]]가 실제
// 파일 note-b.md를 가리켜도 해석돼야 한다(self-review에서 발견).
function basenameNoExt(p: string): string {
  return path.basename(p).replace(/\.md$/i, "").toLowerCase();
}

/** 위키링크 target을 인덱스의 실제 노트 키('label/relpath')로 해석한다(basename 매칭,
 *  대소문자 구분 없음). fromFolder(같은 폴더)를 우선하고, 없으면 전체 vault에서 첫 매칭.
 *  없으면 null(미해결). */
export function resolveLink(target: string, fromFolder: string, idx: BrainIndex): string | null {
  const targetBase = basenameNoExt(target);
  const keys = Object.keys(idx.files);
  const sameFolder = keys.find((k) => idx.files[k].folder === fromFolder && basenameNoExt(k) === targetBase);
  if (sameFolder) return sameFolder;
  return keys.find((k) => basenameNoExt(k) === targetBase) ?? null;
}

function sha(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

async function embed(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  if (!EMB_KEY) {
    throw new Error(
      "게이트웨이 키(LITELLM_MASTER_KEY)가 설정되지 않았어요 — 'make mcp-install'을 다시 실행해 " +
        "연결을 갱신하거나, MCP 설정의 env에 .env의 LITELLM_MASTER_KEY 값을 넣어 주세요.",
    );
  }
  const attempts = Math.max(1, Number(process.env.EMBED_RETRIES ?? 5));
  const timeoutMs = Number(process.env.EMBED_TIMEOUT_MS ?? 120000);
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${EMB_URL}/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${EMB_KEY}` },
        body: JSON.stringify({ model: EMB_MODEL, input: texts }),
        signal: AbortSignal.timeout(timeoutMs), // 행 방지: 요청 타임아웃 후 재시도
      });
      if (!res.ok) throw new Error(`embeddings HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const j: any = await res.json();
      return (j.data as any[]).sort((a, b) => a.index - b.index).map((d) => d.embedding as number[]); // index 순서 보존
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1))); // 백오프
    }
  }
  throw lastErr;
}

function cosine(a: number[], b: number[]): number {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return d / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/**
 * 변경된 노트만 증분 임베딩해 인덱스를 최신화한다. 모든 폴더를 훑되 키는 'label/rel'로
 * namespacing 해 폴더 간 같은 파일명 충돌을 막고, folder 태그로 스코프 검색을 가능케 한다.
 *
 * 속도: 임베딩 요청은 고정 오버헤드가 커서, 파일 단위가 아니라 모든 청크를 펼쳐
 * 배치(BRAIN_BATCH=8)로 묶어 보낸다 → 오버헤드 분산. CPU 임베딩은 청크당 1~4s라
 * 배치가 크면 요청 타임아웃을 넘겨 재시도 cascade가 나므로 작게 잡고, 동시성도
 * 낮게(BRAIN_CONCURRENCY=2: NUM_PARALLEL=1 ollama 큐 적체 완화) 둔다.
 * 파일은 청크가 모두 임베딩된 뒤에만 커밋하고 배치마다 저장해 중단에도 안전(이어감).
 *
 * single-flight: 이미 실행 중이면 새 스캔·임베딩을 시작하지 않고 진행 중인 실행의 결과를
 * 공유한다(watcher 이벤트와 MCP 도구 호출이 동시에 불러도 임베딩 중복 없음). 합류한
 * 호출자는 "합류 시점 이후의 파일 변경"을 못 볼 수 있으나, 기존 동시 실행(각자 스캔 후
 * 마지막 쓰기 승리)보다 나쁘지 않고 다음 호출에서 반영된다.
 */
let indexingInFlight: Promise<BrainIndex> | null = null;

function ensureIndexed(): Promise<BrainIndex> {
  if (indexingInFlight) return indexingInFlight;
  indexingInFlight = doEnsureIndexed().finally(() => {
    indexingInFlight = null;
  });
  return indexingInFlight;
}

async function doEnsureIndexed(): Promise<BrainIndex> {
  indexRunCount++; // 테스트 계측(single-flight 검증)
  ensureDirs();
  const idx = loadIndex();
  idx.embeddingModel = EMB_MODEL; // 인덱스가 자기 임베딩 모델을 안다(013 FR-5)
  const seen = new Set<string>();

  const pending: { key: string; folder: string; hash: string; chunks: string[]; linksOut: string[] }[] = [];
  for (const f of FOLDERS) {
    for (const full of listMarkdown(f.dir)) {
      const key = `${f.label}/${path.relative(f.dir, full)}`;
      seen.add(key);
      let text: string;
      try {
        text = fs.readFileSync(full, "utf8");
      } catch (e) {
        // dangling 심링크·권한 문제 파일 하나가 색인 전체(검색·캡처)를 크래시시키지 않게
        // 건너뛴다(self-review 결함 4). 기존 엔트리는 seen 처리돼 보존된다.
        process.stderr.write(`[localmind-brain] 읽기 실패로 건너뜀: ${key} (${(e as Error).message})\n`);
        continue;
      }
      const h = sha(text);
      if (idx.files[key]?.hash === h) continue; // 변경 없음
      pending.push({ key, folder: f.label, hash: h, chunks: chunkText(text), linksOut: extractLinks(text) });
    }
  }

  if (pending.length) {
    const vecs = new Map<string, (number[] | undefined)[]>();
    const remaining = new Map<string, number>();
    const byKey = new Map(pending.map((p) => [p.key, p]));
    for (const p of pending) {
      vecs.set(p.key, new Array(p.chunks.length));
      remaining.set(p.key, p.chunks.length);
      // 빈 파일 즉시 커밋(청크 없어도 링크는 추출·저장)
      if (p.chunks.length === 0) idx.files[p.key] = { hash: p.hash, folder: p.folder, chunks: [], linksOut: p.linksOut };
    }

    type Ref = { key: string; ci: number; text: string };
    const flat: Ref[] = [];
    for (const p of pending) p.chunks.forEach((c, ci) => flat.push({ key: p.key, ci, text: c }));

    // CPU 임베딩은 청크당 1~4s라 배치가 크면 요청이 타임아웃을 넘겨 재시도 cascade가
    // 난다. 작은 배치(8)로 각 요청을 타임아웃 한참 안에 끝낸다.
    const batchSize = Math.max(1, Number(process.env.BRAIN_BATCH ?? 8));
    const batches: Ref[][] = [];
    for (let i = 0; i < flat.length; i += batchSize) batches.push(flat.slice(i, i + batchSize));

    let cursor = 0;
    async function worker(): Promise<void> {
      while (cursor < batches.length) {
        const batch = batches[cursor++];
        const out = await embed(batch.map((r) => r.text));
        if (idx.dims === undefined && out.length) idx.dims = out[0].length; // 차원 기록(013 FR-5)
        for (let j = 0; j < batch.length; j++) {
          const r = batch[j];
          vecs.get(r.key)![r.ci] = out[j];
          const rem = remaining.get(r.key)! - 1;
          remaining.set(r.key, rem);
          if (rem === 0) {
            const p = byKey.get(r.key)!;
            idx.files[r.key] = {
              hash: p.hash,
              folder: p.folder,
              chunks: p.chunks.map((c, k) => ({ path: r.key, text: c, vector: vecs.get(r.key)![k]! })),
              linksOut: p.linksOut,
            };
          }
        }
        saveIndex(idx); // 완료된 파일만 반영해 진행 저장
      }
    }
    // NUM_PARALLEL=1 ollama에선 동시 요청이 큐 적체로 행을 유발할 수 있어 기본 2.
    const conc = Math.max(1, Number(process.env.BRAIN_CONCURRENCY ?? 2));
    await Promise.all(Array.from({ length: Math.min(conc, batches.length) }, () => worker()));
  }

  // 삭제된 파일 제거
  for (const key of Object.keys(idx.files)) if (!seen.has(key)) delete idx.files[key];

  saveIndex(idx);
  return idx;
}

export interface NoteHit {
  path: string;
  text: string;
  score: number;
}

/** 노트 의미검색. folder(라벨)를 주면 그 폴더로 한정. */
export async function searchNotes(query: string, limit = 5, folder?: string): Promise<NoteHit[]> {
  const out = await searchNotesInternal(query, limit, folder);
  logQuery({
    ts: new Date().toISOString(),
    tool: "search_notes",
    query,
    hitCount: out.length,
    success: out.length > 0,
    folder: folder ?? null,
  });
  return out;
}

/** 로깅 없는 내부 검색 — askBrain이 경유한다. 위임 호출까지 기록하면 ask 1회가
 *  레코드 2건이 되어 리포트 빈도가 2배 왜곡된다(004 self-review D-1). */
async function searchNotesInternal(query: string, limit: number, folder?: string): Promise<NoteHit[]> {
  let idx = await ensureIndexed();
  const [qv] = await embed([query]);
  // 차원 불일치 = 같은 모델명으로 다른 모델이 라우팅됐다는 뜻 — NaN 코사인으로 조용히
  // 쓰레기 결과를 내는 대신 전체 재색인한다(013 FR-5, AC-7).
  if (idx.dims !== undefined && qv.length !== idx.dims) {
    process.stderr.write(
      `[localmind-brain] 임베딩 차원이 인덱스(${idx.dims})와 달라(${qv.length}) 노트를 처음부터 다시 색인합니다.\n`,
    );
    resetIndex();
    idx = await ensureIndexed();
  }
  const hits: NoteHit[] = [];
  for (const fe of Object.values(idx.files)) {
    if (folder && fe.folder !== folder) continue; // 스코프 필터
    for (const c of fe.chunks) hits.push({ path: c.path, text: c.text, score: cosine(qv, c.vector) });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

export interface CaptureResult {
  path: string;
  validationStatus: "confirmed" | "unconfirmed" | "skipped";
  retried: boolean;
}

/** 텍스트에서 재검색 쿼리를 추출한다. frontmatter/제목을 건너뛰고 첫 유효 줄 50자. 10자 미만이면 null. */
export function extractSearchQuery(text: string): string | null {
  const stripped = text.replace(/^---[\s\S]*?---\s*/m, ""); // frontmatter 제거
  const first = stripped
    .split("\n")
    .map((l) => l.replace(/^#+\s*/, "").trim()) // 마크다운 헤딩 기호 제거
    .find((l) => l.length > 0) ?? "";
  const q = first.slice(0, 50);
  return q.length >= 10 ? q : null;
}

/** 노트 파일을 배타적으로 생성한다(specs/013 FR-8). 같은 이름이 이미 있으면 `-2`, `-3` …
 *  접미로 재시도해 기존 파일을 덮어쓰지 않는다. 최종 파일명을 반환. 순수 fs 연산 —
 *  인덱싱과 분리해 단위 테스트 가능. */
export function createNoteFile(dir: string, fname: string, body: string): string {
  const ext = path.extname(fname);
  const base = fname.slice(0, fname.length - ext.length);
  let name = fname;
  for (let n = 2; ; n++) {
    try {
      fs.writeFileSync(path.join(dir, name), body, { flag: "wx" }); // 배타 생성
      return name;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      name = `${base}-${n}${ext}`;
    }
  }
}

/** 노트를 새 마크다운 파일로 저장하고 인덱싱한 뒤 인덱싱 검증 결과를 반환한다.
 *  folder(라벨)로 대상 폴더 선택(기본 첫 폴더). */
export async function capture(text: string, title?: string, folder?: string): Promise<CaptureResult> {
  ensureDirs();
  const target = (folder && FOLDER_BY_LABEL.get(folder)) || FOLDERS[0];
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const slug =
    (title ?? text)
      .slice(0, 40)
      .replace(/[^\w가-힣\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-") || "note";
  const isoDate = new Date().toISOString().slice(0, 19);
  const frontmatter = [
    "---",
    `title: "${(title ?? slug).replace(/"/g, "'")}"`,
    `date: ${isoDate}`,
    "tags: []",
    "source: localmind",
    "---",
    "",
  ].join("\n");
  const body = title ? `${frontmatter}# ${title}\n\n${text}\n` : `${frontmatter}${text}\n`;
  // 배타적 생성 — 같은 초에 같은 제목으로 캡처해도 먼저 저장된 노트를 덮어쓰지 않는다(013 FR-8).
  const fname = createNoteFile(target.dir, `${ts}-${slug}`.slice(0, 80) + ".md", body);

  const key = `${target.label}/${fname}`;

  // 텍스트가 너무 짧으면 검증 생략
  if (!extractSearchQuery(text)) {
    await ensureIndexed();
    const skipped: CaptureResult = { path: key, validationStatus: "skipped", retried: false };
    logCapture(skipped, title ?? text.slice(0, 50), target.label);
    return skipped;
  }

  const VALIDATE_TIMEOUT_MS = Number(process.env.CAPTURE_VALIDATE_TIMEOUT_MS ?? 3000);

  // 직접 인덱스 확인 (similarity search보다 정확하고 추가 임베딩 API 호출 없음)
  const checkIndexed = (): boolean => {
    try {
      return !!loadIndex().files[key];
    } catch {
      return false;
    }
  };

  await ensureIndexed();

  let found = checkIndexed();
  let retried = false;

  if (!found) {
    retried = true;
    try {
      await Promise.race([
        ensureIndexed(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("validate-timeout")), VALIDATE_TIMEOUT_MS),
        ),
      ]);
      found = checkIndexed();
    } catch {
      // 타임아웃 또는 재시도 실패 — 파일은 저장됐으므로 unconfirmed 반환
    }
  }

  const result: CaptureResult = {
    path: key,
    validationStatus: found ? "confirmed" : "unconfirmed",
    retried,
  };
  logCapture(result, title ?? text.slice(0, 50), target.label);
  return result;
}

/** capture 이벤트 로깅(004 확정안: search/ask와 연결하지 않는 별도 레코드). */
function logCapture(result: CaptureResult, query: string, folder: string): void {
  logQuery({
    ts: new Date().toISOString(),
    tool: "capture_note",
    query,
    hitCount: 0,
    success: result.validationStatus === "confirmed",
    folder,
    captureValidation: result.validationStatus,
  });
}

export interface BrainAnswer {
  answer: string;
  sources: string[];
}

/** RAG: 노트 검색 → 컨텍스트로 claude/codex 종합 답변(인용 포함). folder(라벨)로 한정 가능. */
export async function askBrain(question: string, k = 5, folder?: string): Promise<BrainAnswer> {
  const hits = await searchNotesInternal(question, k, folder); // 내부 경유 — 이중 기록 방지(D-1)
  const logAsk = (sources: string[]) =>
    logQuery({
      ts: new Date().toISOString(),
      tool: "ask_brain",
      query: question,
      hitCount: hits.length,
      success: sources.length > 0,
      folder: folder ?? null,
      sources,
    });
  if (!hits.length) {
    logAsk([]);
    return { answer: "관련 노트를 찾지 못했습니다.", sources: [] };
  }

  const context = hits.map((h) => `[${h.path}]\n${h.text}`).join("\n\n---\n\n");
  const sources = [...new Set(hits.map((h) => h.path))];
  logAsk(sources);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (GATEWAY_KEY) headers.Authorization = `Bearer ${GATEWAY_KEY}`;
  const res = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: ANSWER_MODEL,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "당신은 사용자의 개인 노트만 근거로 답하는 어시스턴트입니다. 아래 '노트'에 있는 내용만 사용하고, " +
            "출처를 [경로]로 인용하세요. 노트에 없으면 모른다고 답하세요.",
        },
        { role: "user", content: `노트:\n${context}\n\n질문: ${question}` },
      ],
    }),
  });
  if (!res.ok) {
    return { answer: `종합 실패 (HTTP ${res.status})`, sources };
  }
  const j: any = await res.json();
  return { answer: j?.choices?.[0]?.message?.content ?? "(빈 응답)", sources };
}

export interface ResolvedLink {
  /** resolved:true면 해석된 노트 키('label/relpath'), false면 원본 위키링크 타겟 문자열. */
  target: string;
  resolved: boolean;
}
export interface NoteLinks {
  outgoing: ResolvedLink[];
  incoming: string[];
}

/** 노트의 1-hop 위키링크 관계(outgoing/incoming)를 조회한다. 노트가 없으면 null. */
export async function noteLinks(notePath: string): Promise<NoteLinks | null> {
  const idx = await ensureIndexed();
  const entry = idx.files[notePath];
  if (!entry) return null;

  const outgoing: ResolvedLink[] = entry.linksOut.map((raw) => {
    const resolved = resolveLink(raw, entry.folder, idx);
    return resolved ? { target: resolved, resolved: true } : { target: raw, resolved: false };
  });

  const incoming: string[] = [];
  for (const [key, fe] of Object.entries(idx.files)) {
    if (key === notePath) continue;
    for (const raw of fe.linksOut) {
      if (resolveLink(raw, fe.folder, idx) === notePath) {
        incoming.push(key);
        break;
      }
    }
  }

  return { outgoing, incoming };
}

/** 인덱스에서 단일 파일 항목을 제거하고 저장한다. 파일 삭제 이벤트 처리용. */
export function removeFromIndex(key: string): void {
  try {
    const idx = loadIndex();
    if (key in idx.files) {
      delete idx.files[key];
      saveIndex(idx);
    }
  } catch {
    /* 인덱스 없음 — 무시 */
  }
}

/** NOTES_DIR의 모든 폴더를 감시하고 .md 파일 변경 시 증분 reindex를 트리거한다.
 *  stdout에는 아무것도 쓰지 않는다(MCP 프로토콜 전용). 모든 로그는 stderr. */
export function watchNotes(): { close(): void } {
  const debounceMap = new Map<string, ReturnType<typeof setTimeout>>();
  const DEBOUNCE_MS = Number(process.env.WATCH_DEBOUNCE_MS ?? 500);
  const watchers: fs.FSWatcher[] = [];

  for (const f of FOLDERS) {
    if (!fs.existsSync(f.dir)) continue;
    try {
      const watcher = fs.watch(f.dir, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const rel = path.normalize(filename); // 플랫폼 구분자 통일
        if (!rel.toLowerCase().endsWith(".md")) return;

        const fullPath = path.join(f.dir, rel);
        const key = `${f.label}/${rel}`;

        const existing = debounceMap.get(key);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(async () => {
          debounceMap.delete(key);
          if (fs.existsSync(fullPath)) {
            process.stderr.write(`[localmind-watcher] reindexing: ${key}\n`);
            try {
              await ensureIndexed();
              process.stderr.write(`[localmind-watcher] done: ${key}\n`);
            } catch (e) {
              process.stderr.write(`[localmind-watcher] error: ${(e as Error).message}\n`);
            }
          } else {
            process.stderr.write(`[localmind-watcher] removing: ${key}\n`);
            removeFromIndex(key);
          }
        }, DEBOUNCE_MS);

        debounceMap.set(key, timer);
      });
      watchers.push(watcher);
    } catch (e) {
      process.stderr.write(`[localmind-watcher] failed to watch ${f.dir}: ${(e as Error).message}\n`);
    }
  }

  process.stderr.write(`[localmind-watcher] watching: ${FOLDERS.map((f) => f.dir).join(", ")}\n`);

  return {
    close() {
      for (const timer of debounceMap.values()) clearTimeout(timer);
      debounceMap.clear();
      for (const w of watchers) w.close();
      process.stderr.write("[localmind-watcher] stopped\n");
    },
  };
}

/** 모든 노트 폴더를 (재)인덱싱하고 통계를 돌려준다. 복구·대량추가 후 인덱스를 미리 데운다. */
export async function reindex(): Promise<{ files: number; chunks: number }> {
  const idx = await ensureIndexed();
  let chunks = 0;
  for (const fe of Object.values(idx.files)) chunks += fe.chunks.length;
  return { files: Object.keys(idx.files).length, chunks };
}

/** 설정된 노트 폴더 목록(라벨+경로). whoami/검증용. */
export function listFolders(): NoteFolder[] {
  return FOLDERS.map((f) => ({ ...f }));
}

/** 노트 폴더 요약 문자열(label:dir, ...). */
export function notesDir(): string {
  return FOLDERS.map((f) => `${f.label}:${f.dir}`).join(", ");
}

/** 노트 파일 목록(label/파일경로). folder(라벨)로 한정 가능. 임베딩 불필요(스캔만). */
export function listNotes(folder?: string): { folder: string; path: string }[] {
  const out: { folder: string; path: string }[] = [];
  for (const f of FOLDERS) {
    if (folder && f.label !== folder) continue;
    for (const full of listMarkdown(f.dir)) out.push({ folder: f.label, path: `${f.label}/${path.relative(f.dir, full)}` });
  }
  return out;
}

/** 'label/파일경로' 노트 한 개를 삭제하고 재인덱싱한다. 폴더 밖 경로는 거부. 반환: 삭제 성공 여부. */
/**
 * 노트를 폴더의 `.trash/` 하위로 **상대경로를 보존해** 이동한다(soft-delete, specs/011 FR-4).
 * - `label/sub/note.md` → `<folderDir>/.trash/sub/note.md` (AC-9: 하위폴더 경로 보존)
 * - 같은 위치에 파일이 있으면 타임스탬프(+카운터) 접미로 충돌을 피한다(AC-7: 덮어쓰기 없음)
 * `.trash/`는 숨김 폴더라 listMarkdown이 인덱싱에서 자동 제외한다(검색 미노출).
 * 순수 fs 연산 — 인덱싱과 분리해 단위 테스트 가능. 이동한 목적지 절대경로를 반환.
 */
export function moveToTrash(full: string, folderDir: string): string {
  const rel = path.relative(folderDir, full); // 폴더 내 상대경로 보존
  const trashDir = path.join(folderDir, ".trash");
  let dest = path.join(trashDir, rel);
  if (fs.existsSync(dest)) {
    const ext = path.extname(dest);
    const base = dest.slice(0, dest.length - ext.length);
    dest = `${base}-${Date.now()}${ext}`;
    let n = 1;
    while (fs.existsSync(dest)) dest = `${base}-${Date.now()}-${n++}${ext}`;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(full, dest);
  return dest;
}

export type DeleteNoteResult =
  | { ok: true }
  /** invalid-target: 노트가 아닌 대상(비-.md, 숨김 파일/폴더, 폴더 밖 경로) — specs/013 FR-7 */
  | { ok: false; reason: "not-found" | "invalid-target" };

export async function deleteNote(qualified: string): Promise<DeleteNoteResult> {
  const notFound: DeleteNoteResult = { ok: false, reason: "not-found" };
  const invalid: DeleteNoteResult = { ok: false, reason: "invalid-target" };
  const slash = qualified.indexOf("/");
  if (slash < 0) return notFound;
  const f = FOLDER_BY_LABEL.get(qualified.slice(0, slash));
  if (!f) return notFound;
  const full = path.resolve(f.dir, qualified.slice(slash + 1));
  if (full !== f.dir && !full.startsWith(path.resolve(f.dir) + path.sep)) return invalid; // 폴더 밖 탈출 방지
  // 노트(.md)만 삭제 대상이다 — 인덱스(.brain-index.json)·휴지통(.trash/)·설정 등
  // 숨김 파일/폴더나 비-.md 파일은 프롬프트 주입·착오로 지목돼도 거부한다(013 FR-7).
  if (!full.toLowerCase().endsWith(".md")) return invalid;
  const rel = path.relative(f.dir, full);
  if (rel.split(path.sep).some((seg) => seg.startsWith("."))) return invalid;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return notFound;
  // 심링크 경유 탈출 방지 — 경로 문자열은 폴더 안이어도 실경로가 밖이면 거부
  // (self-review 결함 3: notes/link→밖 심링크로 vault 밖 파일이 이동되는 우회).
  try {
    const realFull = fs.realpathSync(full);
    const realDir = fs.realpathSync(f.dir);
    if (realFull !== realDir && !realFull.startsWith(realDir + path.sep)) return invalid;
  } catch {
    return notFound;
  }
  moveToTrash(full, f.dir); // 영구 삭제 대신 휴지통 이동(soft-delete)
  await ensureIndexed();
  return { ok: true };
}
