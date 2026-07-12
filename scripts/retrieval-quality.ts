/**
 * specs/041 — 검색 품질 측정 CLI(FR-008, AC-011).
 *
 *   npm run --silent retrieval:quality -- [--help] [--json] [--output <path>]
 *
 * 기본       : 평이한 한국어 요약을 stdout에 1개. 보고서 파일은 만들지 않음.
 * --help 단독: 한국어 usage + exit 0(runner 미실행).
 * --json     : JSON 보고서만 stdout(마지막 LF 1개). 사람용 요약 없음.
 * --output   : 동일 JSON bytes를 지정 경로에 원자적으로(temp+rename) 기록.
 *
 * exit: 측정 성공(gate pass/fail 무관)=0, runtime/schema 오류=1, usage 오류=2.
 * stderr는 비밀값·질의 원문·전체 절대경로 없이 원인만.
 *
 * 이 스크립트는 저장소 고정 fixture와 production embedding/search 경로만 쓴다. 임의 fixture
 * root나 test stub을 고르는 공개 옵션은 없다(test stub은 runner seam으로만 주입).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");

const USAGE = [
  "사용법: npm run --silent retrieval:quality -- [--help] [--json] [--output <경로>]",
  "",
  "  (옵션 없음)   한국어 요약을 화면에 출력합니다.",
  "  --help        이 도움말을 출력하고 종료합니다.",
  "  --json        JSON 보고서만 출력합니다(사람용 요약 없음).",
  "  --output <경로>  같은 JSON을 지정한 파일에 원자적으로 기록합니다.",
  "",
  "종료 코드: 측정 성공 0, 실행/검증 오류 1, 사용법 오류 2.",
].join("\n");

// evaluationInputsDirty pathspec과 동일한 접두 — output이 이 안이면 거부(FR-008).
const EVALUATION_INPUT_PREFIXES = [
  "src",
  "scripts",
  "tests/fixtures/retrieval-quality",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "specs/041-retrieval-quality-contract/goal.md",
  "specs/041-retrieval-quality-contract/spec.md",
];

// specs/041 FR-008 — stderr에 비밀값·전체 절대경로를 남기지 않는다. Node fs 오류 message에는
// EACCES/ENOENT처럼 절대경로(임시 디렉터리 포함)가 섞일 수 있으므로, 사용자에게 내보내기 전에
// 절대경로 토큰을 <경로>로 마스킹한다(진단성은 유지, 경로만 제거).
function stripPaths(msg: string): string {
  return msg.replace(/\/[^\s'":]+(?:\/[^\s'":]+)+/g, "<경로>");
}

function usageError(msg: string): never {
  process.stderr.write(`오류: ${stripPaths(msg)}\n\n${USAGE}\n`);
  process.exit(2);
}

function runtimeError(msg: string): never {
  process.stderr.write(`오류: ${stripPaths(msg)}\n`);
  process.exit(1);
}

interface ParsedArgs {
  help: boolean;
  json: boolean;
  output: string | null;
}

function parseArgs(argv: string[]): ParsedArgs {
  let help = false;
  let json = false;
  let output: string | null = null;
  let outputSeen = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help") {
      if (help) usageError("--help가 중복되었습니다.");
      help = true;
    } else if (a === "--json") {
      if (json) usageError("--json이 중복되었습니다.");
      json = true;
    } else if (a === "--output") {
      if (outputSeen) usageError("--output이 중복되었습니다.");
      outputSeen = true;
      const val = argv[i + 1];
      if (val === undefined || val.startsWith("--")) usageError("--output에 경로 값이 필요합니다.");
      if (val === "-") usageError("--output -는 지원하지 않습니다.");
      output = val;
      i++;
    } else if (a.startsWith("--output=")) {
      if (outputSeen) usageError("--output이 중복되었습니다.");
      outputSeen = true;
      const val = a.slice("--output=".length);
      if (val === "" || val === "-") usageError("--output에 유효한 경로 값이 필요합니다.");
      output = val;
    } else {
      usageError(`알 수 없는 옵션: ${a}`);
    }
  }
  // --help은 다른 옵션과 함께 쓸 수 없다(usage error 2).
  if (help && (json || outputSeen)) usageError("--help는 다른 옵션과 함께 쓸 수 없습니다.");
  return { help, json, output };
}

/** git tracked 여부(추적 파일이면 output 대상 거부). */
function isTracked(abs: string): boolean {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", abs], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

/** output 대상 경로 정책 검증(FR-008). 위반이면 artifact error(exit 1). */
function validateOutputTarget(rawOutput: string): { abs: string; parent: string } {
  const abs = path.resolve(process.cwd(), rawOutput);
  const parent = path.dirname(abs);

  // parent가 존재하는 디렉터리여야 한다.
  let parentStat: fs.Stats;
  try {
    parentStat = fs.statSync(parent);
  } catch {
    runtimeError("출력 경로의 상위 디렉터리가 존재하지 않습니다.");
  }
  if (!parentStat.isDirectory()) runtimeError("출력 경로의 상위가 디렉터리가 아닙니다.");

  // .git/ 내부 거부.
  const relFromRepo = path.relative(REPO_ROOT, abs);
  const insideRepo = relFromRepo !== "" && !relFromRepo.startsWith("..") && !path.isAbsolute(relFromRepo);
  if (insideRepo) {
    const posix = relFromRepo.split(path.sep).join("/");
    if (posix === ".git" || posix.startsWith(".git/")) runtimeError("출력 경로가 .git 내부입니다.");
    // evaluation-input pathspec 내부 거부.
    for (const prefix of EVALUATION_INPUT_PREFIXES) {
      if (posix === prefix || posix.startsWith(prefix.endsWith("/") ? prefix : prefix + "/")) {
        runtimeError("출력 경로가 평가 입력 경로 내부입니다.");
      }
    }
  }

  // 대상이 존재하면: symlink/directory 거부, tracked 거부, 기존 report만 교체 허용.
  let targetLstat: fs.Stats | null = null;
  try {
    targetLstat = fs.lstatSync(abs);
  } catch {
    targetLstat = null; // 없음 — 생성 허용.
  }
  if (targetLstat) {
    if (targetLstat.isSymbolicLink()) runtimeError("출력 경로가 심볼릭 링크입니다.");
    if (targetLstat.isDirectory()) runtimeError("출력 경로가 디렉터리입니다.");
    if (!targetLstat.isFile()) runtimeError("출력 경로가 일반 파일이 아닙니다.");
    if (isTracked(abs)) runtimeError("출력 경로가 git 추적 파일입니다.");
    // 기존 regular file은 LocalMind 보고서일 때만 교체.
    let priorOk = false;
    try {
      const prior = JSON.parse(fs.readFileSync(abs, "utf8"));
      priorOk = prior?.reportType === "localmind-retrieval-quality" && prior?.schemaVersion === 1;
    } catch {
      priorOk = false;
    }
    if (!priorOk) runtimeError("기존 파일이 LocalMind 검색 품질 보고서가 아니어서 덮어쓰지 않습니다.");
  }

  return { abs, parent };
}

/** 원자적 쓰기 — same-parent exclusive temp + rename. 자기 temp만 cleanup. */
function atomicWrite(abs: string, parent: string, bytes: Buffer): void {
  const basename = path.basename(abs);
  let tmpPath = "";
  let created = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = path.join(
      parent,
      `.localmind-retrieval-quality.${basename}.${process.pid}.${crypto.randomUUID()}.tmp`,
    );
    try {
      const fd = fs.openSync(candidate, "wx", 0o600);
      fs.writeSync(fd, bytes);
      fs.closeSync(fd);
      tmpPath = candidate;
      created = true;
      break;
    } catch (e) {
      if ((e as { code?: string }).code === "EEXIST") continue; // collision — 새 UUID로 재시도.
      runtimeError(`출력 임시 파일 생성 실패: ${(e as Error).message}`);
    }
  }
  if (!created) runtimeError("출력 임시 파일 이름 충돌이 반복되어 기록하지 못했습니다.");
  try {
    fs.renameSync(tmpPath, abs);
  } catch (e) {
    try {
      fs.rmSync(tmpPath, { force: true }); // 자기 temp만 정리.
    } catch {
      /* best-effort */
    }
    runtimeError(`출력 파일 기록 실패: ${(e as Error).message}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(USAGE + "\n");
    process.exit(0);
  }

  // output 대상 정책 검증은 runner 실행 전에(부분 실행 방지).
  let outputTarget: { abs: string; parent: string } | null = null;
  if (args.output !== null) {
    outputTarget = validateOutputTarget(args.output);
  }

  // fixture 전용 임시 index/sidecar/query-log 디렉터리 — 운영 노트/인덱스/로그를 건드리지 않는다.
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lm-rq-cli-"));
  const notesDir = path.join(tmpRoot, "notes");
  fs.mkdirSync(notesDir, { recursive: true });
  const indexPath = path.join(notesDir, ".brain-index.json");
  const queryLog = path.join(tmpRoot, "query-log.jsonl");

  const cleanup = (): void => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  };

  // brain import 전에 temp env를 설정한다(격리 계약). embedding은 실제 configured 경로 → production mode.
  process.env.HOME = tmpRoot;
  process.env.NOTES_DIR = notesDir;
  process.env.BRAIN_INDEX = indexPath;
  process.env.QUERY_LOG = queryLog;
  process.env.BRAIN_CHUNK_SIZE = "400";

  let report;
  try {
    const { runEvaluation } = await import("../src/retrieval-quality/runner.js");
    report = await runEvaluation({
      mode: "production",
      outputPath: outputTarget?.abs,
      repoRoot: REPO_ROOT,
    });
  } catch (e) {
    cleanup();
    // 부분 JSON·부분 destination을 남기지 않는다.
    runtimeError(`평가 실행 오류: ${(e as Error).message}`);
  } finally {
    // runner 성공/실패와 무관하게 fixture 전용 임시 산출물을 제거한다.
    cleanup();
  }

  const { serializeReport } = await import("../src/retrieval-quality/report.js");
  const bytes = serializeReport(report);

  // 파일은 명시했을 때만. rename 실패 시 부분 destination 없이 exit 1(atomicWrite 내부 처리).
  if (outputTarget) {
    atomicWrite(outputTarget.abs, outputTarget.parent, bytes);
  }

  if (args.json) {
    // JSON만 — 마지막 LF 1개(serializeReport가 이미 trailing "\n" 포함).
    process.stdout.write(bytes);
  } else {
    process.stdout.write(renderSummary(report));
    if (args.output) process.stdout.write(bytes); // --output + 요약: JSON도 함께(FR-008 표의 동작).
  }

  // gate fail도 측정 성공이므로 exit 0.
  process.exit(0);
}

function renderSummary(report: Awaited<ReturnType<typeof import("../src/retrieval-quality/runner.js").runEvaluation>>): string {
  const m = report.metrics;
  const g = report.gate;
  const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
  const lines: string[] = [];
  lines.push("== LocalMind 검색 품질 측정 ==");
  lines.push(`문서 ${report.counts.documents} · 양성 ${report.counts.positive} · no-match ${report.counts.noMatch}`);
  lines.push(`macro recall@5: ${pct(m.macroRecallAt5)}   MRR@5: ${m.mrrAt5.toFixed(3)}   ROC-AUC: ${m.rocAuc.toFixed(3)}`);
  lines.push(`고유 출처 비율@5(평균): ${pct(m.meanUniqueSourceRatioAt5)}   결과 반환률: ${pct(m.resultReturnRate)}`);
  if (report.thresholdCandidate) {
    const t = report.thresholdCandidate;
    lines.push(
      `후보 임계값: ${t.value.toFixed(4)} (양성 탐지율 ${pct(t.positiveDetectionRate)}, 음성 FPR ${pct(t.negativeFpr)})`,
    );
  } else {
    lines.push("후보 임계값: 없음(적격 threshold 없음)");
  }
  lines.push(`게이트: ${g.status === "pass" ? "통과" : "실패"}${g.reasons.length ? ` (${g.reasons.join(", ")})` : ""}`);
  lines.push(
    `기준선 적격: ${report.run.baselineEligible ? "예" : "아니오"}${
      report.run.baselineIneligibilityReasons.length
        ? ` (${report.run.baselineIneligibilityReasons.join(", ")})`
        : ""
    }`,
  );
  if (!report.run.baselineEligible) {
    lines.push("주의: 이 실행은 공식 기준선이 아닙니다.");
  }
  return lines.join("\n") + "\n";
}

main().catch((e) => {
  runtimeError(`예기치 못한 오류: ${(e as Error).message}`);
});
