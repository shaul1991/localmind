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
import { agentsDir } from "./agents/registry.js";
import { skillsDir } from "./agents/skills.js";
import {
  modelBackend,
  parseVerdict,
  personaChat,
  pickCrossTarget,
  pickTarget,
  resolvePersona,
} from "./agents/runtime.js";
import { countVerifyOnDay, readRecords, type QueryLogRecord } from "./query-analysis.js";

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
// specs/034 — 모니터링 UI가 같은 폴더/인덱스 해석을 재사용한다(재유도 금지).
// 프로세스 기동 전에 셸 진입점이 NOTES_DIR를 해석·export하는 전제(019 규칙)는 동일.
export function notesFolders(): NoteFolder[] {
  return FOLDERS;
}
export function brainIndexPath(): string {
  return INDEX_PATH;
}
// specs/020 FR-3 — 후퇴 판정: NOTES_DIR가 이 프로세스 env에 없어 FOLDERS가 기본값으로
// 재계산된 상태(자체 폴백), 또는 셸 진입점이 폴백을 썼다는 신호(REINDEX_FALLBACK=1 —
// reindex.sh가 REINDEX_FALLBACK_DIR로 NOTES_DIR를 재할당한 경우 NOTES_DIR만으로는 구분
// 불가라 별도 신호가 필요). 후퇴 중엔 폴더·라벨 구성이 신뢰 불가 — 삭제 반영 전면 보류.
const REINDEX_FALLBACK = process.env.REINDEX_FALLBACK === "1" || !process.env.NOTES_DIR?.trim();
// 인덱스는 기본적으로 첫 노트 폴더 안에 두되(기존 호환), git/싱크 볼트를 더럽히지
// 않도록 BRAIN_INDEX로 위치를 바꿀 수 있다.
const INDEX_PATH = process.env.BRAIN_INDEX ?? path.join(FOLDERS[0].dir, ".brain-index.json");

const EMB_URL = (process.env.EMBEDDINGS_URL ?? "http://localhost:4000/v1").replace(/\/$/, "");
// 키 하드코딩 폴백 없음(specs/014 FR-7) — 게이트웨이 키는 설치마다 임의 생성되므로
// MCP 등록 env(make mcp-install가 전달) 또는 호출 환경에서 와야 한다.
const EMB_KEY = process.env.EMBEDDINGS_KEY ?? process.env.LITELLM_MASTER_KEY ?? "";
const EMB_MODEL = process.env.EMBEDDINGS_MODEL ?? "text-embedding-3-small";

// specs/041 — 검색 조합·임베딩 구현의 안정된 식별자. 이 상수 하나를 logger 이벤트와
// readRuntimeSnapshot projection이 공유한다(literal 복제 금지 — 042가 owner를 옮겨도 한 곳만).
const RETRIEVAL_ALGORITHM = "cosine-full-scan-v1" as const;
const EMBEDDING_IMPLEMENTATION = "openai-compatible-http-embeddings-v1" as const;

const GATEWAY_URL = (process.env.LOCALMIND_URL ?? "http://localhost:8787").replace(/\/$/, "");
const GATEWAY_KEY = process.env.LOCALMIND_API_KEY?.trim();
const ANSWER_MODEL = process.env.MCP_DEFAULT_MODEL ?? "sonnet";

const MAX_CHUNK = Math.max(400, Number(process.env.BRAIN_CHUNK_SIZE ?? 2000));

// ── specs/004: 쿼리 로그 (관측 레이어 — 실패 질의 분석의 데이터원) ─────────
// 개인 쿼리 패턴이 담기므로 로컬 전용(.gitignore + 백업 시드 제외). 분석: make query-report.
const QUERY_LOG_PATH =
  process.env.QUERY_LOG ?? path.join(process.env.HOME ?? ".", ".localmind", "query-log.jsonl");

// QueryLogRecord 타입 정본은 query-analysis.ts — CLI 리포트·리포트 노트와 공유(017).

/** fire-and-forget 로깅 — 기록 실패가 검색·캡처 응답을 절대 막지 않는다(004 FR-2).
 *  stdout은 MCP 프로토콜 전용이므로 오류는 stderr에만 남긴다. */
let queryLogDirReady = false; // mkdir은 첫 호출에만 — 매 검색마다 동기 FS 호출 방지(D-5)

// specs/041 — pending append 추적(drain seam). production 응답은 append를 기다리지 않는다
// (기존 fire-and-forget 불변). evaluation runner/테스트만 drainQueryEvents로 settled를 await한다.
// 카운터는 직전 drain 이후의 attempted/succeeded/failed(정수)이며, in-flight promise는 settle 시
// 제거해 production에서 메모리가 누적되지 않는다(누구도 drain하지 않아도 안전).
let pendingAppends = new Set<Promise<void>>();
let drainAttempted = 0;
let drainSucceeded = 0;
let drainFailed = 0;
function logQuery(rec: QueryLogRecord): void {
  drainAttempted++;
  let settle!: () => void;
  const tracked = new Promise<void>((res) => {
    settle = res;
  });
  pendingAppends.add(tracked);
  const done = (ok: boolean): void => {
    if (ok) drainSucceeded++;
    else drainFailed++;
    pendingAppends.delete(tracked);
    settle();
  };
  try {
    if (!queryLogDirReady) {
      fs.mkdirSync(path.dirname(QUERY_LOG_PATH), { recursive: true });
      queryLogDirReady = true;
    }
    fs.appendFile(QUERY_LOG_PATH, JSON.stringify(rec) + "\n", (err) => {
      if (err) {
        process.stderr.write(`[localmind-brain] 쿼리 로그 기록 실패(무시): ${err.message}\n`);
        done(false);
      } else done(true);
    });
  } catch (e) {
    process.stderr.write(`[localmind-brain] 쿼리 로그 기록 실패(무시): ${(e as Error).message}\n`);
    done(false);
  }
}

/** specs/041 — 직전 drain 이후 enqueue된 append의 settled 결과를 세고 reset한다.
 *  production 호출자는 부르지 않는다(그래서 카운터는 정수만 누적, in-flight set은 settle 시
 *  비워짐). append 실패를 검색 예외로 승격하지 않는다 — 관측 실패는 검색 응답과 무관. */
async function drainQueryEvents(): Promise<QueryEventDrainResult> {
  await Promise.all([...pendingAppends]); // in-flight append가 settle될 때까지만 대기(sleep 없음)
  const result: QueryEventDrainResult = { attempted: drainAttempted, succeeded: drainSucceeded, failed: drainFailed };
  drainAttempted = 0;
  drainSucceeded = 0;
  drainFailed = 0;
  return result;
}

const INDEX_VERSION = 5; // 4→5: 벡터를 바이너리 사이드카로 분리(specs/023 — 디스크 인코딩만 변경)

/** 인메모리 청크 — 벡터 보유(검색·병합은 이 형태만 본다, specs/023 불변식). */
interface IndexedChunk {
  path: string;
  text: string;
  vector: number[];
}
/** 디스크(v5) 청크 — 벡터 대신 사이드카 slot 참조. 직렬화 경계에서만 존재. */
interface DiskChunk {
  path: string;
  text: string;
  slot: number;
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
  /** v5 — 현재 벡터 사이드카 파일 basename(specs/023 FR-1). files가 비면 생략. */
  vectorFile?: string;
  /** 라벨 → 정규화된 원본 폴더 경로(specs/024 FR-1). 선택 필드(additive — 버전 불변,
   *  구버전 코드는 무시). 라벨 재사용(재바인딩)과 폴더 내 파일 삭제를 구분하는 근거. */
  bindings?: Record<string, string>;
  files: Record<string, FileEntry>;
}

// ── specs/023 — 벡터 바이너리 사이드카 ──────────────────────────────────────
// 디스크 인코딩: JSON은 slot 참조만, 벡터는 <indexBasename>.vec-<gen>에
// [16B 헤더(magic "LMV1" | dims u32LE | count u32LE | reserved) + Float32LE 연속]으로.
// JSON rename만이 커밋점(FR-2) — 사이드카는 커밋 전 durable, GC는 직전 세대 유예(keep=2).

const SIDECAR_HEADER = 16;
let sidecarGenCounter = 0;

