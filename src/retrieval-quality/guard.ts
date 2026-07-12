/**
 * specs/041 — FS access guard(AC-010). production brain 최초 import 전에 설치해, 운영형
 * note/index/query-log 금지 prefix로 향하는 모든 path-taking FS API를 가로챈다.
 *
 * 세 가지를 제공한다:
 *  1) forbidden 접근 차단 + 기록(허용 temp 접근은 원본 구현으로 통과).
 *  2) coverage oracle — production이 실제로 부르는 path-taking method가 registry에 없으면 실패.
 *  3) guard self-test — 전용 forbidden/allow sentinel로 차단·기록·통과를 증명하고 기록을 reset.
 *
 * guard는 process-wide monkeypatch다. 격리 자식 프로세스에서만 설치하고, 그 자식은 이 파일을
 * brain 최초 import 전에 로드해야 한다.
 */
import fs from "node:fs";
import path from "node:path";

/** path 인자를 첫 번째로 받는 fs method 이름들 — sync/callback/promises 공통 registry. */
export const GUARDED_METHODS = [
  "open",
  "openSync",
  "readFile",
  "readFileSync",
  "stat",
  "statSync",
  "lstat",
  "lstatSync",
  "access",
  "accessSync",
  "exists",
  "existsSync",
  "realpath",
  "realpathSync",
  "readdir",
  "readdirSync",
  "opendir",
  "opendirSync",
  "readlink",
  "readlinkSync",
  "mkdir",
  "mkdirSync",
  "appendFile",
  "appendFileSync",
  "createReadStream",
  "createWriteStream",
  "watch",
  "watchFile",
  "unwatchFile",
  "writeFile",
  "writeFileSync",
  "rename",
  "renameSync",
  "unlink",
  "unlinkSync",
  "rm",
  "rmSync",
  "rmdir",
  "rmdirSync",
  "copyFile",
  "copyFileSync",
] as const;

export type GuardedMethod = (typeof GUARDED_METHODS)[number];

export interface ForbiddenAccess {
  method: string;
  target: string;
  surface: "sync" | "callback" | "promises";
}

interface GuardState {
  forbiddenPrefixes: string[];
  /** 이 prefix들은 forbidden 안이라도 명시 예외로 허용한다(예: temp sentinel). */
  allowPrefixes: string[];
  accesses: ForbiddenAccess[];
  /** production이 실제로 호출한(가로챈) method 이름 집합 — coverage oracle 입력. */
  observedMethods: Set<string>;
  installed: boolean;
}

const state: GuardState = {
  forbiddenPrefixes: [],
  allowPrefixes: [],
  accesses: [],
  observedMethods: new Set(),
  installed: false,
};

function toPathString(arg: unknown): string | null {
  if (typeof arg === "string") return arg;
  if (Buffer.isBuffer(arg)) return arg.toString("utf8");
  if (arg instanceof URL) {
    try {
      return arg.protocol === "file:" ? new URL(arg.href).pathname : arg.href;
    } catch {
      return arg.href;
    }
  }
  return null;
}

function isForbidden(target: string): boolean {
  const abs = path.resolve(target);
  const inAllow = state.allowPrefixes.some((p) => abs === p || abs.startsWith(p.endsWith(path.sep) ? p : p + path.sep));
  if (inAllow) return false;
  return state.forbiddenPrefixes.some(
    (p) => abs === p || abs.startsWith(p.endsWith(path.sep) ? p : p + path.sep),
  );
}

const REGISTRY = new Set<string>(GUARDED_METHODS);

/**
 * 모든 fs 함수 property를 감싼다. 첫 인자가 path-like이면 method를 observed로 기록한다(coverage
 * oracle 입력 — registry에 없는 path-taking method가 실제로 호출되면 gap으로 잡힌다). registry에
 * 있는 method는 forbidden prefix로 향할 때 추가로 차단·기록한다. registry 밖 method는 관측만 하고
 * 통과시킨다(브로드 계측 — production이 무엇을 쓰는지 완전 관측).
 */
