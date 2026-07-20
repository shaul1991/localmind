/**
 * specs/202607201808-critic-efficiency FR-3 — review-preflight 얇은 IO 진입점. spec 폴더 경로를
 * 인자로 받아 spec.md·plan.md·evidence/*.md를 읽고 `git diff --check`를 실행해 순수 검사 모듈
 * (src/review-preflight.ts)의 runPreflight에 넘긴다. 판단 로직은 전부 src/review-preflight.ts에
 * 있다 — 여기는 파일 읽기·git 실행·출력·exit code만 담당한다(004/017/032의 3분할 관례).
 *
 * 사용: npm run review:preflight -- <spec 폴더 경로>
 *   예: npm run review:preflight -- specs/202607201808-critic-efficiency
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { runPreflight, type EvidenceFile } from "../src/review-preflight.js";

function readEvidenceFiles(specDir: string): EvidenceFile[] {
  const evidenceDir = path.join(specDir, "evidence");
  if (!fs.existsSync(evidenceDir)) return [];
  return fs
    .readdirSync(evidenceDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => {
      const p = path.join(evidenceDir, e.name);
      return { path: p, body: fs.readFileSync(p, "utf8") };
    });
}

/** `git diff --check`(공백 오류·EOF 개행)를 실행한다. 위반이 있으면 비0 exit이지만 출력만 수집한다. */
function gitDiffCheck(): string {
  try {
    return execFileSync("git", ["diff", "--check"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    const err = e as { stdout?: string };
    return err.stdout ?? "";
  }
}

function main(): void {
  const specArg = process.argv[2];
  if (!specArg) {
    console.error("사용법: npm run review:preflight -- <spec 폴더 경로>");
    process.exit(1);
  }
  const specDir = path.resolve(specArg);
  const specId = path.basename(specDir);

  const specMdPath = path.join(specDir, "spec.md");
  const planMdPath = path.join(specDir, "plan.md");
  if (!fs.existsSync(specMdPath) || !fs.existsSync(planMdPath)) {
    console.error(`spec.md 또는 plan.md를 찾을 수 없습니다: ${specDir}`);
    process.exit(1);
  }

  const result = runPreflight({
    specId,
    evidenceFiles: readEvidenceFiles(specDir),
    diffCheckOutput: gitDiffCheck(),
    specMdText: fs.readFileSync(specMdPath, "utf8"),
    planMdText: fs.readFileSync(planMdPath, "utf8"),
  });

  if (result.ok) {
    console.log(`✅ preflight 통과: ${specId} (위반 없음)`);
    console.log("ℹ preflight 통과는 critic 시작의 전제일 뿐 AC green의 근거가 아닙니다.");
    process.exit(0);
  }

  console.error(`❌ preflight 위반 ${result.violations.length}건: ${specId}`);
  for (const v of result.violations) {
    const loc = v.file ? ` [${v.file}]` : "";
    console.error(`- (${v.check})${loc} ${v.detail}`);
  }
  process.exit(1);
}

main();
