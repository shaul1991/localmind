/**
 * 페르소나/모델 바인딩 계약 — 파싱·검증·resolve·merge (specs/050 Phase 1).
 *
 * 정본은 `<데이터 폴더>/_bindings/<runtime-id>.json` 파일 하나 = 런타임(설치) 하나. 이 모듈은
 * 소비 규약(051이 스킬 본문에 반영)의 결정적 특성화(순수 함수) — 런타임 실행 경로가 아니라
 * 테스트·후속 도구의 근거다(plan DDD 경계, 044 evaluateActivation 선례).
 *
 * 의존은 registry.ts만(페르소나 이름 검증·모델 형식 재사용) — skills.ts/config.ts는 참조하지
 * 않는다(plan "의존 방향").
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { firstNotesDir, MODEL_RE, MODEL_MSG } from "./registry.js";

export const TIER_KEYS = ["critical-reasoning", "standard", "economy"] as const;
export type TierKey = (typeof TIER_KEYS)[number];

export interface TierEntry {
  model: string;
}
export interface RoleEntry {
  persona: string;
  tier: TierKey;
}
export interface Binding {
  schemaVersion: 1;
  runtime: string;
  updatedAt: string;
  tiers: Partial<Record<TierKey, TierEntry>>;
  roles: Record<string, RoleEntry>;
}

/** 바인딩 정본 위치 = 첫 노트 폴더 아래 `_bindings/`(F-1). backup gitignore 시드가 격리한다(I-1). */
export function bindingsDir(): string {
  return path.join(firstNotesDir(), "_bindings");
}

const tierEntrySchema = z.object({
  model: z.string().min(1, "model이 비어 있습니다").regex(MODEL_RE, MODEL_MSG),
});
const roleEntrySchema = z.object({
  persona: z.string().min(1, "persona가 비어 있습니다"),
  tier: z.enum(TIER_KEYS),
});
const bindingSchema = z.object({
  schemaVersion: z.literal(1),
  runtime: z.string().min(1, "runtime이 비어 있습니다"),
  updatedAt: z.string().min(1, "updatedAt이 비어 있습니다"),
  tiers: z.record(z.string(), tierEntrySchema).default({}),
  roles: z.record(z.string(), roleEntrySchema).default({}),
});

export interface ValidationIssue {
  path: string;
  message: string;
}
export interface ValidateBindingResult {
  valid: boolean;
  errors: ValidationIssue[];
  /** valid일 때만 채워진다 — 무효 바인딩은 저장 금지(I-4)를 타입으로도 강제 */
  binding: Binding | null;
  /** personaNames가 비어 레지스트리가 없어(AC-8) 페르소나 존재 검증 단계를 건너뛰었는지 */
  rolesSkipped: boolean;
}

/**
 * 바인딩 원본을 검증한다. personaNames가 비어 있으면(빈 레지스트리, F-2 규약 재사용) 역할→
 * 페르소나 존재 검증만 건너뛴다(rolesSkipped) — tiers 검증은 그대로 수행한다(AC-8).
 */
export function validateBinding(raw: unknown, personaNames: string[]): ValidateBindingResult {
  const rolesSkipped = personaNames.length === 0;
  const parsed = bindingSchema.safeParse(raw);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      path: issue.path.join(".") || "(root)",
      message: issue.message,
    }));
    return { valid: false, errors, binding: null, rolesSkipped };
  }

  const data = parsed.data;
  const errors: ValidationIssue[] = [];

  // I-8: tiers의 미지 등급 키는 오류(roles.<role>.tier는 위 z.enum이 이미 강제).
  for (const key of Object.keys(data.tiers)) {
    if (!(TIER_KEYS as readonly string[]).includes(key)) {
      errors.push({
        path: `tiers.${key}`,
        message: `알 수 없는 실행 등급입니다: "${key}" — critical-reasoning/standard/economy만 지원합니다`,
      });
    }
  }

  // FR-7①·I-4: 레지스트리 밖 페르소나명은 저장 불가(빈 레지스트리면 건너뜀 — AC-8).
  if (!rolesSkipped) {
    for (const [role, entry] of Object.entries(data.roles)) {
      if (!personaNames.includes(entry.persona)) {
        errors.push({
          path: `roles.${role}.persona`,
          message: `레지스트리에 없는 페르소나입니다: "${entry.persona}" — 다시 선택하세요`,
        });
      }
    }
  }

  const valid = errors.length === 0;
  return { valid, errors, binding: valid ? (data as Binding) : null, rolesSkipped };
}

