/**
 * specs/019 FR-1 — 자산 정본 폴더 판정을 셸에 노출한다.
 * 판정의 단일 소스는 TS(registry.agentsDir/skills.skillsDir) — 셸이 재구현하면
 * LOCALMIND_AGENTS_DIR/SKILLS_DIR·라벨 파싱 규칙이 갈라지므로 여기서 조회만 한다.
 *
 *   NOTES_DIR=... node --import tsx/esm scripts/asset-dirs.ts
 *
 * 출력(줄 단위 key=value):
 *   agents=<경로> / skills=<경로> — 판정된 정본 폴더
 *   agents_override=0|1 / skills_override=0|1 — 재지정 변수 사용 여부
 *     (0이면 판정에 NOTES_DIR가 쓰였다 — 후퇴 가드의 적용 대상, spec 공통 가드 원칙)
 */
import { agentsDir } from "../src/agents/registry.js";
import { skillsDir } from "../src/agents/skills.js";

console.log(`agents=${agentsDir()}`);
console.log(`skills=${skillsDir()}`);
console.log(`agents_override=${process.env.LOCALMIND_AGENTS_DIR?.trim() ? 1 : 0}`);
console.log(`skills_override=${process.env.LOCALMIND_SKILLS_DIR?.trim() ? 1 : 0}`);
