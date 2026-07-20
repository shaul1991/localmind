/**
 * specs/032 — 회고 순수 모듈 테스트(AC-1~5·6b·3b 상당의 결정적 케이스).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import {
  parseCommits,
  extractOpenQuestions,
  collectDecisionNotes,
  classifyPatterns,
  isInsufficient,
  aggregateSelfReviewEvidence,
} from "./retro-analysis.js";
import { renderRetro, type RetroAggregate } from "./retro-note.js";
import { guardedWriteFileSync } from "./retro-guard.js";
import { buildNoteFrontmatter } from "./brain.js";

describe("032 회고 집계", () => {
  it("032 AC-5: commit 집계 — 실측 3형식 cadence + 기타 버킷", () => {
    // 현행 repo 관례 재현(리터럴 specs/NNN 없음) — D1 픽스처
    const log = [
      "feat: 기기 동기화 파이프라인 — make device-sync 한 방 명령 (031)",
      "feat: 프로젝트별 계약 저장소 — DDD 차용 (029)",
      "fix(test): 셸 assert 플레이키 제거",
      "fix: reduce to 100 items", // 베어 3자리 아님(100은 spec 앵커 없음 → 미집계)
      "fix: another",
      "test: 커버리지",
      "Merge pull request #19 from x/y",
      "notes: ponytail 단상 적재",
      "docs(spec): 031 기기 동기화 파이프라인 초안",
      "docs(spec): 031 cap 100 chars", // codex 명명 회귀 — 절 중간 3자리(100) 미집계
      "docs(spec): 022 색인 위생, 023 벡터 사이드카, 024 라벨 바인딩 초안", // 나열형 전부 집계
    ].join("\n");
    const c = parseCommits(log);
    assert.equal(c.total, 11);
    assert.equal(c.byType.feat, 2);
    assert.equal(c.byType.fix, 3);
    assert.equal(c.byType.test, 1);
    assert.equal(c.byType["기타"], 2, "Merge·notes:는 기타 버킷");
    assert.equal(c.byType.docs, 3);
    assert.equal(c.specCadence["031"], 3, "괄호형 + docs(spec) 절 시작 번호 합산");
    assert.equal(c.specCadence["100"], undefined, "docs(spec) 절 중간 3자리 미집계(codex 회귀)");
    for (const n of ["022", "023", "024"]) assert.equal(c.specCadence[n], 1, `나열형 ${n} 집계`);
    assert.equal(c.specCadence["029"], 1);
    assert.equal(c.specCadence["100"], undefined, "spec 앵커 없는 3자리는 미집계(R6)");
  });

  it("032 AC-1: OQ 추출 — 헤딩 접미 변형 + 취소선 해결 제외", () => {
    const files = [
      {
        spec: "004-x",
        text: "# S\n\n## Open questions — 2026-07-03 재검으로 확정\n\n- ~~해결된 항목 하나~~\n- 미해결 A\n- 미해결 B\n\n## 다음 절\n",
      },
      {
        spec: "030-y",
        text: "## Open questions (plan 단계 1 인터뷰에서 확정 — 6건)\n\n1. 미해결 C\n2. ~~해결 둘~~\n3. 미해결 D\n",
      },
    ];
    const all = extractOpenQuestions(files);
    const unresolved = all.filter((q) => !q.resolved);
    assert.equal(unresolved.length, 4, "미해결 4개");
    assert.equal(all.filter((q) => q.resolved).length, 2, "취소선 2개 해결 분류");
    assert.ok(unresolved.some((q) => q.spec === "030-y" && q.text.includes("미해결 D")));
  });

  it("032 AC-2b: 취소선 없는 제자리-해결은 미해결로 표면화(문서화된 한계)", () => {
    const all = extractOpenQuestions([
      { spec: "z", text: "## Open questions\n\n- (신규) 이미 반영됨 — 로그 레코드에 folder 포함\n" },
    ]);
    assert.equal(all.filter((q) => !q.resolved).length, 1, "제자리-해결도 미해결로(사람 판별 몫)");
  });

  it("032 AC-3: 결정 노트 수집 — tags decision만, report/retro 제외", () => {
    const files = [
      { path: "a.md", text: '---\ntitle: "결정 1"\ndate: 2026-07-05T01:00:00\ntags: ["decision"]\n---\n본문 specs/031-device-sync-pipeline 참조' },
      { path: "b.md", text: '---\ntitle: "결정 2"\ndate: 2026-07-05T02:00:00\ntags: [decision, workflow]\n---\n관련: specs/028-domain-specialist-personas' },
      { path: "r.md", text: '---\ntitle: "리포트"\ntags: [report, retro]\ntype: retro\n---\n' },
      { path: "n.md", text: "그냥 노트(프론트매터 없음)" },
    ];
    const d = collectDecisionNotes(files);
    assert.equal(d.length, 2);
    assert.deepEqual(d[0].specRefs, ["031-device-sync-pipeline"]);
    assert.equal(d[1].title, "결정 2");
  });

  it("032 AC-4: 3회 임계 — scoped만 승격, bare 타입 제외(첫 실전 개정)", () => {
    const { promoted, observing } = classifyPatterns([
      { pattern: "feat", count: 53 }, // bare — 실전 노이즈 재현: 제외
      { pattern: "fix(test)", count: 3 },
      { pattern: "docs(spec)", count: 2 },
      { pattern: "docs", count: 38 }, // bare — 제외
    ]);
    assert.deepEqual(promoted.map((p) => p.pattern), ["fix(test)"], "scoped ≥3만 승격");
    assert.deepEqual(observing.map((p) => p.pattern), ["docs(spec)"], "scoped 2회는 관찰");
  });

  it("032 FR-5: 표본 부족 — 전부 미만일 때만", () => {
    assert.equal(isInsufficient(2, 0, 5), true);
    assert.equal(isInsufficient(3, 0, 5), false, "커밋 임계 도달 → 해석 시도");
    assert.equal(isInsufficient(0, 1, 0), false, "결정 노트 1건이면 시도");
  });

  it("032 AC-7·10: 렌더 — 게이트 고지·주의·제안 표기·대시보드 한계 헤더", () => {
    const agg: RetroAggregate = {
      days: 14,
      repoLabel: "fixture",
      isGitRepo: true,
      commits: parseCommits("fix(test): a (031)\nfix(test): b\nfix(test): c"),
      openQuestions: [{ spec: "031-x", text: "잔존 — 반복되면 재론", resolved: false }],
      hasSpecsDir: true,
      decisions: [],
      query: null,
      guides: [],
      projects: [],
      insufficient: false,
      selfReview: null,
    };
    const md = renderRetro(agg, null, new Date("2026-07-05T10:00:00Z"));
    assert.ok(md.includes("제안까지만"), "게이트 고지");
    assert.ok(md.includes("SDD 스펙"), "개정 경로 고지");
    assert.ok(md.includes("백업 저장소에 커밋"), "reports/ 주의(§4 계열)");
    assert.ok(md.includes("사람이 판별"), "OQ 대시보드 한계 헤더(AC-2b 정합)");
    assert.ok(md.includes("제안: `fix(test)`"), "액션 리스트 제안 표기(scoped 3회 승격)");
    assert.ok(!md.includes("제안: `feat`"), "bare 타입 미승격(첫 실전 개정)");
    assert.ok(/조건 도래|조건 충족/.test(md) === false, "자동 판정 문자열 없음(AC-2 — 대시보드 스코프)");
    assert.ok(md.includes("type: retro"), "frontmatter");
  });

  it("032 AC-6b: 가드 — reports/ 밖 쓰기 throw, 안은 성공", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lm-retro-guard-"));
    try {
      const reports = path.join(tmp, "reports");
      guardedWriteFileSync(reports, path.join(reports, "retro-2026-07-05.md"), "ok");
      assert.ok(fs.existsSync(path.join(reports, "retro-2026-07-05.md")));
      assert.throws(
        () => guardedWriteFileSync(reports, path.join(tmp, "agents", "critic.md"), "탈출"),
        /안전 게이트/,
      );
      assert.throws(
        () => guardedWriteFileSync(reports, path.join(reports, "..", "AGENTS.md"), "탈출2"),
        /안전 게이트/,
        ".. 경로 우회 차단",
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("032 AC-6b: 쓰기 계열 fs API가 가드 모듈에만 등장(코드 구조)", () => {
    const root = path.resolve(path.dirname(new URL(import.meta.url).pathname));
    const writeApis = /\b(writeFileSync|appendFileSync|createWriteStream|renameSync)\b/;
    for (const f of ["retro-analysis.ts", "retro-note.ts"]) {
      const src = fs.readFileSync(path.join(root, f), "utf8");
      assert.ok(!writeApis.test(src), `${f}: 쓰기 API 없음(가드 모듈 전용)`);
    }
    const entry = fs.readFileSync(path.join(root, "..", "scripts", "retro-report.ts"), "utf8");
    assert.ok(!writeApis.test(entry), "진입점: 쓰기는 guardedWriteFileSync 경유만");
    assert.ok(entry.includes("guardedWriteFileSync"), "진입점이 가드를 사용");
  });

  it("032 AC-3b: capture frontmatter 빌더 — tags 지정·미지정·특수문자 이스케이프", () => {
    const withTags = buildNoteFrontmatter("결정", "2026-07-05T01:00:00", ["decision"]);
    assert.ok(withTags.includes('tags: ["decision"]'));
    const noTags = buildNoteFrontmatter("일반", "2026-07-05T01:00:00");
    assert.ok(noTags.includes("tags: []"), "미지정은 기존과 동일(하위호환 — 큐레이터 대상)");
    const special = buildNoteFrontmatter("x", "2026-07-05T01:00:00", ['we"ird]', "ok"]);
    assert.ok(special.includes('"we\\"ird]"'), "JSON 이스케이프로 frontmatter 안 깨짐(R5)");
  });
});

// specs/202607180014-retro-analysis-timestamp-prefix — timestamp 프리픽스 대응
describe("retro timestamp 프리픽스 대응", () => {
  it("AC-1: specs/{ts}-slug 경로형 cadence 집계 — 키는 폴더 식별자 전체", () => {
    const log = [
      "feat: 백엔드 인증 흐름 — specs/202607180014-add-auth 구현",
      "docs: 계약 갱신 (specs/202607181530-fix-cache)",
    ].join("\n");
    const c = parseCommits(log);
    assert.equal(c.specCadence["202607180014-add-auth"], 1, "12자리 경로형 폴더 식별자 키");
    assert.equal(c.specCadence["202607181530-fix-cache"], 1);
  });

  it("AC-2: 3자리·timestamp 혼재 + 같은 분 다른 슬러그 두 spec 독립 집계(같은 프리픽스 분리)", () => {
    const log = [
      "feat: a specs/202607180014-add-auth",
      "fix: b specs/202607180014-fix-cache", // 같은 분·다른 슬러그 — 별개여야
      "feat: legacy bump (031)", // 레거시 바레 — 여전히 031
      "docs: c specs/041-agent-rules-central", // 레거시 경로형 — 폴더 식별자 키
    ].join("\n");
    const c = parseCommits(log);
    assert.equal(c.specCadence["202607180014-add-auth"], 1);
    assert.equal(c.specCadence["202607180014-fix-cache"], 1, "같은 프리픽스라도 슬러그로 분리");
    assert.equal(c.specCadence["031"], 1, "레거시 바레 (NNN)은 그대로 3자리 키");
    assert.equal(c.specCadence["041-agent-rules-central"], 1, "레거시 경로형도 폴더 식별자 키");
    // 중대 회귀 가드: 경로형 `specs/041-...`가 인접형까지 발화해 바레 `041` 키를 중복 생성하면 안 됨
    // (한 참조 형태 = 한 키; spec.md "참조 형태당 단일 키").
    assert.equal(c.specCadence["041"], undefined, "경로형은 폴더 식별자 키 하나만 — 바레 041 중복 금지");
    assert.equal(c.specCadence["202607180014"], undefined, "timestamp도 프리픽스만 키로 새지 않음");
  });

  it("AC-5: timestamp 오집계 방지 — docs(spec) 절 중간 숫자·specs/ 없는 timestamp 배제", () => {
    const c = parseCommits("docs(spec): 202607180014 cap 100 chars");
    // 경로형(specs/) 아닌 docs(spec) 나열형은 3자리 절 시작만 인정 — 12자리 프리픽스·절 중간 100 모두 배제
    assert.equal(Object.keys(c.specCadence).length, 0, "specs/ 없는 timestamp·절 중간 숫자 미집계");
  });

  it("AC-3: decision 노트가 timestamp 참조를 폴더 식별자 키로 수집(cadence 키와 동일 규칙)", () => {
    const files = [
      { path: "d.md", text: '---\ntitle: "결정 T"\ndate: 2026-07-18T00:00:00\ntags: ["decision"]\n---\n관련 specs/202607180014-add-auth 참조' },
    ];
    const d = collectDecisionNotes(files);
    assert.deepEqual(d[0].specRefs, ["202607180014-add-auth"], "timestamp 폴더 식별자 전체");
  });

  it("AC-6: specs/ 경로 밖의 맨 12·14자리 숫자열은 timestamp spec으로 집계하지 않음(경로형만)", () => {
    const log = [
      "fix: 이슈 202607180014 관련 회귀", // specs/ 아님 → 미집계
      "chore: 해시 20260718153045 로깅", // 14자리 맨 숫자 → 미집계
      "feat: spec 202607180014 언급만", // adjacency지만 3자리 경계 실패 → 미집계
    ].join("\n");
    const c = parseCommits(log);
    assert.equal(Object.keys(c.specCadence).length, 0, "specs/ 앵커 없는 timestamp 숫자열은 미집계");
  });

  it("AC-4: 레거시 무회귀 — 기존 032 바레/나열/인접 형식 집계 불변", () => {
    // 032 AC-5 픽스처의 핵심을 재확인(경로형 미포함이라 line 40 변경에 불변)
    const log = [
      "feat: 기기 동기화 (031)",
      "fix: reduce to 100 items",
      "docs(spec): 022 색인, 023 벡터, 024 라벨 초안",
    ].join("\n");
    const c = parseCommits(log);
    assert.equal(c.specCadence["031"], 1);
    assert.equal(c.specCadence["100"], undefined, "spec 앵커 없는 3자리 미집계 유지");
    for (const n of ["022", "023", "024"]) assert.equal(c.specCadence[n], 1);
  });
});

// specs/202607201808-critic-efficiency FR-6 — self-review evidence 텔레메트리 집계
describe("critic-efficiency FR-6 self-review 집계", () => {
  /** FR-5 표준 frontmatter를 가진 evidence 텍스트를 만든다. */
  function fmText(fields: Record<string, string | number | boolean>, body = "본문"): string {
    const lines = ["---"];
    for (const [k, v] of Object.entries(fields)) lines.push(`${k}: ${v}`);
    lines.push("---", "", `# ${body}`);
    return lines.join("\n");
  }

  it("AC-10: spec별 라운드 수·총 blocker·최종 completion(파일 순서 비의존) + duration 합", () => {
    const files = [
      // specA: round2를 round1보다 먼저 넣어 순서 비의존을 검증
      {
        spec: "specA",
        filename: "self-review-round2.md",
        text: fmText({
          "candidate-id": "shaB",
          round: 2,
          independence: "isolated-context",
          blockers: 1,
          advisories: 0,
          "approval-needed": true,
          completion: "clean",
          "duration-minutes": 20,
        }),
      },
      {
        spec: "specA",
        filename: "self-review-round1.md",
        text: fmText({
          "candidate-id": "shaA",
          round: 1,
          independence: "isolated-context",
          blockers: 3,
          advisories: 1,
          "approval-needed": false,
          completion: "blocked",
          "duration-minutes": 15,
        }),
      },
      {
        spec: "specB",
        filename: "self-review-round1.md",
        text: fmText({
          "candidate-id": "shaC",
          round: 1,
          independence: "cross-runtime",
          blockers: 0,
          advisories: 0,
          "approval-needed": false,
          completion: "clean",
        }),
      },
    ];
    const agg = aggregateSelfReviewEvidence(files);
    const a = agg.bySpec.find((s) => s.spec === "specA")!;
    const b = agg.bySpec.find((s) => s.spec === "specB")!;
    assert.equal(a.rounds, 2);
    assert.equal(a.totalBlockers, 4, "3 + 1");
    assert.equal(a.finalCompletion, "clean", "round2(최대 round)의 completion — round1이 먼저 와도 무관");
    assert.equal(a.durationMinutesTotal, 35, "15 + 20");
    assert.equal(b.rounds, 1);
    assert.equal(b.totalBlockers, 0);
    assert.equal(b.finalCompletion, "clean");
    assert.equal(b.durationMinutesTotal, null, "duration-minutes 미기재 spec은 null");
    assert.equal(agg.nonCompliant, 0);
  });

  it("A1/AC-1: 동일 round tie-break — filename 사전순 마지막 채택(입력 순서 비의존)", () => {
    const fileA = {
      spec: "specTie",
      filename: "self-review-round2-a.md",
      text: fmText({
        "candidate-id": "shaA",
        round: 2,
        independence: "isolated-context",
        blockers: 1,
        advisories: 0,
        "approval-needed": false,
        completion: "blocked",
      }),
    };
    const fileB = {
      spec: "specTie",
      filename: "self-review-round2-b.md",
      text: fmText({
        "candidate-id": "shaB",
        round: 2,
        independence: "isolated-context",
        blockers: 0,
        advisories: 0,
        "approval-needed": false,
        completion: "clean",
      }),
    };
    const agg1 = aggregateSelfReviewEvidence([fileA, fileB]);
    const agg2 = aggregateSelfReviewEvidence([fileB, fileA]);
    const s1 = agg1.bySpec.find((s) => s.spec === "specTie")!;
    const s2 = agg2.bySpec.find((s) => s.spec === "specTie")!;
    assert.equal(s1.finalCompletion, "clean", "filename 사전순 마지막(-b)의 completion");
    assert.equal(s2.finalCompletion, "clean", "입력 순서를 뒤집어도 동일 결과");
  });

  it("A2/AC-2: 복합 YAML frontmatter(주석·따옴표 값)를 preflight와 동일하게 인식", () => {
    const text = [
      "---",
      'candidate-id: "shaZ" # 커밋 sha',
      "round: 1 # 주석",
      "independence: isolated-context",
      "blockers: 0",
      "advisories: 0",
      "approval-needed: false",
      'completion: "clean"',
      "---",
      "",
      "# 본문",
    ].join("\n");
    const agg = aggregateSelfReviewEvidence([{ spec: "specYaml", filename: "self-review-round1.md", text }]);
    assert.equal(agg.nonCompliant, 0, "복합 YAML(주석·따옴표)도 정상 인식 — 미준수 아님");
    const s = agg.bySpec.find((sp) => sp.spec === "specYaml")!;
    assert.equal(s.finalCompletion, "clean");
  });

  it("AC-11: 레거시 내성 — 필드 누락 frontmatter·frontmatter 부재 둘 다 미준수로 구분 집계, 정상 spec은 유지", () => {
    const files = [
      // (a) 실측 202607191145 관례 — frontmatter에 title/audience만, self-review 필드는 본문 bullet
      {
        spec: "legacyA",
        filename: "self-review-round1.md",
        text: [
          "---",
          "title: Self-review round 1 merged report",
          "audience: both",
          "---",
          "",
          "# Self-review round 1",
          "",
          "- candidate: `d4ac538`",
          "- completion: blocked",
        ].join("\n"),
      },
      // (b) frontmatter 자체가 없는 합성 케이스
      {
        spec: "legacyB",
        filename: "self-review-round1.md",
        text: "# Self-review round 1\n\n본문만 있고 frontmatter 없음.",
      },
      // 정상 파일 — 미준수 판정 옆에서도 집계 유지돼야 함
      {
        spec: "specA",
        filename: "self-review-round1.md",
        text: fmText({
          "candidate-id": "shaA",
          round: 1,
          independence: "isolated-context",
          blockers: 2,
          advisories: 0,
          "approval-needed": false,
          completion: "clean",
        }),
      },
    ];
    const agg = aggregateSelfReviewEvidence(files);
    assert.equal(agg.nonCompliant, 2, "레거시 2종 모두 예외 없이 미준수로 집계");
    assert.equal(agg.bySpec.find((s) => s.spec === "legacyA"), undefined, "미준수 spec은 bySpec에 없음");
    assert.equal(agg.bySpec.find((s) => s.spec === "legacyB"), undefined);
    const a = agg.bySpec.find((s) => s.spec === "specA")!;
    assert.equal(a.rounds, 1, "정상 파일 집계는 유지");
    assert.equal(a.finalCompletion, "clean");
  });

  it("AC-12: retro 렌더 — self-review 라운드 집계 절이 spec별 행으로 렌더된다", () => {
    const agg: RetroAggregate = {
      days: 14,
      repoLabel: "fixture",
      isGitRepo: true,
      commits: parseCommits(""),
      openQuestions: [],
      hasSpecsDir: true,
      decisions: [],
      query: null,
      guides: [],
      projects: [],
      insufficient: false,
      selfReview: {
        bySpec: [
          { spec: "specA", rounds: 2, totalBlockers: 4, finalCompletion: "clean", durationMinutesTotal: 35 },
          { spec: "specB", rounds: 1, totalBlockers: 0, finalCompletion: "clean", durationMinutesTotal: null },
        ],
        nonCompliant: 2,
      },
    };
    const md = renderRetro(agg, null, new Date("2026-07-20T10:00:00Z"));
    assert.ok(md.includes("self-review 라운드 집계"), "절 제목 존재");
    assert.ok(md.includes("specA") && md.includes("specB"), "spec별 행");
    assert.ok(md.includes("미준수") && md.includes("2건"), "미준수 건수 표기(은폐 금지)");
  });
});
