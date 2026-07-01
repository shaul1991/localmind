/**
 * SDD 작업 흐름(AGENTS.md + goal/spec/plan 템플릿)을 지정한 프로젝트 디렉토리에 심는다.
 * localmind 밖의 어떤 프로젝트에도 쓸 수 있다. 기존 파일은 덮어쓰지 않는다.
 *
 *   npm run init-sdd -- <대상경로>
 *   make init-sdd DIR=<대상경로>
 */
import path from "node:path";
import { formatScaffoldResult, scaffoldSdd } from "../src/scaffold.js";

function main(): void {
  const dir = process.argv[2];
  if (!dir) {
    console.error("사용법: make init-sdd DIR=<대상경로>  (또는 npm run init-sdd -- <대상경로>)");
    process.exit(1);
  }
  // 이 스크립트는 사람이 직접 실행하는 짧은 프로세스라 cwd가 곧 사용자의 실제
  // 작업 위치다 — 상대경로는 여기(호출 시점의 cwd) 기준으로 절대경로로 변환한다.
  // (scaffoldSdd()는 장수명 MCP 프로세스의 cwd 모호성을 막기 위해 절대경로만 받는다.)
  const absDir = path.resolve(process.cwd(), dir);
  const result = scaffoldSdd(absDir);
  console.log(formatScaffoldResult(result));
}

main();