function sidecarAbs(basename: string): string {
  return path.join(path.dirname(INDEX_PATH), basename);
}

function buildSidecar(vectors: number[][], dims: number): Buffer {
  const buf = Buffer.alloc(SIDECAR_HEADER + vectors.length * dims * 4);
  buf.write("LMV1", 0, "ascii");
  buf.writeUInt32LE(dims, 4);
  buf.writeUInt32LE(vectors.length, 8);
  for (let i = 0; i < vectors.length; i++)
    for (let j = 0; j < dims; j++) buf.writeFloatLE(vectors[i][j], SIDECAR_HEADER + (i * dims + j) * 4);
  return buf;
}

type Sidecar = { dims: number; count: number; body: Buffer };

function readSidecarFile(abs: string): Sidecar | null {
  try {
    const buf = fs.readFileSync(abs);
    if (buf.length < SIDECAR_HEADER || buf.toString("ascii", 0, 4) !== "LMV1") return null;
    const dims = buf.readUInt32LE(4);
    const count = buf.readUInt32LE(8);
    if (dims === 0 || buf.length !== SIDECAR_HEADER + count * dims * 4) return null; // 부분 손상(truncate 포함)
    return { dims, count, body: buf.subarray(SIDECAR_HEADER) };
  } catch {
    return null; // 부재·권한 — 호출부가 재시도/자가치유 판단(FR-3)
  }
}

/** 디스크 JSON(slot 참조)을 사이드카로 하이드레이션해 인메모리(벡터 보유)로 만든다.
 *  해석 불가한 파일 항목은 제거(자가 치유 — 다음 스캔에서 재임베딩). 반환: 제거 수. */
function hydrateV5(idx: BrainIndex, sc: Sidecar | null): number {
  let healed = 0;
  for (const [key, fe] of Object.entries(idx.files)) {
    if (fe.chunks.length === 0) continue; // 빈 파일 — 벡터 불필요
    const chunks: IndexedChunk[] = [];
    let ok = sc !== null;
    if (sc) {
      for (const c of fe.chunks as unknown as DiskChunk[]) {
        if (typeof c.slot !== "number" || c.slot < 0 || c.slot >= sc.count) {
          ok = false;
          break;
        }
        const vector = new Array<number>(sc.dims);
        for (let j = 0; j < sc.dims; j++) vector[j] = sc.body.readFloatLE((c.slot * sc.dims + j) * 4);
        chunks.push({ path: c.path, text: c.text, vector });
      }
    }
    if (!ok) {
      delete idx.files[key];
      healed++;
    } else {
      fe.chunks = chunks;
    }
  }
  return healed;
}

function scUsable(sc: Sidecar | null, dims: number | undefined): sc is Sidecar {
  return sc !== null && (dims === undefined || sc.dims === dims);
}

/** 오래된 generation 사이드카 GC — 참조 중(방금 커밋) + mtime 최신 1개는 유예(keep=2,
 *  FR-2: 락 없는 reader가 옛 gen 참조를 쥔 채 지워지는 경합 흡수). 실패는 무해(다음 저장 정리). */
function gcSidecars(keepBasename: string | null): void {
  try {
    const dir = path.dirname(INDEX_PATH);
    const prefix = `${path.basename(INDEX_PATH)}.vec-`;
    const others = fs
      .readdirSync(dir)
      .filter((n) => n.startsWith(prefix) && !n.includes(".tmp-") && n !== keepBasename)
      .map((n) => {
        let m = 0;
        try {
          m = fs.statSync(path.join(dir, n)).mtimeMs;
        } catch {
          /* 사라짐 — 정리 대상 아님 */
        }
        return { n, m };
      })
      .sort((a, b) => b.m - a.m);
    for (const o of others.slice(1)) fs.rmSync(path.join(dir, o.n), { force: true });
  } catch {
    /* GC 실패는 무해 */
  }
}

// v4 → v5 무재임베딩 마이그레이션 플래그(FR-4) — 다음 저장(재색인의 dirty 판정 포함)이 영속화.
let migrationPending = false;
let migrateNotified = false;
function notifyMigrateOnce(): void {
  if (migrateNotified) return;
  migrateNotified = true;
  process.stderr.write("[localmind-brain] 색인을 새 형식(v5 — 벡터 분리 저장)으로 전환합니다. 다시 색인할 필요는 없어요.\n");
}
let sidecarHealNotified = false;
function notifySidecarHealOnce(n: number): void {
  if (sidecarHealNotified) return;
  sidecarHealNotified = true;
  process.stderr.write(`[localmind-brain] 색인의 벡터 파일이 없거나 손상돼 ${n}개 파일을 다시 색인합니다(자가 치유).\n`);
}

// 테스트 전용(specs/023 AC-3b) — loadIndex의 "JSON 파싱 후 ↔ 사이드카 읽기 전" 경계 훅.
let afterJsonParseHook: (() => void) | null = null;
export function _setAfterJsonParseHookForTest(fn: (() => void) | null): void {
  afterJsonParseHook = fn;
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
  saveRunCount = 0;
}

/** 테스트 전용: doEnsureIndexed가 실제로 실행된 횟수. */
export function _indexRunCountForTest(): number {
  return indexRunCount;
}

// 테스트 계측: saveIndex 실행 횟수(specs/021 진행 저장 스로틀 검증용).
let saveRunCount = 0;

