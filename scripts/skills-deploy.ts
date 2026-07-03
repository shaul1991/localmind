/**
 * 스킬 정본 시드·배포 CLI 진입점 — `make skills-deploy` (specs/018 FR-8).
 * seed(패키지 동봉 정본 → 데이터 폴더) 후 deploy(데이터 폴더 → Claude Code)를 수행한다.
 */
import { deploySkills, formatSkillsResult, seedSkills, skillsDir } from "../src/agents/skills.js";

console.log(`🧩 스킬 배포 (정본: ${skillsDir()})`);
console.log(formatSkillsResult("정본 시드(templates → 데이터 폴더)", seedSkills()));
console.log(formatSkillsResult("Claude Code 배포(데이터 폴더 → ~/.claude/skills)", deploySkills()));
