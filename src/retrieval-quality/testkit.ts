/**
 * specs/041 — 검색 품질 테스트 하네스(테스트 전용, *.test.ts 아님 → 러너가 직접 실행하지 않음).
 *
 * production 검색 경로를 격리해 돌리기 위한 재사용 도구:
 * - 결정적 임베딩 서버(production HTTP embedding 경로 앞에 세우는 test stub)
 * - 임시 HOME/NOTES_DIR/BRAIN_INDEX/QUERY_LOG env 구성
 *
 * 실제 게이트웨이나 개인 노트를 절대 건드리지 않는다. 벡터는 텍스트에서 순수 결정적으로
 * 파생하므로 같은 입력 → 같은 출력(재현성 계약 검증에 사용).
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

/** 텍스트에서 결정적 단위 벡터를 만든다(dims 고정). SHA-256 바이트를 float로 펼쳐 정규화 —
 *  같은 텍스트는 항상 같은 벡터, 다른 텍스트는 (거의 항상) 다른 벡터. 0 벡터가 되지 않게 +1. */
export function deterministicEmbedding(text: string, dims = 16): number[] {
  const v = new Array<number>(dims);
  for (let i = 0; i < dims; i++) {
    const h = crypto.createHash("sha256").update(`${i}:${text}`).digest();
    // 8바이트를 부호 있는 정수로 → [-1,1] 근사
    let acc = 0;
    for (let b = 0; b < 8; b++) acc = acc * 256 + h[b];
    v[i] = (acc % 20000) / 10000 - 1 + 1e-6;
  }
  return v;
}

export type EmbeddingServer = {
  url: string; // EMBEDDINGS_URL로 쓸 값(…/v1)
  requests: number;
  close: () => Promise<void>;
  /** 다음 요청부터 이 HTTP 상태로 실패시킨다(검색 오류 경로 테스트용). null이면 정상. */
  failWith: (status: number | null) => void;
};

/** production embed()가 POST하는 `${EMBEDDINGS_URL}/embeddings`를 흉내 내는 로컬 서버.
 *  요청 body의 각 input text에 deterministicEmbedding을 돌려준다(index 순서 보존). */
export async function startEmbeddingServer(dims = 16): Promise<EmbeddingServer> {
  let failStatus: number | null = null;
  const state = { requests: 0 };
  const server = http.createServer((req, res) => {
    if (!req.url?.endsWith("/embeddings")) {
      res.writeHead(404).end();
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      state.requests++;
      if (failStatus !== null) {
        res.writeHead(failStatus, { "Content-Type": "text/plain" }).end("embedding stub forced error");
        return;
      }
      let input: string[] = [];
      try {
        const j = JSON.parse(body);
        input = Array.isArray(j.input) ? j.input : [j.input];
      } catch {
        /* 빈 입력 */
      }
      const data = input.map((t, index) => ({ index, embedding: deterministicEmbedding(String(t), dims) }));
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ data }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}/v1`,
    get requests() {
      return state.requests;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    failWith: (status) => {
      failStatus = status;
    },
  };
}

export type TempEnv = {
  home: string;
  notesDir: string;
  indexPath: string;
  queryLog: string;
  cleanup: () => void;
};

/** 격리 임시 디렉터리와 그 안의 env 경로들을 만든다(실제 설정 전 값만 반환 — 설정은 호출자). */
export function makeTempEnv(prefix = "lm-rq-"): TempEnv {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const notesDir = path.join(home, "notes");
  fs.mkdirSync(notesDir, { recursive: true });
  return {
    home,
    notesDir,
    indexPath: path.join(notesDir, ".brain-index.json"),
    queryLog: path.join(home, "query-log.jsonl"),
    cleanup: () => {
      try {
        fs.rmSync(home, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    },
  };
}
