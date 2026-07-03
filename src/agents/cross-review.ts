/**
 * SDD self-review의 codex 교차 검증 (specs/018 FR-2·3·4·7).
 *
 * 같은 critic 페르소나를 무대별 다른 트랜스포트로 부른다: 런타임(017)은 게이트웨이
 * (effort 자연 강등), SDD(018)는 `codex exec -p critic`(프로필 high + --output-schema
 * 강제) — 게이트웨이로는 스키마 강제도 high effort도 불가능해 runtime.ts와 별개다.
 *
 * 불변식: brain.ts를 import하지 않는다(순환 방지). 어떤 실패도 흐름을 막지 않는다 —
 * 폴백은 "skipped + 평이한 한국어 사유"이며, 017 런타임의 무음과 달리 **가시적**이다
 * (자기검증 단계에서 "교차 검증됨"으로 위장하면 안 되기 때문).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { z } from "zod";
import { defaultCodexHome } from "./deploy.js";
import { loadRegistry } from "./registry.js";

/** self-review 4범주(AGENTS.md 점검 범위와 1:1). */
export const FINDING_CATEGORIES = ["traceability", "coverage", "correctness", "simplicity-security"] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export interface Finding {
  category: FindingCategory;
  detail: string;
}
export interface CrossReviewVerdict {
  verdict: "pass" | "advise" | "block";
  blocking: Finding[];
  advisory: Finding[];
}
export interface CrossReviewResult extends Partial<CrossReviewVerdict> {
  status: "ok" | "skipped";
  /** skipped일 때 — 평이한 한국어 사유 */
  skipReason?: string;
  /** ok일 때 — 산출에 백엔드·모델이 드러난다(AC-1) */
  backend?: "codex";
  model?: string;
}

/** codex `--output-schema`에 넘기는 산출 계약(JSON Schema). blocking=수정 대상, advisory=조언. */
export const CROSS_REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: { type: "string", enum: ["pass", "advise", "block"] },
    blocking: { type: "array", items: { $ref: "#/$defs/finding" } },
    advisory: { type: "array", items: { $ref: "#/$defs/finding" } },
  },
  required: ["verdict", "blocking", "advisory"],
  $defs: {
    finding: {
      type: "object",
      additionalProperties: false,
      properties: {
        category: { type: "string", enum: [...FINDING_CATEGORIES] },
        detail: { type: "string" },
      },
      required: ["category", "detail"],
    },
  },
} as const;

const findingSchema = z.object({
  category: z.enum(FINDING_CATEGORIES),
  detail: z.string(),
});
const verdictSchema = z.object({
  verdict: z.enum(["pass", "advise", "block"]),
  blocking: z.array(findingSchema),
  advisory: z.array(findingSchema),
});

/** codex 산출을 해석·정규화한다. blocking이 비지 않으면 verdict=block로 보정.
 *  해석 불가는 null(호출부가 skipped 처리 — 흐름을 볼모로 잡지 않는다, FR-7). */
export function parseCrossReview(raw: string): CrossReviewVerdict | null {
  let json: unknown;
  try {
    json = JSON.parse(raw.trim());
  } catch {
    return null;
  }
  const r = verdictSchema.safeParse(json);
  if (!r.success) return null;
  const v = r.data;
  return { ...v, verdict: v.blocking.length > 0 ? "block" : v.verdict };
}

const CATEGORY_KO: Record<FindingCategory, string> = {
  traceability: "FR/AC 추적성",
  coverage: "테스트 커버리지",
  correctness: "정확성",
  "simplicity-security": "단순화·보안",
};

/** 사람이 읽는 병합용 마크다운 블록 — SKILL이 self-review 보고에 그대로 인용한다. */
export function renderCrossReview(r: CrossReviewResult): string {
  if (r.status === "skipped") {
    return (
      `ℹ codex 교차 검증 생략(${r.skipReason}) — Claude 단독 리뷰만 수행됨. ` +
      `교차 검증이 성립하지 않았음을 self-review 보고에 명시할 것.`
    );
  }
  const lines: string[] = [
    `## codex 교차 검증 (critic/${r.model ?? "codex"}) — 판정: ${r.verdict}`,
    "",
  ];
  const section = (title: string, items: Finding[] | undefined, empty: string) => {
    lines.push(`### ${title}`);
    if (!items?.length) lines.push(`- ${empty}`);
    else for (const f of items) lines.push(`- [${CATEGORY_KO[f.category]}] ${f.detail}`);
    lines.push("");
  };
  section("차단 결함 (blocking — 수정 후 재검 필요)", r.blocking, "없음");
  section("조언 (advisory — 보고만)", r.advisory, "없음");
  lines.push(
    "> 교차 모델의 추정이며 최종 판단은 사용자 몫. 이 검증이 거슬리면 SDD_CROSS_REVIEW=off 로 끌 수 있어요.",
  );
  return lines.join("\n");
}

function codexBin(): string {
  return process.env.CODEX_BIN?.trim() || "codex";
}

function skip(reason: string): CrossReviewResult {
  return { status: "skipped", skipReason: reason };
}

/** critic 프로필에서 모델명을 읽는다(표시용 — 없으면 undefined). */
function profileModel(profilePath: string): string | undefined {
  try {
    const m = fs.readFileSync(profilePath, "utf8").match(/^model\s*=\s*"([^"]+)"/m);
    return m?.[1];
  } catch {
    return undefined;
  }
}

