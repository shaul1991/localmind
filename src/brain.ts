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
  const raw = (process.env.NOTES_DIR ?? path.join(process.env.HOME ?? ".", "localmind-brain")).trim();
  const used = new Set<string>();
  const folders: NoteFolder[] = [];
  for (const spec of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const eq = spec.indexOf("=");
    let label = eq > 0 ? spec.slice(0, eq).trim() : "";
    let dir = path.resolve(expandHome(eq > 0 ? spec.slice(eq + 1).trim() : spec));
    if (!label) label = path.basename(dir) || "notes";
    let uniq = label;
    for (let n = 2; used.has(uniq); n++) uniq = `${label}-${n}`; // 라벨 충돌 방지
    used.add(uniq);
    folders.push({ label: uniq, dir });
  }
  return folders.length
    ? folders
    : [{ label: "notes", dir: path.resolve(path.join(process.env.HOME ?? ".", "localmind-brain")) }];
}

const FOLDERS = parseFolders();
const FOLDER_BY_LABEL = new Map(FOLDERS.map((f) => [f.label, f]));
// 인덱스는 기본적으로 첫 노트 폴더 안에 두되(기존 호환), git/싱크 볼트를 더럽히지
// 않도록 BRAIN_INDEX로 위치를 바꿀 수 있다.
const INDEX_PATH = process.env.BRAIN_INDEX ?? path.join(FOLDERS[0].dir, ".brain-index.json");

const EMB_URL = (process.env.EMBEDDINGS_URL ?? "http://localhost:4000/v1").replace(/\/$/, "");
const EMB_KEY = process.env.EMBEDDINGS_KEY ?? process.env.LITELLM_MASTER_KEY ?? "sk-local";
const EMB_MODEL = process.env.EMBEDDINGS_MODEL ?? "text-embedding-3-small";

const GATEWAY_URL = (process.env.LOCALMIND_URL ?? "http://localhost:8787").replace(/\/$/, "");
const GATEWAY_KEY = process.env.LOCALMIND_API_KEY?.trim();
const ANSWER_MODEL = process.env.MCP_DEFAULT_MODEL ?? "sonnet";

const MAX_CHUNK = Math.max(400, Number(process.env.BRAIN_CHUNK_SIZE ?? 2000));

const INDEX_VERSION = 2; // 1→2: 인덱스 키를 'label/rel'로 namespacing + folder 태그

interface IndexedChunk {
  path: string;
  text: string;
  vector: number[];
}
interface FileEntry {
  hash: string;
  folder: string;
  chunks: IndexedChunk[];
}
interface BrainIndex {
  version: number;
  files: Record<string, FileEntry>;
}

function ensureDirs(): void {
  for (const f of FOLDERS) fs.mkdirSync(f.dir, { recursive: true });
}

function loadIndex(): BrainIndex {
  try {
    const idx = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as BrainIndex;
    if (idx.version === INDEX_VERSION && idx.files) return idx;
  } catch {
    /* 없음/손상 → 새로 만든다 */
  }
  return { version: INDEX_VERSION, files: {} }; // 버전 불일치(스키마 변경) → 전체 재인덱싱
}

function saveIndex(idx: BrainIndex): void {
  fs.writeFileSync(INDEX_PATH, JSON.stringify(idx));
}

function listMarkdown(dir: string): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue; // 숨김 파일/디렉토리 제외(인덱스 포함)
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listMarkdown(full));
    else if (e.name.toLowerCase().endsWith(".md")) out.push(full);
  }
  return out;
}

function chunkText(text: string): string[] {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    const piece = p.length > MAX_CHUNK ? p.slice(0, MAX_CHUNK) : p;
    if (cur && (cur.length + 2 + piece.length) > MAX_CHUNK) {
      chunks.push(cur);
      cur = piece;
    } else {
      cur = cur ? `${cur}\n\n${piece}` : piece;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

function sha(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

async function embed(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
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
 */
async function ensureIndexed(): Promise<BrainIndex> {
  ensureDirs();
  const idx = loadIndex();
  const seen = new Set<string>();

  const pending: { key: string; folder: string; hash: string; chunks: string[] }[] = [];
  for (const f of FOLDERS) {
    for (const full of listMarkdown(f.dir)) {
      const key = `${f.label}/${path.relative(f.dir, full)}`;
      seen.add(key);
      const text = fs.readFileSync(full, "utf8");
      const h = sha(text);
      if (idx.files[key]?.hash === h) continue; // 변경 없음
      pending.push({ key, folder: f.label, hash: h, chunks: chunkText(text) });
    }
  }

  if (pending.length) {
    const vecs = new Map<string, (number[] | undefined)[]>();
    const remaining = new Map<string, number>();
    const byKey = new Map(pending.map((p) => [p.key, p]));
    for (const p of pending) {
      vecs.set(p.key, new Array(p.chunks.length));
      remaining.set(p.key, p.chunks.length);
      if (p.chunks.length === 0) idx.files[p.key] = { hash: p.hash, folder: p.folder, chunks: [] }; // 빈 파일 즉시 커밋
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
  const idx = await ensureIndexed();
  const [qv] = await embed([query]);
  const hits: NoteHit[] = [];
  for (const fe of Object.values(idx.files)) {
    if (folder && fe.folder !== folder) continue; // 스코프 필터
    for (const c of fe.chunks) hits.push({ path: c.path, text: c.text, score: cosine(qv, c.vector) });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

/** 노트를 새 마크다운 파일로 저장하고 인덱싱한다. folder(라벨)로 대상 폴더 선택(기본 첫 폴더). 생성된 'label/파일명' 반환. */
export async function capture(text: string, title?: string, folder?: string): Promise<string> {
  ensureDirs();
  const target = (folder && FOLDER_BY_LABEL.get(folder)) || FOLDERS[0];
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const slug =
    (title ?? text)
      .slice(0, 40)
      .replace(/[^\w가-힣\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-") || "note";
  const fname = `${ts}-${slug}`.slice(0, 80) + ".md";
  const fpath = path.join(target.dir, fname);
  const body = title ? `# ${title}\n\n${text}\n` : `${text}\n`;
  fs.writeFileSync(fpath, body);
  await ensureIndexed();
  return `${target.label}/${fname}`;
}

export interface BrainAnswer {
  answer: string;
  sources: string[];
}

/** RAG: 노트 검색 → 컨텍스트로 claude/codex 종합 답변(인용 포함). folder(라벨)로 한정 가능. */
export async function askBrain(question: string, k = 5, folder?: string): Promise<BrainAnswer> {
  const hits = await searchNotes(question, k, folder);
  if (!hits.length) return { answer: "관련 노트를 찾지 못했습니다.", sources: [] };

  const context = hits.map((h) => `[${h.path}]\n${h.text}`).join("\n\n---\n\n");
  const sources = [...new Set(hits.map((h) => h.path))];

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

/** 설정된 노트 폴더 목록(라벨+경로). whoami/검증용. */
export function listFolders(): NoteFolder[] {
  return FOLDERS.map((f) => ({ ...f }));
}

/** 노트 폴더 요약 문자열(label:dir, ...). */
export function notesDir(): string {
  return FOLDERS.map((f) => `${f.label}:${f.dir}`).join(", ");
}
