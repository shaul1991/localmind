/**
 * agents/binding.ts 단위 테스트 — 바인딩 계약(파싱·검증·resolve·merge) (specs/050 Phase 1).
 * 순수 함수 + 파일 IO라 임베딩/게이트웨이 불필요. AC 1:1 매핑(plan "테스트 전략" 표).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import {
  validateBinding,
  resolveTier,
  resolveRole,
  mergeBinding,
  loadBinding,
  type Binding,
} from "./binding.js";

function tmpBindingsDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "localmind-bindings-"));
}

const FULL_BINDING = {
  schemaVersion: 1,
  runtime: "claude-code",
  updatedAt: "2026-07-17",
  tiers: {
    "critical-reasoning": { model: "model-a" },
    standard: { model: "model-b" },
    economy: { model: "model-c" },
  },
  roles: {
    critic: { persona: "critic", tier: "critical-reasoning" },
  },
};

const PERSONA_NAMES = ["critic", "worker", "architect"];

describe("validateBinding — 검증 (AC-6·7·8·9, I-8)", () => {
  it("AC-6: tiers 1개·roles 1개만 있는 부분 바인딩도 유효 판정한다 — 핀: 전체 무효화하면 실패", () => {
    const partial = {
      schemaVersion: 1,
      runtime: "claude-code",
      updatedAt: "2026-07-17",
      tiers: { standard: { model: "model-b" } },
      roles: { critic: { persona: "critic", tier: "standard" } },
    };
    const result = validateBinding(partial, PERSONA_NAMES);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.ok(result.binding);
    assert.deepEqual(Object.keys(result.binding!.tiers), ["standard"]);
    assert.deepEqual(Object.keys(result.binding!.roles), ["critic"]);
  });

  it("AC-7: 레지스트리 밖 페르소나명은 저장 불가 오류를 반환한다 — 핀: 무효를 유효 판정하면 실패", () => {
    const invalid = {
      ...FULL_BINDING,
      roles: { critic: { persona: "no-such-persona", tier: "critical-reasoning" } },
    };
    const result = validateBinding(invalid, PERSONA_NAMES);
    assert.equal(result.valid, false);
    assert.equal(result.binding, null);
    assert.ok(result.errors.some((e) => e.path === "roles.critic.persona"));
  });

  it("AC-8: 빈 personaNames — tiers 검증은 정상, roles 단계는 건너뜀 판정(F-2 규약 재사용)", () => {
    const raw = {
      ...FULL_BINDING,
      roles: { critic: { persona: "whatever-not-checked", tier: "critical-reasoning" } },
    };
    const result = validateBinding(raw, []);
    assert.equal(result.rolesSkipped, true);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  });

  it("AC-9: 추천 밖 자유 모델 식별자(F-12 형식 내)는 저장 허용한다", () => {
    const raw = {
      ...FULL_BINDING,
      tiers: { standard: { model: "my-custom-vendor/model-2099:v3" } },
    };
    const result = validateBinding(raw, PERSONA_NAMES);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  });

  it("AC-9: F-12 형식 위반 문자(공백·따옴표)는 거부한다", () => {
    const raw = {
      ...FULL_BINDING,
      tiers: { standard: { model: 'bad model "quoted"' } },
    };
    const result = validateBinding(raw, PERSONA_NAMES);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.path === "tiers.standard.model"));
  });

  it("I-8: 미지 tier 키(예: ultra)는 오류다", () => {
    const raw = {
      ...FULL_BINDING,
      tiers: { ultra: { model: "model-x" } },
    };
    const result = validateBinding(raw, PERSONA_NAMES);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.path === "tiers.ultra"));
  });

  it("I-8: 임의 role 키는 허용한다(스키마가 역할 집합을 고정하지 않음)", () => {
    const raw = {
      ...FULL_BINDING,
      roles: { "totally-custom-role-051": { persona: "worker", tier: "standard" } },
    };
    const result = validateBinding(raw, PERSONA_NAMES);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  });
});

describe("resolveTier / resolveRole — 부재 사유 반환(I-6, AC-3) · D-3 해석 경로", () => {
  it("AC-3: 미설정 tier는 throw 없이 부재 사유를 반환한다", () => {
    const binding: Binding = {
      schemaVersion: 1,
      runtime: "claude-code",
      updatedAt: "2026-07-17",
      tiers: {},
      roles: {},
    };
    const result = resolveTier(binding, "standard");
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.reason.length > 0);
  });

  it("AC-3: 미설정 role은 throw 없이 부재 사유를 반환한다", () => {
    const binding: Binding = {
      schemaVersion: 1,
      runtime: "claude-code",
      updatedAt: "2026-07-17",
      tiers: {},
      roles: {},
    };
    const result = resolveRole(binding, "critic");
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.reason.length > 0);
  });

  it("바인딩 자체가 없어도(undefined) throw 없이 부재 사유를 반환한다", () => {
    const tierResult = resolveTier(undefined, "standard");
    assert.equal(tierResult.ok, false);
    const roleResult = resolveRole(undefined, "critic");
    assert.equal(roleResult.ok, false);
  });

  it("D-3: resolveRole은 {persona, tier} 경유로 tiers[tier].model을 해석한다", () => {
    const validated = validateBinding(FULL_BINDING, PERSONA_NAMES);
    assert.equal(validated.valid, true, JSON.stringify(validated.errors));
    const result = resolveRole(validated.binding!, "critic");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.persona, "critic");
      assert.equal(result.tier, "critical-reasoning");
      assert.equal(result.model, "model-a"); // tiers["critical-reasoning"].model
    }
  });

  it("AC-6: 부분 설정에서 설정된 항목은 resolve 성공, 미설정 항목만 부재 사유", () => {
    const partial = {
      schemaVersion: 1,
      runtime: "claude-code",
      updatedAt: "2026-07-17",
      tiers: { standard: { model: "model-b" } },
      roles: { critic: { persona: "critic", tier: "standard" } },
    };
    const validated = validateBinding(partial, PERSONA_NAMES);
    assert.equal(validated.valid, true, JSON.stringify(validated.errors));
    const b = validated.binding!;

    const okTier = resolveTier(b, "standard");
    assert.equal(okTier.ok, true);
    const missingTier = resolveTier(b, "economy");
    assert.equal(missingTier.ok, false);

    const okRole = resolveRole(b, "critic");
    assert.equal(okRole.ok, true);
    const missingRole = resolveRole(b, "architect-review");
    assert.equal(missingRole.ok, false);
  });
});

describe("mergeBinding — 부분 수정·나머지 보존 (AC-2)", () => {
  it("일부 tiers만 patch해도 나머지 tiers·roles가 보존된다", () => {
    const validated = validateBinding(FULL_BINDING, PERSONA_NAMES);
    assert.equal(validated.valid, true, JSON.stringify(validated.errors));
    const existing = validated.binding!;

    const merged = mergeBinding(existing, {
      tiers: { standard: { model: "model-b-v2" } },
    });

    assert.equal(merged.tiers["critical-reasoning"]?.model, "model-a"); // 보존
    assert.equal(merged.tiers.standard?.model, "model-b-v2"); // 수정
    assert.equal(merged.tiers.economy?.model, "model-c"); // 보존
    assert.deepEqual(merged.roles, existing.roles); // roles 전체 보존
    assert.equal(merged.runtime, "claude-code"); // 보존
  });

  it("일부 roles만 patch해도 나머지 roles·tiers가 보존된다", () => {
    const validated = validateBinding(FULL_BINDING, PERSONA_NAMES);
    const existing = validated.binding!;

    const merged = mergeBinding(existing, {
      roles: { worker: { persona: "worker", tier: "standard" } },
    });

    assert.deepEqual(merged.tiers, existing.tiers); // 보존
    assert.equal(merged.roles.critic?.persona, "critic"); // 보존
    assert.equal(merged.roles.worker?.persona, "worker"); // 신규
  });

  it("기존 바인딩이 없을 때(최초 설정) patch만으로 바인딩을 만든다", () => {
    const merged = mergeBinding(undefined, {
      runtime: "codex",
      tiers: { standard: { model: "model-x" } },
    });
    assert.equal(merged.runtime, "codex");
    assert.equal(merged.tiers.standard?.model, "model-x");
    assert.deepEqual(merged.roles, {});
  });
});

describe("loadBinding — 정확 일치만 읽기(AC-5, I-5)", () => {
  it("자기 runtime-id 파일만 읽고, 다른 런타임 파일은 대독하지 않는다 — 부재 시 기존 파일 목록 반환", () => {
    const dir = tmpBindingsDir();
    try {
      fs.writeFileSync(
        path.join(dir, "runtime-b.json"),
        JSON.stringify({ ...FULL_BINDING, runtime: "runtime-b" }),
      );

      const result = loadBinding("runtime-a", dir);
      assert.equal(result.found, false);
      if (!result.found) {
        assert.deepEqual(result.existingFiles, ["runtime-b.json"]);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("정확히 일치하는 파일이 있으면 그 바인딩을 읽는다", () => {
    const dir = tmpBindingsDir();
    try {
      fs.writeFileSync(path.join(dir, "runtime-a.json"), JSON.stringify(FULL_BINDING));

      const result = loadBinding("runtime-a", dir);
      assert.equal(result.found, true);
      if (result.found) {
        assert.equal(result.binding.runtime, "claude-code");
        assert.equal(result.binding.tiers.standard?.model, "model-b");
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("_bindings/ 폴더 자체가 없으면 부재 결과 + 빈 파일 목록을 반환한다(throw 없음)", () => {
    const dir = path.join(os.tmpdir(), "localmind-bindings-does-not-exist-" + Date.now());
    const result = loadBinding("runtime-a", dir);
    assert.equal(result.found, false);
    if (!result.found) assert.deepEqual(result.existingFiles, []);
  });
});