/**
 * `codex exec -p critic --output-schema`로 교차 검증 1회를 수행한다(specs/018 FR-2).
 * 전제 미충족·실패·시간 초과는 모두 skipped(사유) — 절대 throw하지 않는다(FR-7).
 * spawnSync(동기)를 쓴다: 단일 목적 CLI 경로라 이벤트 루프 블록이 문제되지 않는다.
 */
export function runCrossReview(input: { prompt: string }): CrossReviewResult {
  // 어떤 동기 throw도 계약(비차단)을 깨지 못하게 전체를 흡수한다 — 잘못된 env 값,
  // tmpdir 쓰기 불가 등(Claude 크리틱이 NaN timeout → spawnSync RangeError 크래시를 실증).
  try {
    return runCrossReviewInner(input);
  } catch (e) {
    return skip(`내부 오류(${(e as Error).message})`);
  }
}

function runCrossReviewInner(input: { prompt: string }): CrossReviewResult {
  if ((process.env.SDD_CROSS_REVIEW ?? "").trim() === "off") return skip("비활성화(SDD_CROSS_REVIEW=off)");

  // 전제 1: codex 설치 여부 — 프로필보다 먼저(둘 다 없을 때 틀린 처방 방지, plan 전제 순서)
  const bin = codexBin();
  const probe = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 10_000 });
  if (probe.error || probe.status !== 0) return skip("codex 미설치 — codex CLI를 설치하세요");

  // 전제 2: 레지스트리에 critic이 있는가 — 레지스트리에서 지웠는데 낡은 배포 프로필이
  // 남아 있으면 교차가 몰래 계속 돈다(첫 도그푸드에서 codex 크리틱이 잡은 차단 결함).
  // 레지스트리 자체가 비어 있으면(부트스트랩·다른 기기) 프로필 확인으로 폴백한다.
  try {
    const reg = loadRegistry();
    if (reg.personas.length > 0 && !reg.personas.some((p) => p.name === "critic")) {
      return skip("critic 페르소나가 레지스트리에 없음 — 정의 후 'make agents-deploy'");
    }
  } catch {
    /* 레지스트리 접근 불가 — 프로필 확인으로 진행 */
  }

  // 전제 3: critic 프로필 — 원인은 미배포일 수도, 레지스트리에 정의가 없는 것일 수도 있다
  const profilePath = path.join(defaultCodexHome(), "critic.config.toml");
  if (!fs.existsSync(profilePath)) {
    return skip("critic 프로필을 찾을 수 없음 — 레지스트리에 critic 정의가 있는지 확인 후 'make agents-deploy'");
  }

  // tmp 파일 — pid+랜덤 접미사로 병렬 경합 방지(크리틱 리뷰 경미-4)
  const suffix = `${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
  const tmpSchema = path.join(os.tmpdir(), `localmind-cross-review-schema-${suffix}.json`);
  const tmpOut = path.join(os.tmpdir(), `localmind-cross-review-out-${suffix}.json`);
  // 기본 300s — 도그푸드 실측(2026-07-03): 콤팩트 프롬프트(AC+파일 1개)도 high effort로
  // ~226s. 대형 diff는 그 이상 — 스킬이 관련 diff만 조립하도록 지침에 명시.
  // 비숫자·0·음수 env는 기본값으로 폴백 — NaN이 spawnSync에 닿으면 throw한다(회귀).
  const rawTimeout = Number(process.env.SDD_CROSS_REVIEW_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0 ? Math.max(1000, Math.floor(rawTimeout)) : 300_000;

  try {
    fs.writeFileSync(tmpSchema, JSON.stringify(CROSS_REVIEW_SCHEMA));
    const res = spawnSync(
      bin,
      [
        "exec",
        "-p", "critic",
        "--output-schema", tmpSchema,
        "-o", tmpOut,
        "--skip-git-repo-check",
        "-s", "read-only",
        "-c", 'approval_policy="never"',
        "-", // 프롬프트는 stdin
      ],
      // maxBuffer: 실 codex의 stdout/stderr 로그가 기본 1MB를 넘으면 spurious 실패 —
      // 결과는 -o 파일로 받으므로 버퍼는 여유만 확보(크리틱 리뷰 관측 반영)
      { input: input.prompt, encoding: "utf8", timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 },
    );
    if (res.error) {
      const timedOut = (res.error as NodeJS.ErrnoException).code === "ETIMEDOUT" || res.signal === "SIGTERM";
      return skip(timedOut ? "시간 초과" : `호출 실패(${res.error.message})`);
    }
    if (res.signal) return skip("시간 초과");
    if (res.status !== 0) return skip(`호출 실패(exit ${res.status})`);

    let raw: string;
    try {
      raw = fs.readFileSync(tmpOut, "utf8");
    } catch {
      return skip("교차 검증 결과 해석 실패(산출 파일 없음)");
    }
    const verdict = parseCrossReview(raw);
    if (!verdict) return skip("교차 검증 결과 해석 실패");
    return { status: "ok", backend: "codex", model: profileModel(profilePath), ...verdict };
  } finally {
    for (const f of [tmpSchema, tmpOut]) fs.rmSync(f, { force: true });
  }
}