/** 테스트 전용: saveIndex가 실행된 횟수. */
export function _saveRunCountForTest(): number {
  return saveRunCount;
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
    let idx = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as BrainIndex;
    if (idx.files && (idx.version === INDEX_VERSION || idx.version === 4)) {
      // 임베딩 모델이 바뀐 인덱스는 벡터가 호환되지 않는다 — 전체 재색인(013 FR-5).
      if (idx.embeddingModel !== undefined && idx.embeddingModel !== EMB_MODEL) {
        notifyReindexOnce(`임베딩 모델이 바뀌어(${idx.embeddingModel} → ${EMB_MODEL})`);
      } else if (idx.version === 4) {
        // specs/023 FR-4 — v4(인라인 벡터) 무재임베딩 마이그레이션: 벡터를 그대로 재사용해
        // v5 인메모리로 전환하고, 다음 저장이 v5(JSON slot + 사이드카)로 영속화한다.
        let broken = 0;
        let expectDims = idx.dims; // stamp-less v4는 첫 유효 벡터 길이로 통일(불균일 → 자가 치유)
        for (const [key, fe] of Object.entries(idx.files)) {
          const valid = fe.chunks.every((c) => {
            const v = (c as IndexedChunk).vector;
            // 유한 숫자 + dims 일치(전 청크 균일)까지 검증 — 손상 v4 벡터가 사이드카에
            // NaN Float32로 영속되지 않게(교차 리뷰 지적). 불합격은 재임베딩 자가 치유.
            if (!Array.isArray(v) || v.length === 0 || !v.every((x) => Number.isFinite(x))) return false;
            if (expectDims === undefined) expectDims = v.length;
            return v.length === expectDims;
          });
          if (!valid) {
            delete idx.files[key];
            broken++;
          }
        }
        if (idx.dims === undefined) idx.dims = expectDims; // dims 스탬프 영속(리뷰 경미-1)
        idx.version = INDEX_VERSION;
        migrationPending = true;
        notifyMigrateOnce();
        if (broken > 0) notifySidecarHealOnce(broken);
        cachedIndex = idx;
        cachedStat = { mtimeMs: stat.mtimeMs, size: stat.size };
        setLoadStat(idx, cachedStat);
        return idx;
      } else {
        // v5 — 사이드카 하이드레이션. 부재·불일치면 JSON 1회 재파싱(FR-3): vectorFile이
        // 새 generation으로 전진했으면 동시 저장의 양성 경합이므로 그것을 읽는다(자가 치유 아님).
        afterJsonParseHook?.();
        let sc = idx.vectorFile ? readSidecarFile(sidecarAbs(idx.vectorFile)) : null;
        if (idx.vectorFile && !scUsable(sc, idx.dims)) {
          try {
            const again = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as BrainIndex;
            if (again.version === INDEX_VERSION && again.files && again.vectorFile && again.vectorFile !== idx.vectorFile) {
              idx = again;
              sc = readSidecarFile(sidecarAbs(again.vectorFile));
              stat = fs.statSync(INDEX_PATH); // 캐시 기준을 재파싱본에 맞춘다
            }
          } catch {
            /* 재파싱 실패 — 아래 자가 치유로 */
          }
        }
        const healed = hydrateV5(idx, scUsable(sc, idx.dims) ? sc : null);
        if (healed > 0) notifySidecarHealOnce(healed);
        cachedIndex = idx;
        cachedStat = { mtimeMs: stat.mtimeMs, size: stat.size };
        setLoadStat(idx, cachedStat);
        return idx;
      }
    } else if (typeof idx?.version === "number") {
      // 스키마 버전 업그레이드(예: 013의 청크 분할·메타 도입) — 조용히 수 분 재색인하지
      // 않도록 사유를 안내한다(FR-4, self-review 결함 2). v5 코드가 미래 버전·구버전
      // 코드가 v5를 만나는 롤백도 이 경로(전량 재빌드 자가 치유, specs/023 FR-5).
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
  // specs/024 FR-4 — bindings 병합: 내 기록 우선, 없는 라벨만 디스크에서 채움(??=).
  for (const [label, dir] of Object.entries(disk.bindings ?? {})) {
    ours.bindings ??= {};
    ours.bindings[label] ??= dir;
  }
}

/** 내부·테스트용: 인덱스 파일을 원자적으로 저장한다(락 + reload-merge + 캐시 갱신). */
export function saveIndex(idx: BrainIndex): void {
  saveRunCount++;
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
        // 디스크가 v5면 그 사이드카로 하이드레이션해 병합한다(specs/023 — 병합 채택 항목도
        // 인메모리 형태(벡터 보유)여야 재직렬화가 성립). 해석 불가 항목은 병합에서 제외
        // (재임베딩 자가 치유). v4 등 다른 버전은 아래 가드가 병합을 건너뛴다.
        const disk = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as BrainIndex;
        if (disk.version === INDEX_VERSION && disk.files) {
          const dsc = disk.vectorFile ? readSidecarFile(sidecarAbs(disk.vectorFile)) : null;
          hydrateV5(disk, scUsable(dsc, disk.dims) ? dsc : null);
        }
        // 버전·임베딩 모델이 다른 인덱스(마이그레이션·모델 교체 중)는 병합하지 않는다 —
        // 낡은 벡터를 되살리면 차원 불일치가 재발한다.
        if (disk.version === idx.version && disk.files && disk.embeddingModel === idx.embeddingModel) {
          mergeIndexFromDisk(idx, disk);
        }
      }
    } catch {
      /* 디스크에 없음/손상 — 그대로 저장 */
    }

    // specs/023 FR-1·2 — 디스크 인코딩: 벡터를 사이드카로 분리(JSON은 slot 참조만).
    // 순서가 원자성의 핵심: (1) 사이드카를 temp+rename으로 durable화(아직 미참조),
    // (2) 그 사이드카를 가리키는 JSON을 temp+rename — 이 rename이 단일 커밋점,
    // (3) 커밋 후 오래된 세대 GC(직전 1개 유예). 어느 시점에 중단돼도 디스크 JSON은
    // 항상 존재하는 사이드카를 가리킨다.
    const vectors: number[][] = [];
    const filesOut: Record<string, unknown> = {};
    for (const [key, fe] of Object.entries(idx.files)) {
      filesOut[key] = {
        ...fe,
        chunks: fe.chunks.map((c): DiskChunk => {
          vectors.push(c.vector);
          return { path: c.path, text: c.text, slot: vectors.length - 1 };
        }),
      };
    }
    let vectorFile: string | undefined;
    if (vectors.length > 0) {
      idx.dims ??= vectors[0].length; // 사이드카 헤더와 JSON dims 스탬프 일치(리뷰 경미-1)
      const gen = `${Date.now().toString(36)}-${process.pid}-${sidecarGenCounter++}`;
      vectorFile = `${path.basename(INDEX_PATH)}.vec-${gen}`;
      const scTmp = `${sidecarAbs(vectorFile)}.tmp-${process.pid}`;
      fs.writeFileSync(scTmp, buildSidecar(vectors, idx.dims));
      fs.renameSync(scTmp, sidecarAbs(vectorFile));
    }
    // temp 이름에 pid를 붙여, 락 경합의 극단(동시 stale 강제 해제)에서도 서로의 temp를
    // 밟지 않는다(021 self-review 결함 5 관례).
    // 직렬화는 {...idx} 스프레드 — 화이트리스트로 최상위 필드를 나열하면 미래 additive
    // 필드(예: 024 bindings)가 저장에서 조용히 탈락한다(리뷰 경미-2). LOAD_STAT은
    // Symbol 키라 JSON.stringify가 자동 제외.
    const tmp = `${INDEX_PATH}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify({ ...idx, vectorFile, files: filesOut }));
    fs.renameSync(tmp, INDEX_PATH); // 단일 커밋점
    idx.vectorFile = vectorFile; // 인메모리 객체도 최신 참조 유지(캐시 정합)
    gcSidecars(vectorFile ?? null);
    migrationPending = false; // v4→v5 전환분이 영속됨(specs/023 FR-4)
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
    gcSidecars(null); // 빈 색인 — 잔존 사이드카 정리(직전 1개 유예, specs/023)
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

// specs/019 AC-10 테스트를 위해 export.
// rootEntries — 호출자가 이미 readdir한 결과(specs/020 FR-2: 대상/부재 판정과 스캔이
// 같은 결과를 쓰도록). 하위 디렉토리의 readdir 실패는 여전히 조용히 건너뛴다(020 알려진 한계).
export function listMarkdown(dir: string, isRoot = true, rootEntries?: fs.Dirent[]): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  if (rootEntries) {
    entries = rootEntries;
  } else {
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return out;
    }
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue; // 숨김 파일/디렉토리 제외(인덱스 포함)
    // 백업 덤프(make backup)는 노트 폴더 '루트'의 memory.md로 떨어진다 — 루트만 제외하고
    // 하위 폴더의 memory.md 노트는 정상 색인한다.
    if (isRoot && e.name === "memory.md") continue;
    const full = path.join(dir, e.name);
    // 페르소나 레지스트리(agents/)·스킬 정본(skills/)은 노트가 아니다 —
    // 색인·검색에서 제외(specs/016 FR-10 · specs/018 FR-8)
    if (e.isDirectory() && (path.resolve(full) === agentsDir() || path.resolve(full) === skillsDir())) continue;
    // 백업 미러(specs/019 FR-1)도 노트가 아니다 — 색인 프로세스는 BACKUP_DIR를 모르므로
    // 미러 폴더가 스스로를 식별하는 마커로 제외한다(AC-10, 016 FR-10 불변식 유지).
    if (e.isDirectory() && fs.existsSync(path.join(full, ".localmind-mirror"))) continue;
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

/** specs/020 — 명시적 재색인 경로에 돌려줄 요약(고아·부재·보류·탈출구 처리 내역).
 *  반환형 변경 없이 모듈 레벨로만 올린다 — ensureIndexed의 기존 호출자(검색·캡처·링크)로
 *  파급 없음. 출력은 scripts/reindex.ts만 한다(brain stdout 금지, MCP 경로 침묵 — FR-4). */
export interface ReindexSummary {
  fallback: boolean;
  missing: { label: string; dir: string }[];
  orphans: { label: string; files: number }[];
  pruned: { label: string; files: number }[];
  pruneIgnored: string[];
  pruneUnknown: string[];
  /** specs/024 — 재바인딩 감지(보존 중): 라벨·기록 경로·현재 경로·보존 건수. */
  rebinds: { label: string; recordedPath: string; currentPath: string; preserved: number }[];
  /** specs/024 FR-3 — 수락 처리 결과: 제거 건수. */
  rebindAdopted: { label: string; removed: number }[];
  /** 수락 지정됐지만 폴더를 열 수 없어 보류(미마운트 가드). */
  adoptDeferred: string[];
  /** 수락 지정됐지만 재바인딩 상태가 아님(미지 라벨 포함) — 무시 사유 안내. */
  adoptIgnored: string[];
}
let lastReindexSummary: ReindexSummary | null = null;

async function doEnsureIndexed(): Promise<BrainIndex> {
  indexRunCount++; // 테스트 계측(single-flight 검증)
  const idx = loadIndex();
  idx.embeddingModel = EMB_MODEL; // 인덱스가 자기 임베딩 모델을 안다(013 FR-5)
  const seen = new Set<string>();

  // specs/020 FR-2 — 대상/부재 판정은 readdir 성공 여부(존재 검사만으로는 권한 거부를
  // 못 거른다). 판정에 성공한 그 결과(rootEntries)로 스캔해 판정과 스캔이 갈라지지 않게 한다.
  // 주의: 여기서 ensureDirs()(전체 폴더 mkdir -p)를 부르면 부재 폴더(미마운트·클론 전)가
  // 빈 폴더로 되살아나 "존재하는 빈 폴더"로 오판 → 그 라벨이 전량 프루닝된다. 재색인
  // 경로에서는 일괄 생성하지 않고, 지킬 색인 키가 없는 라벨(첫 실행)만 부트스트랩 생성한다.
  const scanned = new Set<string>();
  const missing: { label: string; dir: string }[] = [];
  const readDirOrNull = (dir: string): fs.Dirent[] | null => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
  };

  const pending: { key: string; folder: string; hash: string; chunks: string[]; linksOut: string[] }[] = [];
  for (const f of FOLDERS) {
    let rootEntries = readDirOrNull(f.dir);
    if (rootEntries === null && !Object.values(idx.files).some((fe) => fe.folder === f.label)) {
      // 첫 실행 부트스트랩(기존 ensureDirs 동작 보존) — 보존할 색인이 없을 때만 생성
      try {
        fs.mkdirSync(f.dir, { recursive: true });
      } catch {
        /* 생성 불가 → 아래 missing 처리 */
      }
      rootEntries = readDirOrNull(f.dir);
    }
    if (rootEntries === null) {
      missing.push({ label: f.label, dir: f.dir });
      continue; // 부재 라벨 — 스캔도 프루닝도 하지 않는다(보존)
    }
    scanned.add(f.label);
    for (const full of listMarkdown(f.dir, true, rootEntries)) {
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

    // specs/021 FR-1 — 진행 저장 간격(초). 잘못된 값(NaN 등)은 기본 10으로.
    const rawInterval = Number(process.env.BRAIN_SAVE_INTERVAL ?? 10);
    const SAVE_INTERVAL_MS = Math.max(0, Number.isFinite(rawInterval) ? rawInterval : 10) * 1000;
    let lastSaveAt = Date.now();

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
        // specs/021 FR-1 — 진행 저장 시간 스로틀: 저장은 색인 전량 직렬화라 비용이 색인
        // 크기에 비례한다(대량 색인에서 O(n²) 쓰기 병목, 실측 66분). 배치마다가 아니라
        // 마지막 저장 후 BRAIN_SAVE_INTERVAL초(기본 10, 0=매 배치) 경과 시에만 저장한다.
        // lastSaveAt은 워커 간 공유지만 saveIndex가 락으로 직렬화되고 내용이 같은 idx라
        // 경합은 "저장이 조금 더/덜" 수준 — 정합성 무관.
        if (SAVE_INTERVAL_MS === 0 || Date.now() - lastSaveAt >= SAVE_INTERVAL_MS) {
          saveIndex(idx); // 완료된 파일만 반영해 진행 저장
          lastSaveAt = Date.now();
        }
      }
    }
    // NUM_PARALLEL=1 ollama에선 동시 요청이 큐 적체로 행을 유발할 수 있어 기본 2.
    const conc = Math.max(1, Number(process.env.BRAIN_CONCURRENCY ?? 2));
    let completed = false;
    try {
      await Promise.all(Array.from({ length: Math.min(conc, batches.length) }, () => worker()));
      completed = true;
    } finally {
      // specs/021 FR-2 — 오류 경로 전용: 임베딩 실패로 중단돼도 그때까지 커밋 완료된
      // 파일 전량을 저장한다(유실 상한이 스로틀로 나빠지지 않게). 성공 경로에서는
      // 저장하지 않는다 — 말미(프루닝 후) 저장이 전량 기록하므로 여기서도 저장하면
      // 성공할 때마다 색인 전량 쓰기가 1회 낭비된다.
      if (!completed) saveIndex(idx);
    }
  }

  // specs/020 — 프루닝 가드: "스캔 안 됨"은 "삭제됨"이 아니다. 삭제 반영은 실제로 읽은
  // (대상) 라벨 안에서만 하고(FR-1), 후퇴 재색인은 전면 보류한다(FR-3 — 폴백 라벨이
  // 등록 라벨과 우연히 같으면 라벨 스코프 가드가 뚫리므로 라벨 단위가 아니라 전면 보류).
  // 라벨 판정은 FileEntry.folder 정본 — 라벨에 '/'가 허용되어 키 문자열 파싱은 금지.
  const summary: ReindexSummary = {
    fallback: REINDEX_FALLBACK,
    missing,
    orphans: [],
    pruned: [],
    pruneIgnored: [],
    pruneUnknown: [],
    rebinds: [],
    rebindAdopted: [],
    adoptDeferred: [],
    adoptIgnored: [],
  };
  let deletedCount = 0; // specs/022 FR-1 — 이번 실행의 삭제 반영 수(dirty 판정 재료)
  let bindingsChanged = false; // specs/024 — 바인딩 기록·갱신은 dirty(색인 데이터 변경)
  const rebindPreserve = new Set<string>(); // 재바인딩 감지·미수락 라벨 — 프루닝 보존(FR-2)
  const rebindAdopt = new Set<string>(); // 수락된 라벨 — seen 아님 항목 제거(FR-3)
  if (!REINDEX_FALLBACK) {
    // specs/024 FR-1~3 — 라벨↔경로 바인딩. 후퇴 중에는 기록·판정·수락 전부 보류
    // (FOLDERS가 폴백 경로라 기록하면 다음 정상 재색인이 거짓 재바인딩으로 오판).
    const adoptReq = new Set(
      (process.env.REINDEX_ADOPT_REBIND ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    for (const f of FOLDERS) {
      if (!scanned.has(f.label)) continue; // 부재 라벨 — 기존 바인딩 보존(덮어쓰기 금지)
      let current: string;
      try {
        current = fs.realpathSync(f.dir); // 심링크 해소(셸 canon_path의 pwd -P와 동일 규칙)
      } catch {
        current = f.dir; // parseFolders가 이미 resolve+expandHome 적용한 lexical 값
      }
      const recorded = idx.bindings?.[f.label];
      if (recorded !== undefined && recorded !== current) {
        // 재바인딩 — 기본은 보존(파괴 금지). 수락은 scanned 성공 라벨에서만(여기 도달 자체가
        // readdir 성공)이며 명시 지정 시에만.
        if (adoptReq.has(f.label)) {
          rebindAdopt.add(f.label);
          adoptReq.delete(f.label);
          (idx.bindings ??= {})[f.label] = current;
          bindingsChanged = true;
        } else {
          rebindPreserve.add(f.label);
          summary.rebinds.push({ label: f.label, recordedPath: recorded, currentPath: current, preserved: 0 });
          // 보존 중엔 기록도 미갱신 — 수락 전까지 재바인딩 안내가 반복돼야 한다.
        }
      } else {
        if (recorded !== current) bindingsChanged = true; // 첫 기록
        (idx.bindings ??= {})[f.label] = current;
        if (adoptReq.has(f.label)) {
          adoptReq.delete(f.label);
          summary.adoptIgnored.push(f.label); // 재바인딩 상태가 아님 — 수락할 것 없음
        }
      }
    }
    // 남은 수락 지정: 부재(미마운트) 라벨은 보류, 등록에 없는 라벨은 무시 사유 안내.
    for (const l of adoptReq) {
      if (missing.some((m) => m.label === l)) summary.adoptDeferred.push(l);
      else summary.adoptIgnored.push(l);
    }
    const registered = new Set(FOLDERS.map((f) => f.label));
    const indexLabels = new Set(Object.values(idx.files).map((fe) => fe.folder));
    const pruneReq = (process.env.REINDEX_PRUNE_LABELS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const pruneSet = new Set<string>();
    for (const l of pruneReq) {
      if (registered.has(l)) summary.pruneIgnored.push(l); // 대상·부재 라벨은 탈출구로 못 지운다(AC-8)
      else if (!indexLabels.has(l)) summary.pruneUnknown.push(l); // 오타를 조용히 성공 처리하지 않는다(AC-9)
      else pruneSet.add(l);
    }
    const prunedCount = new Map<string, number>();
    for (const [key, fe] of Object.entries(idx.files)) {
      if (!fe.folder) {
        // 손상·수기 편집으로만 생기는 folder 없는 엔트리 — 라벨 판정이 불가능하므로
        // 기존 프루닝의 자가 치유를 유지한다(스캔 미매칭이면 삭제, 요약·안내에서 제외).
        if (!seen.has(key)) {
          delete idx.files[key];
          deletedCount++;
        }
        continue;
      }
      if (scanned.has(fe.folder) && !seen.has(key)) {
        if (rebindPreserve.has(fe.folder)) {
          // specs/024 FR-2 — 재바인딩 보존: "seen 아님"은 폴더 내 삭제가 아니라
          // 옛 경로에만 있던 항목이다. 프루닝하지 않고 건수만 집계(안내용).
          const rb = summary.rebinds.find((r) => r.label === fe.folder);
          if (rb) rb.preserved++;
          continue;
        }
        delete idx.files[key]; // 대상 라벨 내 삭제 반영(020 FR-1 — 수락 라벨의 옛 항목 포함)
        deletedCount++;
        if (rebindAdopt.has(fe.folder)) {
          const ra = summary.rebindAdopted.find((r) => r.label === fe.folder);
          if (ra) ra.removed++;
          else summary.rebindAdopted.push({ label: fe.folder, removed: 1 });
        }
      } else if (pruneSet.has(fe.folder)) {
        delete idx.files[key]; // 명시적 고아 정리(FR-5)
        deletedCount++;
        prunedCount.set(fe.folder, (prunedCount.get(fe.folder) ?? 0) + 1);
      }
    }
    summary.pruned = [...prunedCount].map(([label, files]) => ({ label, files }));
    for (const l of rebindAdopt)
      if (!summary.rebindAdopted.some((r) => r.label === l)) summary.rebindAdopted.push({ label: l, removed: 0 });
    const orphanCount = new Map<string, number>();
    for (const fe of Object.values(idx.files))
      if (fe.folder && !registered.has(fe.folder)) orphanCount.set(fe.folder, (orphanCount.get(fe.folder) ?? 0) + 1);
    summary.orphans = [...orphanCount].map(([label, files]) => ({ label, files }));
  }
  lastReindexSummary = summary; // 요약은 저장 생략과 무관하게 항상 최신(020 반환 계약 유지)

  // specs/022 FR-1 — 무변경(clean)이면 말미 저장을 생략한다: ensureIndexed는 검색·캡처마다
  // 도는 경로라, 무변경 실행이 매번 색인 전량(실측 113MB)을 재기록하는 낭비를 없앤다.
  // dirty 기준은 idx.files의 추가·삭제 사실뿐 — pending>0(커밋 발생, 021 진행 저장이
  // 스로틀로 놓친 최종 커밋 포함) 또는 삭제 1건 이상. embeddingModel/dims 스탬프-only
  // 변화는 세지 않는다(FR-2 — dims는 pending에 종속, 무-op 재세팅은 저장 트리거 아님).
  // 색인 파일이 아직 없으면(첫 실행) 저장한다 — 파일 생성 자체가 변경이고, 013 AC-8
  // (빈 vault 재색인도 모델 스탬프를 기록)의 기존 계약을 유지한다. v4→v5 마이그레이션
  // (specs/023 FR-4)도 디스크 포맷 변경이므로 dirty다(스탬프-only와 다름).
  // 사이드카 유실 수복(specs/023 — codex 교차 리뷰 차단 결함): 캐시를 쥔 장수 프로세스는
  // 사이드카가 지워져도 loadIndex가 캐시를 반환해 자가 치유를 못 본다 — 여기서 참조
  // 사이드카의 존재를 확인하고, 없으면 저장으로 수복한다(메모리에 벡터가 있으므로
  // 재임베딩 0건 — 다음 프로세스의 전량 재임베딩을 막는다).
  const sidecarMissing = (() => {
    if (idx.vectorFile === undefined) return false;
    try {
      const st = fs.statSync(sidecarAbs(idx.vectorFile));
      if (idx.dims === undefined) return false;
      // O(1) 크기 대조 — truncate 부분 손상도 in-place 수복(전량 읽기 없이, 리뷰 잔여 HOLE-D).
      // clean 실행에서 인메모리 files == 디스크 files이므로 기대 크기 산식이 성립한다
      // (변경이 있었다면 pending·deleted로 이미 dirty).
      let chunks = 0;
      for (const fe of Object.values(idx.files)) chunks += fe.chunks.length;
      return st.size !== SIDECAR_HEADER + chunks * idx.dims * 4;
    } catch {
      return true; // 부재
    }
  })();
  const dirty =
    pending.length > 0 ||
    deletedCount > 0 ||
    bindingsChanged || // specs/024 — 바인딩 첫 기록·수락 갱신은 색인 데이터 변경(스탬프-only와 다름)
    migrationPending ||
    sidecarMissing ||
    !fs.existsSync(INDEX_PATH);
  if (dirty) saveIndex(idx);
  return idx;
}

export interface NoteHit {
  path: string;
  text: string;
  score: number;
}

/** 노트 의미검색. folder(라벨)를 주면 그 폴더로 한정. */
export async function searchNotes(query: string, limit = 5, folder?: string): Promise<NoteHit[]> {
  let out: NoteHit[];
  try {
    out = await searchNotesInternal(query, limit, folder);
  } catch (e) {
    // specs/041 FR-004 — 예외 경로도 정확히 1행 기록하고 원래 예외를 그대로 다시 던진다
    // (삼키지 않음). 로깅 실패는 검색 예외를 가리거나 바꾸지 않는다(logQuery는 throw 안 함).
    logQuery({
      ts: new Date().toISOString(),
      tool: "search_notes",
      query,
      hitCount: 0,
      success: false,
      folder: folder ?? null,
      topScore: null,
      sources: [],
      outcome: "error",
      relevanceJudgment: "not_judged",
      retrievalAlgorithm: RETRIEVAL_ALGORITHM,
      embeddingModel: EMB_MODEL,
      topScores: [],
      uniqueSourceCount: 0,
    });
    throw e;
  }
  // specs/041 — 결과 반환 관측(관련성 아님). topScores는 순위 1~3의 유한 원점수(최대 3),
  // uniqueSourceCount는 반환 hit의 canonical source(운영 노트는 path가 곧 원본 문서) 수.
  // 결과가 있으면 topScore === topScores[0](rank-1 코사인은 유한).
  const topScores = out.slice(0, 3).map((h) => h.score).filter((s) => Number.isFinite(s));
  logQuery({
    ts: new Date().toISOString(),
    tool: "search_notes",
    query,
    hitCount: out.length,
    success: out.length > 0,
    folder: folder ?? null,
    // specs/025 — 이미 계산된 값의 재사용(소프트 실패 관측): out은 스코어 내림차순.
    topScore: out[0]?.score ?? null,
    sources: [...new Set(out.map((h) => h.path))],
    outcome: out.length > 0 ? "results_returned" : "no_results",
    relevanceJudgment: "not_judged",
    retrievalAlgorithm: RETRIEVAL_ALGORITHM,
    embeddingModel: EMB_MODEL,
    topScores,
    uniqueSourceCount: new Set(out.map((h) => h.path)).size,
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

// ── specs/041 — 검색 품질 평가 전용 internal compatibility surface ─────────────────
// 041만의 최소 확장. Retriever/QueryEventWriter/IndexStore 같은 새 domain 추출이나 상태
// 소유권 이동은 하지 않는다(그 분해는 042). 아래 projection은 값을 소유하지 않고 현재
// owner(상수·적재된 index)에서 조립한다.

export type QueryEventDrainResult = Readonly<{
  attempted: number;
  succeeded: number;
  failed: number;
}>;

export type RetrievalRuntimeSnapshot = Readonly<{
  retrievalAlgorithm: typeof RETRIEVAL_ALGORITHM;
  embeddingModel: string;
  embeddingImplementation: typeof EMBEDDING_IMPLEMENTATION;
  indexFormatVersion: number;
  embeddingDimensions: number;
  chunkSize: number;
  retrievalLimit: 5;
}>;

export type RetrievalEvaluationPort = Readonly<{
  prepareDeterministicIndex(orderedFixturePaths: readonly string[]): Promise<void>;
  searchNotes(query: string, limit?: number, folder?: string): Promise<NoteHit[]>;
  drainQueryEvents(): Promise<QueryEventDrainResult>;
  readRuntimeSnapshot(retrievalLimit: 5): Promise<RetrievalRuntimeSnapshot>;
}>;

/** specs/041 — 정렬된 fixture path만 serial로 임시 색인에 넣는다(generic scanner/concurrency
 *  없음). 기존 chunkText·production embed·v5 save/reload를 그대로 재사용해 production 색인
 *  구축과 같은 파이프라인을 쓰되 순서만 결정적으로 고정한다. 저장 후 인메모리 캐시를 비워
 *  다음 loadIndex가 디스크(사이드카)에서 reload하게 한다. */
async function prepareDeterministicIndex(orderedFixturePaths: readonly string[]): Promise<void> {
  const f = FOLDERS[0];
  const idx: BrainIndex = { version: INDEX_VERSION, embeddingModel: EMB_MODEL, files: {} };
  for (const full of orderedFixturePaths) {
    const text = fs.readFileSync(full, "utf8");
    const key = `${f.label}/${path.relative(f.dir, full)}`;
    const chunks = chunkText(text);
    const vectors = chunks.length ? await embed(chunks) : [];
    if (idx.dims === undefined && vectors.length) idx.dims = vectors[0].length;
    idx.files[key] = {
      hash: sha(text),
      folder: f.label,
      chunks: chunks.map((c, i) => ({ path: key, text: c, vector: vectors[i] })),
      linksOut: extractLinks(text),
    };
  }
  resetIndex(); // 임시 디렉터리를 clean 상태로(병합 잔재 방지)
  saveIndex(idx); // v5 영속화(사이드카 slot 순서 = 위 chunk 삽입 순서)
  cachedIndex = null; // 다음 loadIndex가 디스크에서 reload + 사이드카 hydrate 하도록 캐시 무효화
  cachedStat = null;
}

/** specs/041 — 값을 소유하지 않는 immutable projection. 현재 owner(EMB_MODEL·상수 식별자·
 *  적재된 index version/dims·MAX_CHUNK)에서 읽어 caller의 retrieval limit와 합친다. */
async function readRuntimeSnapshot(retrievalLimit: 5): Promise<RetrievalRuntimeSnapshot> {
  const idx = loadIndex();
  return {
    retrievalAlgorithm: RETRIEVAL_ALGORITHM,
    embeddingModel: EMB_MODEL,
    embeddingImplementation: EMBEDDING_IMPLEMENTATION,
    indexFormatVersion: idx.version,
    embeddingDimensions: idx.dims ?? 0,
    chunkSize: MAX_CHUNK,
    retrievalLimit,
  };
}

/** specs/041 — 평가 runner가 temp env 설정 뒤 dynamic import하는 유일 surface.
 *  production 호출자는 drainQueryEvents를 부르지 않는다. */
export const retrievalEvaluationPort: RetrievalEvaluationPort = {
  prepareDeterministicIndex,
  searchNotes,
  drainQueryEvents,
  readRuntimeSnapshot,
};

export interface CaptureResult {
  path: string;
  validationStatus: "confirmed" | "unconfirmed" | "skipped";
  retried: boolean;
  /** specs/017 — 큐레이터가 부여한 태그(태깅 미수행·실패 시 없음). */
  tags?: string[];
}

// ── specs/017 — 큐레이터 태깅 ───────────────────────────────────────────────

/** 기존 태그 어휘 수집 — 최근 수정 노트(상한 200개)의 frontmatter tags를 빈도순으로.
 *  매 capture 전수 스캔을 피하기 위해 프로세스 내 TTL 캐시(5분)를 둔다(plan). */
let tagVocabCache: { at: number; vocab: string[] } | null = null;
const TAG_VOCAB_TTL_MS = 5 * 60_000;

export function collectTagVocab(): string[] {
  if (tagVocabCache && Date.now() - tagVocabCache.at < TAG_VOCAB_TTL_MS) return tagVocabCache.vocab;
  const freq = new Map<string, number>();
  try {
    const files: { path: string; mtime: number }[] = [];
    for (const f of FOLDERS) {
      for (const p of listMarkdown(f.dir)) {
        try {
          files.push({ path: p, mtime: fs.statSync(p).mtimeMs });
        } catch {
          /* 사라진 파일 — 건너뜀 */
        }
      }
    }
    files.sort((a, b) => b.mtime - a.mtime);
    for (const { path: p } of files.slice(0, 200)) {
      try {
        const head = fs.readFileSync(p, "utf8").slice(0, 2000);
        const m = head.match(/^tags:\s*\[([^\]]*)\]/m);
        if (!m) continue;
        for (const raw of m[1].split(",")) {
          const tag = raw.trim().replace(/^["']|["']$/g, "");
          if (tag) freq.set(tag, (freq.get(tag) ?? 0) + 1);
        }
      } catch {
        /* 읽기 실패 — 건너뜀 */
      }
    }
  } catch {
    /* 수집 실패 — 빈 어휘로 진행(FR-5) */
  }
  const vocab = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50).map(([t]) => t);
  tagVocabCache = { at: Date.now(), vocab };
  return vocab;
}

/** 테스트용 — 캐시 초기화. */
export function _resetTagVocabCacheForTest(): void {
  tagVocabCache = null;
}

/** 큐레이터에게 태그를 제안받는다. 실패·해석 불가는 null(태그 없이 캡처 진행, FR-5). */
async function suggestTags(text: string, title?: string): Promise<string[] | null> {
  const curator = resolvePersona("curator");
  if (!curator) return null; // 미구성 — 무음(FR-1)
  const vocab = collectTagVocab();
  const vocabLine = vocab.length
    ? `기존 태그 어휘(재사용 우선): ${vocab.join(", ")}`
    : "기존 태그 어휘 없음 — 새 태그는 보수적으로 최대 2개만.";
  const timeoutMs = Math.max(1000, Number(process.env.BRAIN_TAG_TIMEOUT_MS ?? 30_000));
  const res = await personaChat(curator, {
    user: `${vocabLine}\n\n제목: ${title ?? "(없음)"}\n본문:\n${text.slice(0, 2000)}`,
    systemPrefix:
      "역할 제한: 지금은 노트 태깅만 한다. 위 노트에 어울리는 태그 1~3개를 고르되 기존 어휘를 " +
      '우선 재사용하라. 반드시 JSON 문자열 배열만 출력하라. 예: ["회의", "프로젝트a"]',
    prefer: "claude",
    timeoutMs,
  });
  if (!res) return null;
  try {
    const m = res.text.match(/\[[\s\S]*?\]/);
    const arr = JSON.parse(m ? m[0] : res.text);
    if (!Array.isArray(arr)) return null;
    const tags = [...new Set(arr.filter((t) => typeof t === "string").map((t: string) => t.trim()).filter(Boolean))].slice(0, 3);
    return tags.length ? tags : null;
  } catch {
    return null;
  }
}

/** 방금 capture가 만든 frontmatter의 `tags: []` 줄에 태그를 기록한다(capture 시 1회만 —
 *  이후 재색인·동작은 파일을 수정하지 않으므로 수동 편집 태그가 보존된다, AC-11). */
function writeTagsToNote(filePath: string, tags: string[]): boolean {
  try {
    const src = fs.readFileSync(filePath, "utf8");
    const line = `tags: [${tags.map((t) => JSON.stringify(t)).join(", ")}]`;
    const next = src.replace(/^tags: \[\]$/m, line);
    if (next === src) return false; // 예상 줄이 없으면 건드리지 않는다
    fs.writeFileSync(filePath, next);
    return true;
  } catch {
    return false;
  }
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
/** specs/032 FR-3 — 캡처 노트 frontmatter 조립(순수 — AC-3b 테스트 대상).
 *  tags는 각 항목을 JSON 문자열화로 이스케이프해 frontmatter가 깨지지 않게 한다(032 R5).
 *  tags 미지정이면 기존과 동일한 `tags: []`(큐레이터 자동 태깅 대상 — 하위호환). */
export function buildNoteFrontmatter(title: string, isoDate: string, tags?: string[]): string {
  const tagsLine = tags && tags.length > 0 ? `tags: [${tags.map((t) => JSON.stringify(t)).join(", ")}]` : "tags: []";
  return ["---", `title: "${title.replace(/"/g, "'")}"`, `date: ${isoDate}`, tagsLine, "source: localmind", "---", ""].join(
    "\n",
  );
}

