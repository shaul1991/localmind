/**
 * 워크플로 자산 시드·다중 target 배포 CLI 진입점 — `make skills-deploy` (specs/044, 018 FR-8 계승).
 * seed(패키지 동봉 정본 → 데이터 폴더) 후 deploy(데이터 폴더 → Claude skill·공용 .agents skill·
 * Gemini command)를 수행하고, target별 상태·논리 ID·runtime 호출을 평이한 한국어로 요약한다.
 * exit code는 배포 결과(success/partial=0, failed=1)를 따른다.
 */
import { runSkillsDeploy, formatSeedResult, formatDeployResult, skillsDir } from "../src/agents/skills.js";

console.log(`🧩 워크플로 자산 배포 (정본: ${skillsDir()})`);
const { seed, deploy } = runSkillsDeploy();
console.log(formatSeedResult(seed));
console.log(formatDeployResult(deploy));
process.exit(deploy.exitCode);
