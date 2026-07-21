/**
 * specs/019 FR-1 — 자산 정본 폴더 판정을 셸에 노출한다.
 * great-reduction(2026-07-21): agents/skills 모듈이 sdd-toolkit으로 이전돼 판정 로직을
 * 여기 자립형으로 보유한다(동일 의미 — env override → NOTES_DIR 첫 폴더 하위 기본).
 * 데이터 정본(~/.localmind/{agents,skills})은 계속 존재하므로 백업 대상도 불변이다.
 *
 *   NOTES_DIR=... node --import tsx/esm scripts/asset-dirs.ts
 *
 * 출력(줄 단위 key=value):
 *   agents=<경로> / skills=<경로> — 판정된 정본 폴더
 *   agents_override=0|1 / skills_override=0|1 — 재지정 변수 사용 여부
 *     (0이면 판정에 NOTES_DIR가 쓰였다 — 후퇴 가드의 적용 대상, spec 공통 가드 원칙)
 */
import path from "node:path";

function expandHome(p: string): string {
  return p.startsWith("~") ? path.join(process.env.HOME ?? ".", p.slice(1)) : p;
}

/** 첫 노트 폴더(NOTES_DIR 첫 항목, 라벨 표기 허용) — agents/·skills/ 정본의 기준 경로. */
function firstNotesDir(): string {
  const notesRaw = process.env.NOTES_DIR?.trim();
  if (notesRaw) {
    const first = notesRaw.split(",")[0]?.trim();
    if (first) {
      const eq = first.indexOf("=");
      return path.resolve(expandHome(eq > 0 ? first.slice(eq + 1).trim() : first));
    }
  }
  return path.resolve(path.join(process.env.HOME ?? ".", ".localmind"));
}

function fromEnv(name: string, fallback: () => string): string {
  const env = process.env[name]?.trim();
  return env ? path.resolve(expandHome(env)) : fallback();
}

const agentsDir = fromEnv("LOCALMIND_AGENTS_DIR", () => path.join(firstNotesDir(), "agents"));
const skillsDir = fromEnv("LOCALMIND_SKILLS_DIR", () => path.join(firstNotesDir(), "skills"));

console.log(`agents=${agentsDir}`);
console.log(`skills=${skillsDir}`);
console.log(`agents_override=${process.env.LOCALMIND_AGENTS_DIR?.trim() ? 1 : 0}`);
console.log(`skills_override=${process.env.LOCALMIND_SKILLS_DIR?.trim() ? 1 : 0}`);
// 배포 target 경로(셸 lifecycle의 marker 검증용).
console.log(`claude_skills=${fromEnv("LOCALMIND_CLAUDE_SKILLS_DIR", () => path.join(process.env.HOME ?? ".", ".claude", "skills"))}`);
console.log(`agent_skills=${fromEnv("LOCALMIND_AGENT_SKILLS_DIR", () => path.join(process.env.HOME ?? ".", ".agents", "skills"))}`);
console.log(`gemini_commands=${fromEnv("LOCALMIND_GEMINI_COMMANDS_DIR", () => path.join(process.env.HOME ?? ".", ".gemini", "commands"))}`);