export async function capture(
  text: string,
  title?: string,
  folder?: string,
  noteTags?: string[],
): Promise<CaptureResult> {
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
  const frontmatter = buildNoteFrontmatter(title ?? slug, isoDate, noteTags);
  const body = title ? `${frontmatter}# ${title}\n\n${text}\n` : `${frontmatter}${text}\n`;
  // 배타적 생성 — 같은 초에 같은 제목으로 캡처해도 먼저 저장된 노트를 덮어쓰지 않는다(013 FR-8).
  const fname = createNoteFile(target.dir, `${ts}-${slug}`.slice(0, 80) + ".md", body);

  const key = `${target.label}/${fname}`;

  // specs/017 FR-5 — 큐레이터 태깅: 파일 생성 후·색인 전에 frontmatter에 기록해
  // 색인이 최종본으로 1회만 돌게 한다. 실패·부재·꺼짐은 태그 없이 진행(캡처 우선).
  let tags: string[] | undefined = noteTags && noteTags.length > 0 ? noteTags : undefined;
  // 사전 지정 tags가 있으면 frontmatter가 이미 채워져 큐레이터 치환(`^tags: \[\]$`)은 no-op —
  // 자동 태깅 호출 자체를 생략한다(032 FR-3: 사용자 지정 우선).
  if (!tags && process.env.BRAIN_CAPTURE_TAGS !== "off") {
    const suggested = await suggestTags(text, title);
    if (suggested && writeTagsToNote(path.join(target.dir, fname), suggested)) tags = suggested;
  }

  // 텍스트가 너무 짧으면 검증 생략
  if (!extractSearchQuery(text)) {
    await ensureIndexed();
    const skipped: CaptureResult = { path: key, validationStatus: "skipped", retried: false, ...(tags && { tags }) };
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
    ...(tags && { tags }),
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

// ── specs/017 — 페르소나 런타임 위임 (사서 합성 · 크리틱 검증) ──────────────

/** 노트 근거 원칙 — 페르소나(사서)와 무관하게 항상 강제되는 규칙(017 FR-2). */
const FORCED_RAG_RULES =
  "당신은 사용자의 개인 노트만 근거로 답하는 어시스턴트입니다. 아래 '노트'에 있는 내용만 사용하고, " +
  "출처를 [경로]로 인용하세요. 노트에 없으면 모른다고 답하세요.";

/** 크리틱 자동 검증의 강제 규칙 — 검사 범위를 사실·수치·인용으로 한정(017 FR-3). */
const VERIFY_RULES =
  "역할 제한: 지금은 자동 사실 대조만 한다. 답변의 구체적 사실 주장·수치·날짜·인용이 아래 출처 청크와 " +
  "일치하는지만 검사하라. 일반 서술·종합·연결·의견은 검사 대상이 아니다. " +
  '반드시 JSON만 출력하라: {"ok": true} 또는 {"ok": false, "issues": ["확인되지 않는 항목 설명", ...]}';

interface VerifyOutcome {
  /** 답변 뒤에 붙일 표시(무음이면 빈 문자열) */
  note: string;
  /** 로그 필드 — undefined면 기록하지 않음(env off·페르소나 부재) */
  verify?: "pass" | "warn" | "skipped";
}

/** 검증 생략 표시 — 크리틱이 "존재하는데" 수행하지 못했을 때만 쓴다(부재는 무음). */
function skipNote(reason: string): string {
  return `\n\n---\nℹ 검증 생략(${reason})`;
}

/** 크리틱 교차 검증 파이프라인(017 FR-3·4). 어떤 실패도 답변을 막지 않는다. */
async function verifyAnswer(answer: string, context: string, synthModel: string): Promise<VerifyOutcome> {
  if (process.env.BRAIN_VERIFY === "off") return { note: "" }; // 필드 자체를 남기지 않음(AC-14)
  const critic = resolvePersona("critic");
  if (!critic) return { note: "" }; // 미구성 — 무음·무필드(FR-1)

  // 교차 백엔드 판정 — 동종 검증으로 위장하지 않는다(FR-3).
  const target = pickCrossTarget(critic, modelBackend(synthModel));
  if (!target) return { note: skipNote("교차 모델 없음"), verify: "skipped" };

  // 일일 상한 — 로그가 곧 카운터(±1 오차 허용, plan).
  const limit = Math.max(0, Number(process.env.BRAIN_VERIFY_DAILY_LIMIT ?? 50));
  const todayCount = countVerifyOnDay(readRecords(QUERY_LOG_PATH) ?? []);
  if (todayCount >= limit) return { note: skipNote("일일 상한"), verify: "skipped" };

  const timeoutMs = Math.max(1000, Number(process.env.BRAIN_VERIFY_TIMEOUT_MS ?? 60_000));
  const res = await personaChat(critic, {
    user: `답변:\n${answer}\n\n출처 청크:\n${context}`,
    systemPrefix: VERIFY_RULES,
    target,
    timeoutMs,
  });
  if (!res) return { note: skipNote("시간 초과 또는 호출 실패"), verify: "skipped" };

  const verdict = parseVerdict(res.text);
  if (!verdict) return { note: skipNote("판정 해석 실패"), verify: "skipped" };
  if (verdict.ok || verdict.issues.length === 0) return { note: "", verify: "pass" }; // 통과 = 무음(FR-9)

  const items = verdict.issues.slice(0, 5).map((i) => `- ${i}`).join("\n");
  return {
    note:
      `\n\n---\n⚠ 검증(critic/${res.model}): 아래 내용은 출처에서 확인되지 않았습니다 — ` +
      `교차 모델의 추정이며 최종 판단은 사용자 몫입니다:\n${items}\n` +
      `(이 검증이 거슬리면 BRAIN_VERIFY=off 로 끌 수 있어요)`,
    verify: "warn",
  };
}

/** RAG: 노트 검색 → 컨텍스트로 claude/codex 종합 답변(인용 포함). folder(라벨)로 한정 가능.
 *  specs/017: 사서 페르소나가 있으면 합성을 위임하고, 크리틱이 답변을 교차 검증한다.
 *  로그는 검증까지 끝난 뒤 **단일 레코드**로 남긴다(AC-15 — 이중 기록은 리포트를 오염). */
export async function askBrain(question: string, k = 5, folder?: string): Promise<BrainAnswer> {
  const hits = await searchNotesInternal(question, k, folder); // 내부 경유 — 이중 기록 방지(D-1)
  const logAsk = (sources: string[], extra: Partial<QueryLogRecord> = {}) =>
    logQuery({
      ts: new Date().toISOString(),
      tool: "ask_brain",
      query: question,
      hitCount: hits.length,
      success: sources.length > 0,
      folder: folder ?? null,
      sources,
      topScore: hits[0]?.score ?? null, // specs/025 — hits는 스코어 내림차순(클로저 재사용)
      ...extra,
    });
  if (!hits.length) {
    logAsk([]); // 답변이 없으므로 검증도 없다(FR-4)
    return { answer: "관련 노트를 찾지 못했습니다.", sources: [] };
  }

  const context = hits.map((h) => `[${h.path}]\n${h.text}`).join("\n\n---\n\n");
  const sources = [...new Set(hits.map((h) => h.path))];

  // 사서 합성(FR-2) — 강제 규칙이 페르소나 지침보다 앞. 부재 시 기존 경로·무음.
  let model = ANSWER_MODEL;
  let system = FORCED_RAG_RULES;
  let persona: string | undefined;
  if (process.env.BRAIN_LIBRARIAN !== "off") {
    const librarian = resolvePersona("librarian");
    const target = librarian && pickTarget(librarian, "claude");
    if (librarian && target) {
      model = target.model;
      system = `${FORCED_RAG_RULES}\n\n${librarian.prompt}`;
      persona = "librarian";
    }
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (GATEWAY_KEY) headers.Authorization = `Bearer ${GATEWAY_KEY}`;
  const res = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `노트:\n${context}\n\n질문: ${question}` },
      ],
    }),
  });
  if (!res.ok) {
    logAsk(sources, { model, persona }); // 합성 실패 — 검증 없이 1회 기록(FR-4·AC-15)
    return { answer: `종합 실패 (HTTP ${res.status})`, sources };
  }
  const j: any = await res.json();
  const answer = j?.choices?.[0]?.message?.content ?? "(빈 응답)";

  const verified = await verifyAnswer(answer, context, model);
  logAsk(sources, { model, persona, ...(verified.verify ? { verify: verified.verify } : {}) });
  return { answer: answer + verified.note, sources };
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

