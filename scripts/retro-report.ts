/**
 * specs/032 — 워크플로우 회고 진입점(얇은 IO). 계산은 src/retro-analysis.ts, 렌더는
 * src/retro-note.ts, 파일 쓰기는 src/retro-guard.ts(유일 쓰기 지점 — FR-7)만 쓴다.
 *
 * 사용: make retro (주기 등록: make retro-cron)
 *   RETRO_REPO=<git 저장소 경로>  회고 대상(기본: 현재 폴더)
 *   RETRO_DAYS=<일수>            집계 구간(기본 14)
 *
 * 주의: 회고 노트는 노트 폴더 reports/에 저장돼 검색·백업에 잡힌다(docs/agents.md §4 계열).
 * 회고는 제안까지만 — 규약·페르소나·스펙 개정은 사용자 결정 + SDD 스펙 경유(자기 개정 금지).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  parseCommits,
  extractOpenQuestions,
  collectDecisionNotes,
  isInsufficient,
  aggregateSelfReviewEvidence,
  type InventoryEntry,
  type SelfReviewEvidenceFile,
} from "../src/retro-analysis.js";
import { renderRetro, type RetroAggregate } from "../src/retro-note.js";
import { guardedWriteFileSync } from "../src/retro-guard.js";
import { analyze, readRecords } from "../src/query-analysis.js";
import { personaChat, resolvePersona } from "../src/agents/runtime.js";
import { listFolders } from "../src/brain.js";

const REPO = path.resolve(process.env.RETRO_REPO || process.cwd()); // 빈 문자열(make 경유)도 기본값으로
const DAYS = Math.max(1, Number(process.env.RETRO_DAYS || 14)); // 빈 문자열 → 14(make 경유 함정)
const LOG_PATH =
  process.env.QUERY_LOG ?? path.join(process.env.HOME ?? ".", ".localmind", "query-log.jsonl");

function gitLogSubjects(): { isGitRepo: boolean; text: string } {
  try {
    const text = execFileSync("git", ["-C", REPO, "log", `--since=${DAYS} days ago`, "--format=%s"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return { isGitRepo: true, text };
  } catch {
    return { isGitRepo: false, text: "" };
  }
}

function readSpecFiles(): { hasSpecsDir: boolean; files: { spec: string; text: string }[] } {
  const specsDir = path.join(REPO, "specs");
  if (!fs.existsSync(specsDir)) return { hasSpecsDir: false, files: [] };
  const files: { spec: string; text: string }[] = [];
  for (const d of fs.readdirSync(specsDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const p = path.join(specsDir, d.name, "spec.md");
    if (fs.existsSync(p)) files.push({ spec: d.name, text: fs.readFileSync(p, "utf8") });
  }
  return { hasSpecsDir: true, files };
}

/** specs 하위 각 폴더의 evidence/self-review-round N .md를 glob·읽어온다
 *  (specs/202607201808-critic-efficiency FR-6 — 집계 자체는 순수 함수라 여기서만 IO를 담당). */
function readSelfReviewEvidenceFiles(): SelfReviewEvidenceFile[] {
  const specsDir = path.join(REPO, "specs");
  if (!fs.existsSync(specsDir)) return [];
  const files: SelfReviewEvidenceFile[] = [];
  for (const d of fs.readdirSync(specsDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const evidenceDir = path.join(specsDir, d.name, "evidence");
    if (!fs.existsSync(evidenceDir)) continue;
    for (const ef of fs.readdirSync(evidenceDir, { withFileTypes: true })) {
      if (!ef.isFile() || !/^self-review-round.*\.md$/.test(ef.name)) continue;
      files.push({ spec: d.name, filename: ef.name, text: fs.readFileSync(path.join(evidenceDir, ef.name), "utf8") });
    }
  }
  return files;
}

function readNoteFiles(dir: string, out: { path: string; text: string }[], depth = 0): void {
  if (depth > 4 || !fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) readNoteFiles(p, out, depth + 1);
    else if (e.name.endsWith(".md")) {
      try {
        // frontmatter만 필요 — 앞부분만 읽어 대형 노트 비용 제한
        const fd = fs.openSync(p, "r");
        const buf = Buffer.alloc(32768); // 결정 노트의 후반 spec 포인터 유실 완화(codex 조언)
        const n = fs.readSync(fd, buf, 0, 32768, 0);
        fs.closeSync(fd);
        out.push({ path: p, text: buf.toString("utf8", 0, n) });
      } catch {
        /* 읽기 실패 노트는 건너뜀 */
      }
    }
  }
}

