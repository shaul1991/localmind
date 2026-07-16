/**
 * specs/044 R4-05 — 배포 target별 marker·정책 검증 CLI(device-sync 수신 워커가 호출).
 *
 *   node --import tsx/esm scripts/verify-targets.ts
 *
 * 판정의 단일 소스는 TS(verify-targets)다 — 셸이 규칙을 재구현하지 않는다. 종료: 0 모든 available
 * target 통과, 1 하나라도 실패 또는 정본 패키지/resolver 실패. unavailable target은 실패가 아니다.
 */
import { verifyDeployedTargets, formatVerifyReport } from "../src/agents/verify-targets.js";
import { claudeSkillsDir, agentSkillsDir, geminiCommandsDir } from "../src/agents/skills.js";

const report = verifyDeployedTargets({
  agentSkillsDir: agentSkillsDir(),
  claudeSkillsDir: claudeSkillsDir(),
  geminiCommandsDir: geminiCommandsDir(),
  claudeOverride: !!process.env.LOCALMIND_CLAUDE_SKILLS_DIR?.trim(),
  geminiOverride: !!process.env.LOCALMIND_GEMINI_COMMANDS_DIR?.trim(),
});

console.log(formatVerifyReport(report));
process.exit(report.ok ? 0 : 1);