/** 모든 노트 폴더를 (재)인덱싱하고 통계를 돌려준다. 복구·대량추가 후 인덱스를 미리 데운다.
 *  summary — 이번 실행의 프루닝 요약(specs/020 FR-4). single-flight로 다른 실행에 합류하면
 *  그 실행의 요약(같은 프로세스·같은 구성)을 받거나 null일 수 있다 — 안내 생략은 허용. */
export async function reindex(): Promise<{ files: number; chunks: number; summary: ReindexSummary | null }> {
  lastReindexSummary = null;
  const idx = await ensureIndexed();
  let chunks = 0;
  for (const fe of Object.values(idx.files)) chunks += fe.chunks.length;
  return { files: Object.keys(idx.files).length, chunks, summary: lastReindexSummary };
}

/** 설정된 노트 폴더 목록(라벨+경로). whoami/검증용. */
export function listFolders(): NoteFolder[] {
  return FOLDERS.map((f) => ({ ...f }));
}

/** specs/022 FR-4 — doctor용 읽기 전용 라벨 분류(고아·부재). 재색인·임베딩을 유발하지
 *  않고 폴더를 생성하지도 않는다(readdir만 — doEnsureIndexed의 부트스트랩 mkdir 미상속).
 *  색인이 비어 있으면(파일 없음·손상 → loadIndex가 빈 색인 반환) 빈 결과 — 호출부(doctor)가
 *  조용히 생략한다(오탐 금지). 부재 라벨은 보존할 색인 항목이 있을 때만 보고한다. */
