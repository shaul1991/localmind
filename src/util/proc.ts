import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { log } from "./log.js";

export interface SpawnNdjsonOptions {
  bin: string;
  args: string[];
  /** stdin으로 흘려보낼 문자열(프롬프트 등). 없으면 stdin을 닫는다. */
  input?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal: AbortSignal;
}

export interface NdjsonProcess {
  /** stdout을 줄 단위 JSON으로 파싱해 yield. 파싱 실패한 줄은 건너뛴다. */
  lines: AsyncGenerator<unknown, void, void>;
  /** 프로세스 종료 코드와 stderr 전문을 담은 Promise. */
  done: Promise<{ code: number | null; stderr: string }>;
  child: ChildProcessWithoutNullStreams;
}

/**
 * 자식 프로세스를 띄우고 stdout을 NDJSON으로 스트리밍 파싱한다.
 * AbortSignal로 취소하면 프로세스를 죽인다.
 */
export function spawnNdjson(opts: SpawnNdjsonOptions): NdjsonProcess {
  const { bin, args, input, cwd, env, signal } = opts;

  log.debug(`spawn: ${bin} ${args.map((a) => JSON.stringify(a)).join(" ")}`);

  const child = spawn(bin, args, {
    cwd,
    env: env ?? process.env,
    stdio: ["pipe", "pipe", "pipe"],
  }) as ChildProcessWithoutNullStreams;

  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d: string) => {
    stderr += d;
    if (stderr.length > 64_000) stderr = stderr.slice(-64_000);
  });

  // stdin 처리
  if (input !== undefined) {
    child.stdin.write(input);
  }
  child.stdin.end();

  // 취소 처리
  const onAbort = () => {
    if (!child.killed) {
      log.debug("aborting child process");
      child.kill("SIGTERM");
      // 끈질기게 살아있으면 강제 종료
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 2000).unref?.();
    }
  };
  if (signal.aborted) onAbort();
  else signal.addEventListener("abort", onAbort, { once: true });

  const done = new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      signal.removeEventListener("abort", onAbort);
      resolve({ code, stderr });
    });
  });

  async function* lineGen(): AsyncGenerator<unknown, void, void> {
    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        yield JSON.parse(trimmed);
      } catch {
        // CLI가 가끔 비-JSON 안내 문구를 stdout에 흘릴 수 있다 → 무시
        log.debug("skip non-json stdout line:", trimmed.slice(0, 200));
      }
    }
  }

  return { lines: lineGen(), done, child };
}
