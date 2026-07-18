/**
 * AC-21 — docs/help/env/result 의미 계약과 old `/goal` workflow pointer 제거 검증
 * (specs/044 FR-12). AC-18 — 경계/개인정보/사실 provenance 검증.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkillRegistry, scanPackagedNeutrality } from "./skill-contract.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");

const flat = (s: string) => s.replace(/\s+/g, " ");

describe("workflow-doc-contract: AC-21", () => {
  const agents = () => flat(read("docs/agents.md"));
  const reference = () => flat(read("docs/reference.md"));

  it("네 env 변수의 source/target·canonical/generated 구분을 문서화한다", () => {
    const a = agents();
    for (const v of ["LOCALMIND_SKILLS_DIR", "LOCALMIND_CLAUDE_SKILLS_DIR", "LOCALMIND_AGENT_SKILLS_DIR", "LOCALMIND_GEMINI_COMMANDS_DIR"]) {
      assert.ok(a.includes(v) || reference().includes(v), `${v} 문서 누락`);
    }
    assert.match(a, /정본\(source\)/);
    assert.match(a, /배포 대상/);
    assert.match(a, /생성 target은 .*재생성됩니다/);
  });

  it("activation/invocation matrix와 status/outcome 의미를 문서화한다", () => {
    const a = agents();
    assert.match(a, /\/goal-ready/);
    assert.match(a, /\$goal-ready/);
    assert.match(a, /skipped-unavailable/);
    assert.match(a, /`partial`/);
    assert.match(a, /`failed`/);
  });

  it("deny-implicit(runtime-enforced) vs Gemini instruction-level 한계를 구분한다", () => {
    const a = agents();
    assert.match(a, /runtime-enforced|런타임이 강제/);
    assert.match(a, /instruction-level|지침 수준/);
    assert.match(a, /도구 호출 0회.*과장하지 않|과장하지 않습니다/);
    assert.match(a, /consent 게이트를 우회하지 않/);
  });

  it("reserved-ID fork 차단과 workspace shadowing/resolution 한계를 설명한다", () => {
    const a = agents();
    assert.match(a, /예약 이름|reserved/);
    assert.match(a, /fail-closed/);
    assert.match(a, /equivalent-shadow\|ambiguous-shadow\|unmanaged-shadow\|unverified|resolved\|equivalent-shadow/);
    assert.match(a, /미래의 다른 workspace까지 parity를 보장한다고 하지 않/);
  });

  it("Gemini live 한계와 '모든 command' 범위를 명시한다", () => {
    const a = agents();
    assert.match(a, /Gemini CLI가 설치되지 않은 기기.*정적 contract/);
    assert.match(a, /live E2E는 `skipped`/);
    assert.match(a, /LocalMind가 소유한 packaged AI workflow command/);
  });

  it("Make 도움말은 Claude-only 배포라고 쓰지 않는다", () => {
    const mk = read("Makefile");
    const line = mk.split("\n").find((l) => l.startsWith("skills-deploy:"))!;
    assert.ok(!/Claude Code로 복사 배포/.test(line), "Claude-only 문구 잔존");
    assert.match(line, /Claude·공용|Gemini/);
  });

  it("goal-impl migration과 Claude built-in /goal 차이를 안내한다", () => {
    const a = agents();
    assert.match(a, /Claude built-in `\/goal`/);
    assert.match(a, /session completion condition/);
    assert.match(a, /goal-impl/);
  });

  it("active docs/templates/source에 old LocalMind /goal workflow pointer가 0건이다(migration 설명 제외)", () => {
    const files = [
      "AGENTS.md",
      "templates/sdd/AGENTS.md",
      "templates/sdd/spec.template.md",
      "templates/skills/goal-ready/SKILL.md",
      "templates/skills/goal-impl/SKILL.md",
      "templates/skills/sdd-self-review/SKILL.md",
      "docs/agents.md",
    ];
    const forbidden = ["## `/goal {NNN}` 처리 방법", "`/goal`로 구현", "`/goal` 흐름", "`/goal`의 완료", "AGENTS.md `/goal` 규약"];
    for (const f of files) {
      const c = read(f);
      for (const pat of forbidden) {
        assert.ok(!c.includes(pat), `${f}에 old /goal pointer "${pat}" 잔존`);
      }
    }
  });
});

describe("deep-research discoverability docs: AC-2·14·16 (specs/202607172313)", () => {
  const userDocs = ["README.md", "docs/agents.md", "docs/workflows.md"] as const;
  const docs = () => new Map(userDocs.map((rel) => [rel, read(rel)]));
  const workflowSection = () => {
    const body = read("docs/workflows.md");
    const lines = body.split("\n");
    const start = lines.findIndex((line) => /^#{2,4}\s+.*(?:deep-research|Deep Research)/i.test(line));
    assert.ok(start !== -1, "docs/workflows.md에 Deep Research 전용 절 없음");
    const level = /^#+/.exec(lines[start])![0].length;
    const end = lines.findIndex((line, index) => index > start && new RegExp(`^#{1,${level}}\\s+`).test(line));
    return lines.slice(start, end === -1 ? undefined : end).join("\n");
  };

  it("README·agents·workflows가 공용 logical ID와 runtime별 실제 호출을 설명한다", () => {
    for (const [rel, body] of docs()) {
      const content = flat(body);
      assert.match(content, /(?:logical|논리(?:적)?) (?:command )?ID.{0,160}`deep-research`|`deep-research`.{0,160}(?:logical|논리(?:적)?) (?:command )?ID/i, `${rel}: deep-research logical ID 설명 누락`);
      assert.match(content, /Claude(?: Code)?.{0,160}`\/deep-research(?: [^`]+)?`/i, `${rel}: Claude /deep-research 호출 누락`);
      assert.match(content, /Codex.{0,160}`\$deep-research(?: [^`]+)?`/i, `${rel}: Codex $deep-research 호출 누락`);
      assert.match(
        content,
        /Gemini(?: CLI)?.{0,220}(?:(?:auto|자동) (?:skill|스킬)|(?:generated|생성(?:된)?) `\/deep-research(?: [^`]+)?` (?:wrapper|래퍼)|`\/deep-research(?: [^`]+)?` (?:wrapper|래퍼))/i,
        `${rel}: Gemini auto skill 또는 generated /deep-research wrapper 호출 누락`,
      );
    }
  });

  it("Codex bare slash와 deprecated Custom Prompts를 호출법으로 권장하지 않는다", () => {
    const all = flat([...docs().values()].join("\n"));
    assert.match(
      all,
      /Codex.{0,180}(?:bare )?`\/deep-research`.{0,180}(?:지원하지 않|권장하지 않|사용하지 않|공식 (?:문법|계약)이 아니)|(?:지원하지 않|권장하지 않|사용하지 않|공식 (?:문법|계약)이 아니).{0,180}Codex.{0,180}(?:bare )?`\/deep-research`/i,
      "Codex bare /deep-research 비권장 설명 누락",
    );
    assert.match(
      all,
      /Custom Prompts?.{0,120}(?:deprecated|폐기|사용 중단|더 이상 권장하지 않)|(?:deprecated|폐기|사용 중단|더 이상 권장하지 않).{0,120}Custom Prompts?/i,
      "Codex Custom Prompts deprecated 설명 누락",
    );

    for (const [rel, body] of docs()) {
      for (const line of body.split("\n")) {
        const codexBareSlash =
          /Codex(?:(?!Claude|Gemini|\$deep-research).){0,100}`\/deep-research(?: [^`]*)?`|`\/deep-research(?: [^`]*)?`(?:(?!Claude|Gemini|\$deep-research).){0,100}Codex/i;
        if (codexBareSlash.test(line)) {
          assert.match(line, /지원하지 않|권장하지 않|사용하지 않|금지|아니|없|deprecated|폐기/i, `${rel}: Codex bare slash를 긍정 호출법으로 안내함: ${line}`);
        }
        if (/`\/prompts:deep-research(?: [^`]*)?`/.test(line)) {
          assert.match(line, /지원하지 않|권장하지 않|사용하지 않|금지|deprecated|폐기/i, `${rel}: deprecated prompt를 긍정 호출법으로 안내함: ${line}`);
        }
      }
    }
  });

  it("first-party 제품과의 차이 및 Agent Skills runtime 범위를 설명한다", () => {
    const section = flat(workflowSection());
    assert.match(section, /(?:first-party|벤더(?:의)?|공급자(?:의)?).{0,100}Deep Research/i, "first-party Deep Research 비교 설명 누락");
    assert.match(section, /(?:동일하지 않|복제하지 않|대체하지 않|보장하지 않|별개)/, "LocalMind workflow와 first-party 제품의 차이 누락");
    assert.match(section, /(?:backend|백엔드|전용 모델|전용 서버|독점 모델|독점 서버)/i, "전용 backend/model 차이 설명 누락");
    assert.match(section, /Agent Skills.{0,180}(?:호환|로드|지원).{0,100}(?:runtime|런타임)|(?:runtime|런타임).{0,180}Agent Skills/i, "Agent Skills 호환 runtime 범위 누락");
    assert.match(section, /(?:모델 단독|model alone|모델만).{0,100}(?:범위 밖|지원하지 않|실행할 수 없)/i, "모델 단독 호출이 범위 밖이라는 설명 누락");
  });

  it("explicit/report-only와 capability fallback 및 Gemini·Antigravity 범위를 설명한다", () => {
    const agents = flat(read("docs/agents.md"));
    const section = flat(workflowSection());
    assert.match(agents, /`deep-research`.{0,260}`?explicit`?.{0,160}`?report-only`?/i, "agents 문서의 deep-research explicit/report-only policy 누락");
    assert.match(section, /(?:명시 호출|explicit).{0,160}(?:report-only|채팅 보고)/i, "workflow의 explicit/report-only 경계 누락");
    assert.match(section, /(?:live (?:source|web)|라이브 (?:출처|조회)).{0,220}(?:없|미지원|불가능).{0,220}(?:context-only|현재 session|current-session|미검증|한계)/i, "live capability fallback 설명 누락");
    assert.match(section, /(?:격리 (?:위임|연구자|critic)|isolated (?:delegation|researcher|critic)).{0,220}(?:없|미지원|불가능).{0,220}(?:not independent|비독립|현재 session|current-session)/i, "isolated delegation fallback 설명 누락");
    assert.match(section, /Gemini CLI/i, "Gemini CLI 지원 범위 누락");
    assert.match(section, /Antigravity.{0,220}(?:전용 (?:adapter|어댑터)|정식 target|정식 대상).{0,160}(?:범위 밖|후속|추후|포함하지 않)/i, "Antigravity 전용 adapter 비목표 설명 누락");
    assert.doesNotMatch(agents, /Gemini CLI.{0,160}(?:실행 전|pre-execution).{0,80}hook이 없/i, "Gemini CLI에 실행 전 hook이 없다는 낡은 사실을 쓰면 안 됨");
    assert.match(agents, /Gemini CLI.{0,220}(?:공식 )?(?:실행 전 )?hook.{0,120}(?:존재|지원)/i, "Gemini CLI의 공식 hook 존재 설명 누락");
    assert.match(agents, /LocalMind.{0,220}(?:wrapper|래퍼).{0,180}hook.{0,120}(?:설치하거나 등록하지 않|미등록).{0,180}(?:instruction-level|지침 수준)/i, "LocalMind wrapper가 hook을 등록하지 않아 instruction-level이라는 경계 누락");
  });

  it("추상 실행 등급과 설치별 binding을 분리하고 final critic 다운시프트를 금지한다", () => {
    const section = flat(workflowSection());
    assert.match(section, /source scout.{0,100}`economy`/i, "source scout=economy 누락");
    assert.match(section, /(?:coordinator|research coordinator).{0,120}`standard`/i, "coordinator=standard 누락");
    assert.match(section, /(?:evidence researcher|researcher).{0,120}`standard`/i, "researcher=standard 누락");
    assert.match(section, /(?:synthesizer|research synthesizer).{0,140}`critical-reasoning`/i, "synthesizer=critical-reasoning 누락");
    assert.match(section, /(?:final critic|critic).{0,140}`critical-reasoning`/i, "final critic=critical-reasoning 누락");
    assert.match(section, /(?:설치별|runtime) (?:binding|바인딩).{0,180}(?:구체|실제).{0,100}(?:model|모델)/i, "추상 tier와 설치별 model binding 경계 누락");
    assert.match(section, /final critic.{0,180}(?:조용히|silent).{0,100}(?:낮추지 않|대체하지 않|downshift|다운시프트)/i, "final critic silent downshift 금지 누락");
  });
});

describe("goal-impl-completion-delegation: AC-4 (specs/051 I-5, D-6)", () => {
  const rootAgents = () => read("AGENTS.md");
  const skillBody = () => read("templates/skills/goal-impl/SKILL.md");

  it("AGENTS.md 절 제목·호출 문법이 goal-impl이다", () => {
    const a = rootAgents();
    assert.match(a, /## `goal-impl \{prefix\}` 처리 방법/);
    assert.match(a, /`\/goal-impl \{prefix\}`/);
    assert.match(a, /\$goal-impl \{prefix\}/);
  });

  it("goal-impl 본문에 commit/push/CI 완료 규칙 자체 정의가 없고 AGENTS.md 참조만 있다", () => {
    const s = skillBody();
    // PR 게이트 문구의 자체 서술 금지 (AGENTS.md 규약7이 정본)
    for (const literal of ["main 직접 push는 금지", "PR을 생성한다", "머지는 사람이 한다"]) {
      assert.ok(!s.includes(literal), `본문에 PR 게이트 자체 서술 잔존: "${literal}"`);
    }
    // codex 교차 검증(specs/051 self-review) 후속: commit/push/PR을 "완료"로 자체 서술하는
    // 구조 패턴 금지 — phase 커밋(끊김방어)이 아니라 완료 규칙 복제를 잡는다(회귀핀 확장).
    // 위임 문장("완료 정의는 DoD를 모두 채우는 것…AGENTS.md가 정본")은 "…까지가 완료" 형태가
    // 아니므로 걸리지 않는다. 위험 재유입: base §6 원본의 "커밋·push까지가 완료 정의" 등.
    for (const re of [
      /(커밋|commit)[^\n]{0,24}push[^\n]{0,24}완료 정의/,
      /(커밋·push|push|PR 생성|PR)까지가[^\n]{0,6}완료/,
      /clean[^\n]{0,20}(커밋|push)[^\n]{0,10}완료/,
    ]) {
      assert.doesNotMatch(s, re, `본문이 commit/push/PR을 완료로 자체 서술함 — AGENTS.md 위임 위반: ${re}`);
    }
    // phase 커밋(I-2)은 완료 규칙과 명시적으로 구분돼야 한다(codex blocking 해소 핀).
    assert.match(
      s,
      /완료 규칙이 아니다/,
      "phase 커밋이 완료 규칙과 구분되지 않음 — 완료 커밋과 혼동 소지",
    );
    // 완료는 AGENTS.md 위임 참조만
    assert.match(s, /AGENTS\.md 규약대로/);
    assert.match(s, /AGENTS\.md가 정본이다/);
  });

  it("AGENTS.md 규약7에 PR 게이트(main 직접 push 금지 → PR 생성, 머지는 사람)가 명문으로 존재한다(D-6)", () => {
    const a = rootAgents();
    assert.match(a, /main 직접 push는 금지/);
    assert.match(a, /PR을 생성한다/);
    assert.match(a, /머지는 사람이 한다/);
  });

  // timestamp 프리픽스 전환(2026-07-17)의 실제 규칙을 핀한다 — 형식(YYYYMMDDHHmm)만이 아니라
  // "덮어쓰지 않는다"는 규칙 자체. 형식 문자열만 핀하면 규칙이 사라져도 green이 된다.
  it("AGENTS.md specs 폴더 규약: 배타적 생성(-p 금지) + 시각 재독 재시도 + 프리픽스 모호성 가드", () => {
    const flat = rootAgents().replace(/\s+/g, " ");
    assert.ok(flat.includes("`mkdir`(`-p` 금지)"), "배타적 생성 규칙");
    assert.ok(flat.includes("EEXIST"), "이미 있으면 실패 = 덮어쓰기 불가");
    assert.ok(flat.includes("현재 시각을 다시 읽어"), "종료성 — 같은 경로 재확인이 아니라 시각 재독");
    assert.ok(flat.includes("YYYYMMDDHHmmss"), "초까지 확장 형식");
    // mkdir이 경로 충돌만 막는다는 정직한 한계 + 그로 인한 프리픽스 모호성의 실제 가드(중대-A).
    assert.ok(flat.includes("프리픽스는 유일하지 않을 수 있다"), "프리픽스 모호성 표기");
    assert.ok(flat.includes("어느 spec인지 사용자에게 묻는다"), "모호 프리픽스 → 사용자에게 질의(추측 금지)");
    assert.ok(!/최댓값 \+ 1/.test(rootAgents()), "구 max+1 규칙 부재");
  });
});

describe("bounded-verification repository/scaffold contract: AC-2, AC-6~10", () => {
  const goalImplSection = (rel: "AGENTS.md" | "templates/sdd/AGENTS.md") => {
    const body = read(rel);
    const start = body.indexOf("\n## `goal-impl {prefix}` 처리 방법");
    assert.ok(start !== -1, `${rel}: goal-impl 절 없음`);
    const end = body.indexOf("\n## ", start + 1);
    return flat(end === -1 ? body.slice(start + 1) : body.slice(start + 1, end));
  };

  it("AC-2: root와 scaffold 모두 자동 최대 2 round 뒤 blocker에서 멈추고 fresh 승인 1개당 1회만 재개한다", () => {
    for (const rel of ["AGENTS.md", "templates/sdd/AGENTS.md"] as const) {
      const section = goalImplSection(rel);
      assert.match(section, /(?:자동|automatic).{0,100}(?:최대|상한).{0,30}(?:2|두) (?:회|round|라운드)/i, `${rel}: 자동 최대 2 round 누락`);
      assert.match(section, /(?:round|라운드) 2.{0,180}blocker.{0,180}(?:중단|멈춘)/i, `${rel}: round 2 blocker stop 누락`);
      assert.match(section, /fresh (?:round )?approval/i, `${rel}: fresh approval 용어 누락`);
      assert.match(section, /(?:승인|approval) (?:1개|하나|1회).{0,100}(?:round|라운드) (?:1개|하나|1회)/i, `${rel}: one-approval/one-round 누락`);
      assert.doesNotMatch(section, /clean해질 때까지 반복|재검\(clean까지\)/, `${rel}: 무제한 자동 재검 문구 잔존`);
    }
  });

  it("AC-6~8: root와 scaffold에 변경 전·최종 review 직전 두 freshness gate와 정직한 실패 경로가 있다", () => {
    const root = goalImplSection("AGENTS.md");
    const scaffold = goalImplSection("templates/sdd/AGENTS.md");

    assert.match(root, /(?:변경|쓰기).{0,60}(?:전|전에).{0,160}origin\/main.{0,120}full SHA/i, "root: start origin/main full SHA gate 누락");
    assert.match(root, /latest origin\/main.{0,140}feature branch/i, "root: latest base feature branch 누락");
    assert.match(root, /dirty.{0,80}(?:unmanaged|관리되지 않은).{0,120}(?:보존|변경하지 않)/i, "root: dirty/unmanaged 보호 누락");
    assert.match(scaffold, /(?:변경|쓰기).{0,60}(?:전|전에).{0,160}(?:원격 기본 브랜치|repository.{0,40}base).{0,120}full SHA/i, "scaffold: provider-neutral start gate 누락");

    for (const [rel, section] of [["AGENTS.md", root], ["templates/sdd/AGENTS.md", scaffold]] as const) {
      assert.match(section, /(?:최종|final) self-review (?:직전|전에).{0,160}(?:다시|재조회|fetch).{0,160}(?:full SHA|기준 SHA)/i, `${rel}: pre-review freshness gate 누락`);
      assert.match(section, /(?:base|기준 SHA).{0,60}(?:이동|전진|달라).{0,180}(?:정합|통합).{0,140}(?:테스트|regression).{0,80}(?:재실행|green|통과)/i, `${rel}: moved-base integration/regression 누락`);
      assert.match(section, /freshness unverified/i, `${rel}: unavailable 정직 보고 상태 누락`);
      assert.match(section, /(?:사용자|user).{0,100}(?:방향|결정|지시)/i, `${rel}: unavailable 시 사용자 결정 요청 누락`);
    }
  });

  it("AC-9: root와 scaffold가 remote PR/CI를 외부 SSoT로 두고 status-only commit을 금지한다", () => {
    for (const rel of ["AGENTS.md", "templates/sdd/AGENTS.md"] as const) {
      const section = goalImplSection(rel);
      assert.match(section, /external completion state/i, `${rel}: external completion state 용어 누락`);
      assert.match(section, /(?:PR|CI).{0,120}(?:원격|remote).{0,120}(?:SSoT|정본)/i, `${rel}: remote PR/CI SSoT 누락`);
      assert.match(section, /(?:상태|번호|run ID).{0,160}(?:후속 )?(?:commit|커밋).{0,100}(?:금지|만들지 않)/i, `${rel}: status-only commit 금지 누락`);
      assert.match(section, /CI.{0,100}(?:실제 )?(?:결함|defect).{0,160}(?:새 )?candidate.{0,160}(?:테스트|review|재검)/i, `${rel}: 실제 CI fix 재검 경계 누락`);
    }
  });

  it("AC-10: root/scaffold 모두 TDD·필수 dogfood·독립 critic·전 AC green·feature PR gate를 유지한다", () => {
    for (const rel of ["AGENTS.md", "templates/sdd/AGENTS.md"] as const) {
      const body = read(rel);
      assert.match(body, /TDD/);
      assert.match(body, /실패 테스트를 먼저/);
      assert.match(body, /도그푸드|dogfood/i);
      assert.match(body, /독립 (?:리뷰|review)|독립 리뷰/);
      assert.match(body, /테스트 green \+ AC 전부 충족|전 AC green/);
      assert.match(body, /feature branch|feature 브랜치/);
      assert.match(body, /PR 생성/);
    }
  });
});

describe("workflow-boundary: AC-18", () => {
  it("canonical/template/bridge/신규 소스에 실제 개인 절대경로·secret이 없다", () => {
    const scan: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(md|ts|json|toml)$/.test(e.name)) scan.push(p);
      }
    };
    walk(path.join(REPO_ROOT, "templates", "skills"));
    scan.push(path.join(REPO_ROOT, "GEMINI.md"), path.join(REPO_ROOT, "templates", "sdd", "CLAUDE.md"), path.join(REPO_ROOT, "templates", "sdd", "GEMINI.md"));
    for (const s of ["skill-contract.ts", "reconcile.ts", "workflow-policy.ts", "commands.ts", "skills.ts"]) scan.push(path.join(REPO_ROOT, "src", "agents", s));
    const secretRe = /\/Users\/[a-z]|\/home\/[a-z][a-z0-9]+\/|sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{16,}|xox[bap]-/;
    for (const f of scan) {
      const c = fs.readFileSync(f, "utf8");
      const m = secretRe.exec(c);
      assert.ok(!m, `${path.relative(REPO_ROOT, f)}에 개인경로/secret 의심: ${m?.[0]}`);
    }
  });

  it("packaged canonical workflow는 중립성 clean(재확인)", () => {
    const reg = loadSkillRegistry(path.join(REPO_ROOT, "templates", "skills"), { packaged: true });
    assert.equal(reg.problems.length, 0, JSON.stringify(reg.problems));
    for (const s of reg.skills) assert.equal(scanPackagedNeutrality(s).length, 0, `${s.name} 중립성 위반`);
  });

  it("gateway/backend/search 핵심 파일이 044 변경 범위 밖이다(존재 확인 — 미변경 경계)", () => {
    // 이 파일들은 044에서 수정하지 않는다. 존재만 확인해 회귀 경계를 문서화한다.
    for (const f of ["src/server.ts", "src/brain.ts", "src/agents/registry.ts", "src/agents/deploy.ts"]) {
      assert.ok(fs.existsSync(path.join(REPO_ROOT, f)), `${f} 없음`);
    }
  });
});

describe("version-release-process: AC-1~5 (specs/053, 사후 핀 — 규약 문구 확정 후 assert 고정)", () => {
  // AC-1·2·4는 AGENTS.md 전체가 아니라 신설 「## 버전·릴리스」 절만 슬라이스해 검사한다 —
  // 절 밖 문구가 우연히 매치되는 오탐 방지(self-review codex #5).
  const releaseSection = () => {
    const a = read("AGENTS.md");
    const start = a.indexOf("\n## 버전·릴리스");
    assert.ok(start !== -1, "AGENTS.md에 「## 버전·릴리스」 절 없음");
    const next = a.indexOf("\n## ", start + 1);
    return next === -1 ? a.slice(start + 1) : a.slice(start + 1, next);
  };
  const goalReady = () => read("templates/skills/goal-ready/SKILL.md");
  const changelog = () => read("CHANGELOG.md");

  it("AC-1: CalVer 형식 규약(형식·기준시점·MICRO 초기값·태그 접두·D-1 산정규칙)이 존재한다", () => {
    const a = releaseSection();
    assert.match(a, /YYYY\.MM\.MICRO/);
    assert.match(a, /릴리스\(PR 머지\) 시점/);
    assert.match(a, /첫 릴리스는 MICRO = 0/);
    assert.match(a, /`v` 접두 없이/);
    assert.match(a, /SemVer 의미\(호환성 시그널\)는 없다/);
    // D-1: MICRO 산정 정본 = git tag 목록 (AC-9 정적분)
    assert.match(a, /git fetch --tags/);
    assert.match(a, /git tag -l 'YYYY\.MM\.\*'/);
    assert.match(a, /CHANGELOG 헤더와 어긋나면 \*\*태그가 이긴다\*\*/);
  });

  it("AC-2: 관심사 분리 규칙(내용은 작업 중 PR, 버전 확정은 머지 직전 — tag는 머지 후)이 존재한다", () => {
    const a = releaseSection();
    assert.match(a, /변경 내용 서술\*\*\(CHANGELOG 항목·PR 설명\)은 \*\*작업 중 PR에\*\* 누적/);
    assert.match(a, /버전 숫자 확정\*\*\(package\.json bump \+ CHANGELOG 버전 헤더 기입\)은 \*\*PR 머지 직전\*\*에\s+한다/);
    // tag 시점 분리(self-review 중대-1): tag는 버전 확정에 묶이지 않고 머지 후 4단계.
    assert.match(a, /git tag는 머지 후 절차 4단계에서 verified main에\*\*\s+만든다/);
  });

  it("AC-3: goal-ready 정본에 '버전은 여기서 정하지 않는다' + 릴리스 규약(AGENTS.md) 참조가 존재한다", () => {
    const g = goalReady();
    assert.match(g, /버전은 여기서 정하지 않는다/);
    assert.match(g, /저장소 릴리스 규약\(AGENTS\.md 버전·릴리스 절\)/);
    // packaged 중립성 스캔 clean은 "workflow-boundary: AC-18" describe의
    // "packaged canonical workflow는 중립성 clean(재확인)" 케이스가 templates/skills 전체
    // (goal-ready 포함)를 이미 스캔한다 — 여기서 재확인만, 별도 assert 불필요.
  });

  it("AC-4: 릴리스 절차 5단계 순서·gh 계정 확인·머지 검증 안전장치가 존재한다", () => {
    const a = releaseSection();
    const steps = ["1. **머지 준비**", "2. **PR 머지**", "3. **버전 확정 커밋 포함 확인**", "4. **태그**", "5. **릴리스 생성**"];
    let lastIndex = -1;
    for (const s of steps) {
      const idx = a.indexOf(s);
      assert.ok(idx !== -1, `절차 단계 누락: "${s}"`);
      assert.ok(idx > lastIndex, `절차 단계 순서 어긋남: "${s}"`);
      lastIndex = idx;
    }
    assert.match(a, /\(a\) gh 계정 확인/);
    assert.match(a, /gh auth status/);
    assert.match(a, /PR state \+ main HEAD 변화 둘 다 확인/);
    // codex 재검 advisory: gh/git 절차 정확성 문구 재유입 방지
    assert.match(a, /git tag <CalVer> origin\/main/); // stale HEAD 오태그 방지
    assert.match(a, /--verify-tag/); // gh 자동 태그 생성 방지
    assert.match(a, /활성 계정 표시일 뿐 repo 권한 검증은 아니다/); // gh auth status 정확화
    // AC-8 정적분: 미머지 상태 tag·release 중단
    assert.match(a, /main이 불변이면 미머지다 — \*\*tag·release를 진행하지 않는다\*\*/);
    // AC-7 정적분: 월 경계 재확정
    assert.match(a, /월 경계 재확정/);
    assert.match(a, /재확정\(re-stamp\)/);
  });

  it("AC-5: CHANGELOG 새 문구 존재 + 구 문구 부재(스캔 범위: CHANGELOG.md·AGENTS.md·docs/·templates/, specs/ 제외 — I-4)", () => {
    assert.match(changelog(), /버전은 \*\*릴리스\(PR 머지\) 시점\*\* 기준/);

    // specs/는 의도적으로 스캔 범위에서 제외한다 — specs/053(이 spec) 자신이 구 문구를
    // "정정 대상 드리프트"로 역사적으로 인용하고 있어(goal.md·plan.md·tasks.md), 전역
    // 스캔을 걸면 자기 자신을 오탐(false positive)한다(→ spec.md AC-5·plan Phase 4·
    // tasks.md I-4). 따라서 CHANGELOG.md·AGENTS.md·docs/·templates/ 로만 한정한다.
    const forbidden = "문서 작성(goal-ready) 시점";
    // exact 문구 외 보조 패턴(self-review 경미-2): 괄호 없는 재유입·패러프레이즈도 잡는다.
    const forbiddenLoose = [/문서 작성.{0,12}시점.{0,8}기준/, /goal-ready\).{0,8}시점.{0,8}기준/];
    const scanTargets = [path.join(REPO_ROOT, "CHANGELOG.md"), path.join(REPO_ROOT, "AGENTS.md")];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(md|json)$/.test(e.name)) scanTargets.push(p);
      }
    };
    walk(path.join(REPO_ROOT, "docs"));
    walk(path.join(REPO_ROOT, "templates"));

    for (const f of scanTargets) {
      const c = fs.readFileSync(f, "utf8");
      assert.ok(!c.includes(forbidden), `${path.relative(REPO_ROOT, f)}에 구 문구 "${forbidden}" 잔존`);
      for (const re of forbiddenLoose) {
        const m = re.exec(c);
        assert.ok(!m, `${path.relative(REPO_ROOT, f)}에 구 문구 패턴 ${re} 매치: "${m?.[0]}"`);
      }
    }
  });
});
