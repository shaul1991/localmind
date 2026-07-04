/**
 * 페르소나 레지스트리 배포 CLI 진입점 — `make agents-deploy` / `npm run agents:deploy`.
 * MCP 도구(deploy_agents)와 동일한 로직(src/agents/deploy.ts)을 재사용한다.
 */
import { agentsDir } from "../src/agents/registry.js";
import { deployAgents, formatDeployResult } from "../src/agents/deploy.js";
import { seedAgents } from "../src/agents/seed.js";

// specs/026 FR-5 — 시드(fill-missing) 후 배포. 정본이 없는 파일만 templates에서 채우고
// 기존 정본은 절대 덮지 않는다(신규 설치 부트스트랩 — skills-deploy의 seed→deploy 대칭).
const seeded = seedAgents().filter((i) => i.status === "seeded");
if (seeded.length > 0) {
  console.log(`정본 시드(templates → 레지스트리): ${seeded.map((i) => i.name).join(", ")}`);
}
const result = deployAgents();
console.log(`🎭 페르소나 배포 (레지스트리: ${agentsDir()})`);
console.log(formatDeployResult(result));
// 정의에 문제가 있으면 실패로 알린다 — 스크립트·CI가 감지할 수 있게(self-review 경미-7)
if (result.problems.length > 0) process.exitCode = 1;