function wrap(
  obj: Record<string, unknown>,
  method: string,
  surface: "sync" | "callback" | "promises",
): void {
  const original = obj[method];
  if (typeof original !== "function") return;
  const enforced = REGISTRY.has(method);
  const wrapped = function (this: unknown, ...args: unknown[]): unknown {
    const target = toPathString(args[0]);
    if (target !== null) {
      state.observedMethods.add(method); // 관측(coverage) — path-taking 호출 전부.
      if (enforced && isForbidden(target)) {
        state.accesses.push({ method, target: path.resolve(target), surface });
        const err = Object.assign(
          new Error(`[rq-guard] 금지된 운영 경로 접근 차단: ${method} ${path.resolve(target)}`),
          { code: "EACCES" },
        );
        // callback surface면 마지막 인자가 콜백일 수 있다 — 에러를 콜백으로 전달.
        if (surface === "callback") {
          const cb = args[args.length - 1];
          if (typeof cb === "function") {
            (cb as (e: Error) => void)(err);
            return undefined;
          }
        }
        throw err;
      }
    }
    return (original as (...a: unknown[]) => unknown).apply(this, args);
  };
  obj[method] = wrapped;
}

/** 이름·값으로 path-taking 후보 fs 함수인지 얕게 판별(브로드 계측 대상 선정). */
function looksPathTaking(name: string): boolean {
  // fd 전용·비-path API는 제외해 오탐(빈 gap)을 줄인다. path-taking 계열의 접두만 계측한다.
  return /^(open|read|write|append|stat|lstat|access|exists|realpath|readdir|opendir|readlink|mkdir|rmdir|rm|unlink|rename|copyFile|create(Read|Write)Stream|watch|truncate|chmod|chown|utimes|link|symlink|mkdtemp|cp)/.test(
    name,
  );
}

/**
 * guard를 설치한다. 반드시 brain 최초 import 전에 호출한다.
 * @param forbiddenPrefixes 운영형 note/index/query-log 절대경로 prefix들.
 * @param allowPrefixes forbidden 안이라도 허용할 예외(temp sentinel 등).
 */
export function installGuard(forbiddenPrefixes: string[], allowPrefixes: string[] = []): void {
  state.forbiddenPrefixes = forbiddenPrefixes.map((p) => path.resolve(p));
  state.allowPrefixes = allowPrefixes.map((p) => path.resolve(p));
  if (state.installed) return;
  state.installed = true;

  const fsAny = fs as unknown as Record<string, unknown>;
  const promisesAny = fs.promises as unknown as Record<string, unknown>;

  // 1) registry의 각 method를 명시적으로 감싼다(차단 대상 확정).
  for (const method of GUARDED_METHODS) {
    if (method.endsWith("Sync")) {
      wrap(fsAny, method, "sync");
    } else {
      wrap(fsAny, method, "callback");
      if (method in promisesAny) wrap(promisesAny, method, "promises");
    }
  }

  // 2) 브로드 계측 — registry 밖의 path-taking fs 함수까지 관측만 감싼다(coverage oracle).
  //    이미 감싼 것은 REGISTRY.has로 건너뛴다(이중 래핑 방지는 wrapped 참조 비교 대신 이름 기준).
  for (const name of Object.keys(fsAny)) {
    if (REGISTRY.has(name)) continue;
    if (typeof fsAny[name] !== "function") continue;
    if (!looksPathTaking(name)) continue;
    wrap(fsAny, name, name.endsWith("Sync") ? "sync" : "callback");
  }
  for (const name of Object.keys(promisesAny)) {
    if (REGISTRY.has(name)) continue;
    if (typeof promisesAny[name] !== "function") continue;
    if (!looksPathTaking(name)) continue;
    wrap(promisesAny, name, "promises");
  }
}