export type LoadBindingResult =
  | { found: true; binding: Binding }
  | { found: false; existingFiles: string[] };

function listBindingFiles(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".json"))
      .sort();
  } catch {
    return [];
  }
}

/**
 * 자기 runtime-id와 정확히 일치하는 파일만 읽는다(I-5) — 다른 런타임 파일 대독 금지. 부재·
 * 손상 시 throw하지 않고(I-6) 기존 파일 목록을 함께 반환해 소비자가 부재 규칙을 적용하게 한다.
 * personaNames를 모르는 소비 시점이라 구조 검증만 하고(페르소나 존재는 저장 시점 몫 — I-4),
 * 구조가 무효면 부재와 동일하게 취급한다.
 */
export function loadBinding(runtimeId: string, dir: string = bindingsDir()): LoadBindingResult {
  const file = path.join(dir, `${runtimeId}.json`);
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return { found: false, existingFiles: listBindingFiles(dir) };
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { found: false, existingFiles: listBindingFiles(dir) };
  }

  const result = validateBinding(json, []);
  if (!result.binding) {
    return { found: false, existingFiles: listBindingFiles(dir) };
  }
  return { found: true, binding: result.binding };
}

export type ResolveTierResult =
  | { ok: true; tier: TierKey; model: string }
  | { ok: false; tier: TierKey; reason: string };

/** 미설정 tier는 throw 대신 부재 사유를 반환한다(I-6) — 바인딩 자체가 없어도(undefined) 동일. */
export function resolveTier(binding: Binding | undefined, tier: TierKey): ResolveTierResult {
  const entry = binding?.tiers?.[tier];
  if (!entry) {
    return {
      ok: false,
      tier,
      reason: `실행 등급 "${tier}"에 대한 모델이 설정되지 않았습니다 — 온보딩(localmind-binding)으로 설정하세요`,
    };
  }
  return { ok: true, tier, model: entry.model };
}

export type ResolveRoleResult =
  | { ok: true; role: string; persona: string; tier: TierKey; model: string }
  | { ok: false; role: string; reason: string };

/** role → {persona, tier} → tiers[tier].model 순으로 해석한다(D-3). 미설정은 부재 사유 반환(I-6). */
export function resolveRole(binding: Binding | undefined, role: string): ResolveRoleResult {
  const entry = binding?.roles?.[role];
  if (!entry) {
    return {
      ok: false,
      role,
      reason: `역할 "${role}"에 대한 페르소나가 설정되지 않았습니다 — 온보딩(localmind-binding)으로 설정하세요`,
    };
  }
  const tierResult = resolveTier(binding, entry.tier);
  if (!tierResult.ok) {
    return {
      ok: false,
      role,
      reason: `역할 "${role}"의 실행 등급 "${entry.tier}"에 대한 모델이 설정되지 않았습니다 — 온보딩(localmind-binding)으로 설정하세요`,
    };
  }
  return { ok: true, role, persona: entry.persona, tier: entry.tier, model: tierResult.model };
}

export interface BindingPatch {
  runtime?: string;
  updatedAt?: string;
  tiers?: Partial<Record<TierKey, TierEntry>>;
  roles?: Record<string, RoleEntry>;
}

/**
 * 기존 바인딩에 patch를 적용한다 — patch가 건드리지 않은 tiers/roles 키는 보존(AC-2, D-6:
 * 재설정은 항목 선택 수정이 기본). 기존 바인딩이 없으면(최초 설정) patch만으로 만든다.
 */
export function mergeBinding(existing: Binding | undefined, patch: BindingPatch): Binding {
  return {
    schemaVersion: 1,
    runtime: patch.runtime ?? existing?.runtime ?? "",
    updatedAt: patch.updatedAt ?? existing?.updatedAt ?? "",
    tiers: { ...(existing?.tiers ?? {}), ...(patch.tiers ?? {}) },
    roles: { ...(existing?.roles ?? {}), ...(patch.roles ?? {}) },
  };
}