export function indexLabelReport(): {
  orphans: { label: string; files: number }[];
  missing: { label: string; dir: string; files: number }[];
} {
  const idx = loadIndex();
  const byLabel = new Map<string, number>();
  for (const fe of Object.values(idx.files))
    if (fe.folder) byLabel.set(fe.folder, (byLabel.get(fe.folder) ?? 0) + 1);
  if (byLabel.size === 0) return { orphans: [], missing: [] }; // 색인 없음·손상 → 조용한 생략
  const registered = new Set(FOLDERS.map((f) => f.label));
  const orphans = [...byLabel]
    .filter(([label]) => !registered.has(label))
    .map(([label, files]) => ({ label, files }));
  const missing: { label: string; dir: string; files: number }[] = [];
  for (const f of FOLDERS) {
    try {
      fs.readdirSync(f.dir);
    } catch {
      const files = byLabel.get(f.label) ?? 0;
      if (files > 0) missing.push({ label: f.label, dir: f.dir, files });
    }
  }
  return { orphans, missing };
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

// ── specs/038 — 노트 카드 브라우저: 메타 추출·열거 ─────────────────────────
export interface NoteMeta {
  folder: string;
  /** label/상대경로 (본문 API의 path 파라미터와 동일 형식) */
  path: string;
  title: string;
  tags: string[];
  /** YYYY-MM-DD (frontmatter date/created → 파일명 → "") */
  date: string;
  snippet: string;
}

/** 문자열에서 첫 현실적 날짜(20xx-01~12-01~31, 구분자 유무 무관)를 YYYY-MM-DD로.
 *  숫자 id를 날짜로 오인하지 않도록 ① 연도 20xx + 월·일 범위 검증 ② 앞뒤가 숫자가 아님
 *  (긴 숫자 id에 우연히 박힌 날짜 부분열 배제 — 038 self-review). */
function firstIsoDate(s: string): string {
  const re = /(?<!\d)(20\d{2})-?(\d{2})-?(\d{2})(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  return "";
}

/** 노트 텍스트에서 카드 메타를 추출한다(순수 — I/O 없음, 038 AC-2). */
export function parseNoteMeta(text: string, relPath: string, folderLabel: string): NoteMeta {
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  const fmBody = fm ? fm[1] : "";
  const fmField = (name: string): string | null => {
    const m = fmBody.match(new RegExp(`^${name}:\\s*(.+)$`, "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
  };
  // 인라인(tags: ["a","b"]) 우선, 없으면 블록 스타일(tags:\n  - a\n  - b)도 파싱(038 self-review).
  const cleanTag = (t: string) => t.trim().replace(/^["']|["']$/g, "");
  const inlineTags = fmBody.match(/^tags:\s*\[([^\]]*)\]/m);
  let tags: string[];
  if (inlineTags) {
    tags = inlineTags[1].split(",").map(cleanTag).filter(Boolean);
  } else {
    const blockTags = fmBody.match(/^tags:\s*\n((?:[ \t]*-[ \t]*.+\n?)+)/m);
    tags = blockTags
      ? blockTags[1].split("\n").map((l) => cleanTag(l.replace(/^[ \t]*-[ \t]*/, ""))).filter(Boolean)
      : [];
  }
  const body = text.replace(/^---\n[\s\S]*?\n---\s*/, "");
  const headingM = body.match(/^#\s+(.+)$/m);
  const base = (relPath.replace(/\.md$/, "").split("/").pop() ?? relPath) || relPath;
  const title = fmField("title") || (headingM ? headingM[1].trim() : base);
  const date = firstIsoDate(fmField("date") ?? fmField("created") ?? "") || firstIsoDate(relPath);
  const snippet = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("---"))
    .map((l) => l.replace(/^>\s*/, "").replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 140);
  return { folder: folderLabel, path: `${folderLabel}/${relPath}`, title, tags, date, snippet };
}

export interface NotesListing {
  notes: NoteMeta[];
  /** 빈도순 전체 태그(필터 칩용) */
  tags: string[];
}

/** 전체 노트를 메타와 함께 열거한다(날짜 내림차순, 태그 빈도순). 038 FR-1·2.
 *  folders 주입은 테스트용(기본 FOLDERS). */
export function listNotesWithMeta(folders: NoteFolder[] = FOLDERS): NotesListing {
  const notes: NoteMeta[] = [];
  const tagFreq = new Map<string, number>();
  for (const f of folders) {
    for (const full of listMarkdown(f.dir)) {
      let text: string;
      try {
        // 심링크 노트는 리스팅에서 제외 — 폴더 밖 파일 내용이 스니펫으로 새지 않게(본문
        // API·reportsStatus와 동일 보안 태세, 038 self-review 중대-1). 신뢰경계 밖 입력.
        if (fs.lstatSync(full).isSymbolicLink()) continue;
        text = fs.readFileSync(full, "utf8").slice(0, 4000); // 상단만 — frontmatter+스니펫 충분
      } catch {
        continue; // 사라진 파일 — 건너뜀
      }
      const meta = parseNoteMeta(text, path.relative(f.dir, full), f.label);
      notes.push(meta);
      for (const t of meta.tags) tagFreq.set(t, (tagFreq.get(t) ?? 0) + 1);
    }
  }
  notes.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const tags = [...tagFreq.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  return { notes, tags };
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