/** 지금까지 기록된 forbidden 접근 목록(복사본). */
export function getForbiddenAccesses(): ForbiddenAccess[] {
  return [...state.accesses];
}

/** 지금까지 가로챈(호출된) method 이름 집합. coverage oracle 입력. */
export function getObservedMethods(): Set<string> {
  return new Set(state.observedMethods);
}

/** forbidden 접근 기록과 observed method 기록을 reset(self-test 후 실제 평가 전에 호출). */
export function resetGuardRecords(): void {
  state.accesses = [];
  state.observedMethods = new Set();
}

/**
 * coverage oracle — production이 실제로 호출한 path-taking fs method 중 guard registry
 * (GUARDED_METHODS = 차단 대상)에 없는 것을 반환한다. 브로드 계측이 registry 밖 path-taking
 * 함수까지 관측만 하므로, 이 목록이 비어 있지 않다는 것은 "brain이 차단되지 않는 path-taking
 * FS API를 쓴다"는 뜻이다(테스트가 실패해야 함). 비어 있어야 통과.
 */
export function coverageGaps(): string[] {
  return [...state.observedMethods].filter((m) => !REGISTRY.has(m)).sort();
}

export interface GuardSelfTestResult {
  ok: boolean;
  blockedForbidden: { stat: boolean; read: boolean; write: boolean };
  allowedTemp: boolean;
  details: string[];
}

/**
 * guard self-test — 전용 forbidden sentinel의 stat/read/write가 각각 차단·기록되는지,
 * 허용 temp sentinel 접근이 통과하는지 확인하고, 그 뒤 기록을 reset한다(AC-010).
 * @param forbiddenSentinel forbidden prefix 안의 실재하지 않아도 되는 경로.
 * @param allowSentinel allow(또는 forbidden 밖) prefix 안의 실제 접근 가능 파일 경로.
 */
export function runGuardSelfTest(forbiddenSentinel: string, allowSentinel: string): GuardSelfTestResult {
  const details: string[] = [];
  const blocked = { stat: false, read: false, write: false };

  const expectBlock = (label: "stat" | "read" | "write", fn: () => void): void => {
    try {
      fn();
      details.push(`self-test 실패: ${label}가 차단되지 않음(${forbiddenSentinel})`);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "EACCES") blocked[label] = true;
      else details.push(`self-test: ${label} 차단됐으나 예상 밖 오류: ${(e as Error).message}`);
    }
  };

  expectBlock("stat", () => fs.statSync(forbiddenSentinel));
  expectBlock("read", () => fs.readFileSync(forbiddenSentinel));
  expectBlock("write", () => fs.writeFileSync(forbiddenSentinel, "x"));

  // 허용 temp sentinel: write 후 read가 통과해야 한다.
  let allowedTemp = false;
  try {
    fs.writeFileSync(allowSentinel, "allow-sentinel");
    const back = fs.readFileSync(allowSentinel, "utf8");
    allowedTemp = back === "allow-sentinel";
    if (!allowedTemp) details.push("self-test 실패: 허용 temp sentinel 내용이 왕복에서 달라짐");
  } catch (e) {
    details.push(`self-test 실패: 허용 temp sentinel 접근이 차단됨: ${(e as Error).message}`);
  }

  const recordedForbidden = state.accesses.filter((a) => path.resolve(a.target) === path.resolve(forbiddenSentinel));
  if (recordedForbidden.length < 3) {
    details.push(`self-test 실패: forbidden 접근 기록이 3건 미만(${recordedForbidden.length}건)`);
  }

  const ok =
    blocked.stat &&
    blocked.read &&
    blocked.write &&
    allowedTemp &&
    recordedForbidden.length >= 3 &&
    details.length === 0;

  // 실제 평가 전에 기록을 깨끗이 reset한다(sentinel 접근이 최종 forbidden 목록을 오염시키지 않게).
  resetGuardRecords();

  return { ok, blockedForbidden: blocked, allowedTemp, details };
}