function inventory(dir: string): InventoryEntry[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith("."))
    .map((e) => ({ name: e.name, mtimeMs: fs.statSync(path.join(dir, e.name)).mtimeMs }));
}

async function main(): Promise<void> {
  const { isGitRepo, text } = gitLogSubjects();
  const commits = parseCommits(text);
  const { hasSpecsDir, files } = readSpecFiles();
  const oq = extractOpenQuestions(files).filter((q) => !q.resolved);

  const first = listFolders()[0];
  const noteFiles: { path: string; text: string }[] = [];
  readNoteFiles(first.dir, noteFiles);
  const decisions = collectDecisionNotes(noteFiles);

  const records = readRecords(LOG_PATH);
  const query = records ? analyze(records, { days: DAYS, minSamples: 10 }) : null;

  const selfReviewFiles = readSelfReviewEvidenceFiles();
  const selfReview = selfReviewFiles.length > 0 ? aggregateSelfReviewEvidence(selfReviewFiles) : null;

  const agg: RetroAggregate = {
    days: DAYS,
    repoLabel: path.basename(REPO),
    isGitRepo,
    commits,
    openQuestions: oq,
    hasSpecsDir,
    decisions,
    query,
    guides: inventory(path.join(first.dir, "guides")),
    projects: inventory(path.join(first.dir, "projects")),
    insufficient: isInsufficient(commits.total, decisions.length, query?.searches ?? 0),
    selfReview,
  };

  // 분석가 해석(017 위임 패턴) — 표본 부족이면 생략(personaChat 미호출, AC-8b)
  let interpretation: string | null = null;
  if (!agg.insufficient) {
    const analyst = resolvePersona("analyst");
    if (analyst) {
      const res = await personaChat(analyst, {
        user:
          `아래는 최근 ${DAYS}일 작업 방식 회고 집계다(커밋 패턴·스펙 cadence·미해결 OQ·결정 노트·검색 요약). ` +
          `반복 노동의 신호와 개선 제안을 간결한 마크다운(불릿, 300자 내외)으로 해석하라. ` +
          `제안은 제안일 뿐 — 규약 개정은 사용자 결정 + SDD 스펙 경유임을 전제하라.\n\n` +
          JSON.stringify(
            {
              commits: { total: agg.commits.total, byType: agg.commits.byType, specCadence: agg.commits.specCadence },
              unresolvedOpenQuestions: oq.length,
              decisions: decisions.map((d) => d.title),
              searches: query?.searches ?? 0,
              successRate: query?.successRate ?? null,
            },
            null,
            2,
          ),
        systemPrefix: "역할 제한: 지금은 작업 방식 회고 집계 해석만 한다. 수치에 근거해서만 말하라.",
        prefer: "claude",
        timeoutMs: Math.max(1000, Number(process.env.RETRO_TIMEOUT_MS ?? 60_000)),
      });
      interpretation = res?.text ?? null;
    }
  }

  const now = new Date();
  const reportsDir = path.join(first.dir, "reports");
  const file = path.join(reportsDir, `retro-${now.toISOString().slice(0, 10)}.md`);
  guardedWriteFileSync(reportsDir, file, renderRetro(agg, interpretation, now)); // 같은 날 재실행 = 갱신
  console.log(`📒 회고 저장: ${file}`);
  if (!isGitRepo) console.log(`ℹ ${agg.repoLabel}는 git 저장소가 아니에요 — 커밋 집계 없이 기록했습니다(RETRO_REPO로 대상 지정 가능).`);
  if (agg.insufficient) console.log("ℹ 표본 부족 — 해석 없이 집계만 기록했습니다.");
  console.log("ℹ 회고는 제안까지만 — 규약·페르소나 개정은 사용자 결정 + SDD 스펙 경유.");
}

main().catch((e) => {
  console.error(`회고 생성 실패: ${(e as Error).message}`);
  process.exit(1);
});
