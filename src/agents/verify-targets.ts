/**
 * 배포 target별 결정적 검증 (specs/044 R4-05 — device-sync 수신·lifecycle 검증의 단일 소스).
 *
 * 셸이 target 가용성·경로·소유권·marker 규칙을 재구현하지 않도록, 여기서 판정만 노출한다.
 * 규칙(FR-11/FR-12, AC-17):
 *  - 공용 Agent Skills(.agents/skills)는 명시 배포의 기본 필수 target이다.
 *  - Claude/Gemini는 런타임 부모가 존재하거나 명시 override가 있으면 available로 본다.
 *  - Claude/공용은 각 이름 결합 skill marker + deny-implicit workflow의 target별 정책 metadata를 요구한다.
 *  - Gemini는 파일 존재가 아니라 각 이름 결합 command marker를 요구한다.
 *  - resolver(정본 패키지) 실패는 검증 실패다. unavailable은 missing/corrupt와 구분한다.
 *  - 메시지는 평이한 한국어로 실패 target·logical ID를 밝힌다.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkillRegistry, hasSkillMarker, hasCommandMarker, splitFrontmatter, type SkillPackage } from "./skill-contract.js";
import { wrapperSelfContained } from "./commands.js";
import { isDenyImplicit } from "./workflow-policy.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(MODULE_DIR, "..", "..", "templates", "skills");

export type VerifyTargetId = "agent-skill" | "claude-skill" | "gemini-command";
export type VerifyStatus = "ok" | "unavailable" | "failed";

export interface TargetVerification {
  target: VerifyTargetId;
  status: VerifyStatus;
  /** status "failed"일 때 실패 사유(logical ID 포함, 평이한 한국어). */
  failures: string[];
}

export interface VerifyReport {
  /** available target이 모두 ok이고 정본 패키지·resolver 실패가 없으면 true. */
  ok: boolean;
  targets: TargetVerification[];
  problems: string[];
}

export interface VerifyOptions {
  templatesDir?: string;
  agentSkillsDir: string;
  claudeSkillsDir: string;
  geminiCommandsDir: string;
  /** 명시 override가 있으면 부모 부재여도 available(deploy 가용성 판정과 대칭). */
  claudeOverride?: boolean;
  geminiOverride?: boolean;
}

function dirExists(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** skill-directory target(claude/agent)의 각 workflow marker + deny-implicit 정책 metadata를 검증한다. */
function verifySkillDirTarget(target: "agent-skill" | "claude-skill", dir: string, skills: SkillPackage[]): TargetVerification {
  const failures: string[] = [];
  for (const s of skills) {
    const md = path.join(dir, s.name, "SKILL.md");
    let text: string;
    try {
      text = fs.readFileSync(md, "utf8");
    } catch {
      failures.push(`${s.name}: SKILL.md 없음`);
      continue;
    }
    if (!hasSkillMarker(text, s.name)) {
      failures.push(`${s.name}: 이름 결합 marker 없음`);
      continue;
    }
    // deny-implicit workflow는 target별 정책 metadata까지 확인한다.
    if (s.policy && isDenyImplicit(s.policy)) {
      if (target === "claude-skill") {
        const fm = splitFrontmatter(text);
        const fmText = "error" in fm ? "" : fm.fm;
        if (!/^disable-model-invocation\s*:\s*true\s*$/m.test(fmText)) failures.push(`${s.name}: Claude deny-implicit 정책(disable-model-invocation) 누락`);
      } else {
        let yaml = "";
        try {
          yaml = fs.readFileSync(path.join(dir, s.name, "agents", "openai.yaml"), "utf8");
        } catch {
          /* 아래 정규식에서 실패 처리 */
        }
        if (!/allow_implicit_invocation:\s*false/.test(yaml)) failures.push(`${s.name}: 공용 deny-implicit 정책(openai.yaml) 누락`);
      }
    }
  }
  return { target, status: failures.length ? "failed" : "ok", failures };
}

/** Gemini command target의 wrapper-eligible workflow marker를 검증한다(존재만으로 통과 금지). */
function verifyGeminiTarget(dir: string, skills: SkillPackage[]): TargetVerification {
  const failures: string[] = [];
  for (const s of skills.filter(wrapperSelfContained)) {
    const toml = path.join(dir, `${s.name}.toml`);
    let text: string;
    try {
      text = fs.readFileSync(toml, "utf8");
    } catch {
      failures.push(`${s.name}: 명령 파일 없음`);
      continue;
    }
    if (!hasCommandMarker(text, s.name)) failures.push(`${s.name}: 이름 결합 command marker 없음`);
  }
  return { target: "gemini-command", status: failures.length ? "failed" : "ok", failures };
}

/** 정본 packaged workflow 기준으로 available target을 모두 검증한다. */
export function verifyDeployedTargets(o: VerifyOptions): VerifyReport {
  const templatesDir = o.templatesDir ?? TEMPLATES_DIR;
  const reg = loadSkillRegistry(templatesDir, { packaged: true });
  if (reg.problems.length > 0) {
    // 정본 패키지/resolver 실패 → 검증 실패(신뢰 근거 없음). unavailable과 구분되는 corrupt다.
    return { ok: false, targets: [], problems: reg.problems.map((p) => `정본 패키지 문제: ${p.nameOrPath} — ${p.reason}`) };
  }
  const skills = reg.skills;
  const targets: TargetVerification[] = [];

  // 공용 Agent Skills — 명시 배포의 기본 필수 target(항상 검증).
  targets.push(verifySkillDirTarget("agent-skill", o.agentSkillsDir, skills));

  // Claude — 부모 존재 또는 override면 available.
  if (o.claudeOverride || dirExists(path.dirname(o.claudeSkillsDir))) {
    targets.push(verifySkillDirTarget("claude-skill", o.claudeSkillsDir, skills));
  } else {
    targets.push({ target: "claude-skill", status: "unavailable", failures: [] });
  }

  // Gemini — 부모 존재 또는 override면 available.
  if (o.geminiOverride || dirExists(path.dirname(o.geminiCommandsDir))) {
    targets.push(verifyGeminiTarget(o.geminiCommandsDir, skills));
  } else {
    targets.push({ target: "gemini-command", status: "unavailable", failures: [] });
  }

  return { ok: targets.every((t) => t.status !== "failed"), targets, problems: [] };
}

const TARGET_LABEL: Record<VerifyTargetId, string> = {
  "agent-skill": "공용(.agents) 스킬",
  "claude-skill": "Claude Code 스킬",
  "gemini-command": "Gemini 명령",
};

/** 사람이 읽는 검증 요약(평이한 한국어). */
export function formatVerifyReport(r: VerifyReport): string {
  const lines: string[] = [];
  for (const p of r.problems) lines.push(`  ✗ ${p}`);
  for (const t of r.targets) {
    if (t.status === "ok") lines.push(`  ✓ ${TARGET_LABEL[t.target]}: 검증 통과`);
    else if (t.status === "unavailable") lines.push(`  - ${TARGET_LABEL[t.target]}: 런타임 미설치(검증 생략)`);
    else lines.push(`  ✗ ${TARGET_LABEL[t.target]}: 검증 실패 — ${t.failures.join(", ")}`);
  }
  return lines.join("\n");
}
