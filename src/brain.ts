/**
 * second-brain 레이어: .md 노트(정본)에 대한 로컬 RAG.
 *
 *  - 노트는 NOTES_DIR의 마크다운 파일이 정본.
 *  - 임베딩 인덱스는 파생물( NOTES_DIR/.brain-index.json ). 파일 해시로 증분 갱신.
 *  - 임베딩은 게이트웨이(bge-m3), 종합은 cli-gateway 채팅(claude/codex)을 쓴다.
 *
 * pgvector/포트 노출이 필요 없도록 인덱스는 로컬 파일 + 인메모리 코사인으로 처리한다
 * (개인 지식 규모엔 충분). stdout은 MCP 전용이므로 이 모듈은 어떤 것도 stdout에 쓰지 않는다.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const NOTES_DIR = process.env.NOTES_DIR ?? path.join(process.env.HOME ?? ".", "cli-gateway-brain");
// 인덱스는 기본적으로 노트 폴더 안에 두되, git/싱크 볼트를 더럽히지 않도록
// BRAIN_INDEX로 위치를 바꿀 수 있다.
const INDEX_PATH = process.env.BRAIN_INDEX ?? path.join(NOTES_DIR, ".brain-index.json");

const EMB_URL = (process.env.EMBEDDINGS_URL ?? "http://localhost:4000/v1").replace(/\/$/, "");
const EMB_KEY = process.env.EMBEDDINGS_KEY ?? process.env.LITELLM_MASTER_KEY ?? "sk-local";
const EMB_MODEL = process.env.EMBEDDINGS_MODEL ?? "text-embedding-3-small";

const GATEWAY_URL = (process.env.CLI_GATEWAY_URL ?? "http://localhost:8787").replace(/\/$/, "");
const GATEWAY_KEY = process.env.CLI_GATEWAY_API_KEY?.trim();
const ANSWER_MODEL = process.env.MCP_DEFAULT_MODEL ?? "sonnet";

const MAX_CHUNK = Math.max(400, Number(process.env.BRAIN_CHUNK_SIZE ?? 2000));

interface IndexedChunk {
  path: string;
  text: string;
  vector: number[];
}
interface FileEntry {
  hash: string;
  chunks: IndexedChunk[];
}
interface BrainIndex {
  version: number;
  files: Record<string, FileEntry>;
}

function ensureDir(): void {
  fs.mkdirSync(NOTES_DIR, { recursive: true });
}

function loadIndex(): BrainIndex {
  try {
    return JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
  } catch {
    return { version: 1, files: {} };
  }
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
 * 변경된 노트만 증분 임베딩해 인덱스를 최신화한다.
 *
 * 속도: 임베딩 요청은 고정 오버헤드가 커서, 파일 단위가 아니라 모든 청크를 펼쳐
 * 배치(BRAIN_BATCH=8)로 묶어 보낸다 → 오버헤드 분산. CPU 임베딩은 청크당 1~4s라
 * 배치가 크면 요청 타임아웃을 넘겨 재시도 cascade가 나므로 작게 잡고, 동시성도
 * 낮게(BRAIN_CONCURRENCY=2: NUM_PARALLEL=1 ollama 큐 적체 완화) 둔다.
 * 파일은 청크가 모두 임베딩된 뒤에만 커밋하고 배치마다 저장해 중단에도 안전(이어감).
 */
async function ensureIndexed(): Promise<BrainIndex> {
  ensureDir();
  const idx = loadIndex();
  const files = listMarkdown(NOTES_DIR);
  const seen = new Set<string>();

  const pending: { rel: string; hash: string; chunks: string[] }[] = [];
  for (const full of files) {
    const rel = path.relative(NOTES_DIR, full);
    seen.add(rel);
    const text = fs.readFileSync(full, "utf8");
    const h = sha(text);
    if (idx.files[rel]?.hash === h) continue; // 변경 없음
    pending.push({ rel, hash: h, chunks: chunkText(text) });
  }

  if (pending.length) {
    const vecs = new Map<string, (number[] | undefined)[]>();
    const remaining = new Map<string, number>();
    const byRel = new Map(pending.map((p) => [p.rel, p]));
    for (const p of pending) {
      vecs.set(p.rel, new Array(p.chunks.length));
      remaining.set(p.rel, p.chunks.length);
      if (p.chunks.length === 0) idx.files[p.rel] = { hash: p.hash, chunks: [] }; // 빈 파일 즉시 커밋
    }

    type Ref = { rel: string; ci: number; text: string };
    const flat: Ref[] = [];
    for (const p of pending) p.chunks.forEach((c, ci) => flat.push({ rel: p.rel, ci, text: c }));

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
          vecs.get(r.rel)![r.ci] = out[j];
          const rem = remaining.get(r.rel)! - 1;
          remaining.set(r.rel, rem);
          if (rem === 0) {
            const p = byRel.get(r.rel)!;
            idx.files[r.rel] = {
              hash: p.hash,
              chunks: p.chunks.map((c, k) => ({ path: r.rel, text: c, vector: vecs.get(r.rel)![k]! })),
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
  for (const rel of Object.keys(idx.files)) if (!seen.has(rel)) delete idx.files[rel];

  saveIndex(idx);
  return idx;
}

export interface NoteHit {
  path: string;
  text: string;
  score: number;
}

export async function searchNotes(query: string, limit = 5): Promise<NoteHit[]> {
  const idx = await ensureIndexed();
  const [qv] = await embed([query]);
  const hits: NoteHit[] = [];
  for (const fe of Object.values(idx.files)) {
    for (const c of fe.chunks) hits.push({ path: c.path, text: c.text, score: cosine(qv, c.vector) });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

/** 노트를 새 마크다운 파일로 저장하고 인덱싱한다. 생성된 상대 경로를 반환. */
export async function capture(text: string, title?: string): Promise<string> {
  ensureDir();
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const slug =
    (title ?? text)
      .slice(0, 40)
      .replace(/[^\w가-힣\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-") || "note";
  const fname = `${ts}-${slug}`.slice(0, 80) + ".md";
  const fpath = path.join(NOTES_DIR, fname);
  const body = title ? `# ${title}\n\n${text}\n` : `${text}\n`;
  fs.writeFileSync(fpath, body);
  await ensureIndexed();
  return fname;
}

export interface BrainAnswer {
  answer: string;
  sources: string[];
}

/** RAG: 노트 검색 → 컨텍스트로 claude/codex 종합 답변(인용 포함). */
export async function askBrain(question: string, k = 5): Promise<BrainAnswer> {
  const hits = await searchNotes(question, k);
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

export function notesDir(): string {
  return NOTES_DIR;
}
