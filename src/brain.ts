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
const INDEX_PATH = path.join(NOTES_DIR, ".brain-index.json");

const EMB_URL = (process.env.EMBEDDINGS_URL ?? "http://localhost:4000/v1").replace(/\/$/, "");
const EMB_KEY = process.env.EMBEDDINGS_KEY ?? process.env.LITELLM_MASTER_KEY ?? "sk-local";
const EMB_MODEL = process.env.EMBEDDINGS_MODEL ?? "text-embedding-3-small";

const GATEWAY_URL = (process.env.CLI_GATEWAY_URL ?? "http://localhost:8787").replace(/\/$/, "");
const GATEWAY_KEY = process.env.CLI_GATEWAY_API_KEY?.trim();
const ANSWER_MODEL = process.env.MCP_DEFAULT_MODEL ?? "sonnet";

const MAX_CHUNK = 1200;

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
  const res = await fetch(`${EMB_URL}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${EMB_KEY}` },
    body: JSON.stringify({ model: EMB_MODEL, input: texts }),
  });
  if (!res.ok) throw new Error(`embeddings HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j: any = await res.json();
  // index 순서 보존
  return (j.data as any[]).sort((a, b) => a.index - b.index).map((d) => d.embedding as number[]);
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

/** 변경된 노트만 증분 임베딩해 인덱스를 최신화한다. */
async function ensureIndexed(): Promise<BrainIndex> {
  ensureDir();
  const idx = loadIndex();
  const files = listMarkdown(NOTES_DIR);
  const seen = new Set<string>();

  for (const full of files) {
    const rel = path.relative(NOTES_DIR, full);
    seen.add(rel);
    const text = fs.readFileSync(full, "utf8");
    const h = sha(text);
    if (idx.files[rel]?.hash === h) continue; // 변경 없음
    const chunks = chunkText(text);
    if (!chunks.length) {
      idx.files[rel] = { hash: h, chunks: [] };
      continue;
    }
    const vectors = await embed(chunks);
    idx.files[rel] = {
      hash: h,
      chunks: chunks.map((c, i) => ({ path: rel, text: c, vector: vectors[i] })),
    };
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
