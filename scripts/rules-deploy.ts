/**
 * 규칙 배포 CLI 진입점 — `make rules-deploy` / `npm run rules:deploy` (specs/041).
 *
 * 기본: 글로벌 표면(Claude·Codex) 배포. cwd가 git 저장소면 그 repo 표면(AGENTS.md +
 * CLAUDE.md 스텁)도 배포한다(cwd in-place — 기기별 경로 맵 불필요, D5). `--no-repo`로 글로벌만.
 * 배포는 로컬 작업이다(원격 MCP whoami의 /root 경로 발산 회피).
 */
import fs from "node:fs";
import path from "node:path";
import { rulesDir } from "../src/rules/registry.js";
import { deployRules, formatRulesResult } from "../src/rules/deploy.js";

const noRepo = process.argv.includes("--no-repo");
const cwd = process.cwd();
const isRepo = fs.existsSync(path.join(cwd, ".git"));
const repoDir = !noRepo && isRepo ? cwd : undefined;

const result = deployRules({ repoDir });
console.log(`📐 규칙 배포 (정본: ${rulesDir()})`);
if (repoDir) console.log(`   repo 표면: ${repoDir}`);
else if (!noRepo && !isRepo) console.log("   (cwd가 git 저장소가 아니라 글로벌만 배포)");
console.log(formatRulesResult(result));
if (result.problems.length > 0) process.exitCode = 1;
