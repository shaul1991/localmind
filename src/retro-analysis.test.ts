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

  it("032 AC-4: 3회 임계 — 승격/관찰 분류", () => {
    const { promoted, observing } = classifyPatterns([
      { pattern: "feat", count: 3 },
      { pattern: "fix(test)", count: 2 },
      { pattern: "docs", count: 1 },
    ]);
    assert.deepEqual(promoted.map((p) => p.pattern), ["feat"]);
    assert.deepEqual(observing.map((p) => p.pattern), ["fix(test)"]);
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
      commits: parseCommits("feat: a (031)\nfeat: b\nfeat: c"),
      openQuestions: [{ spec: "031-x", text: "잔존 — 반복되면 재론", resolved: false }],
      hasSpecsDir: true,
      decisions: [],
      query: null,
      guides: [],
      projects: [],
      insufficient: false,
    };
    const md = renderRetro(agg, null, new Date("2026-07-05T10:00:00Z"));
    assert.ok(md.includes("제안까지만"), "게이트 고지");
    assert.ok(md.includes("SDD 스펙"), "개정 경로 고지");
    assert.ok(md.includes("백업 저장소에 커밋"), "reports/ 주의(§4 계열)");
    assert.ok(md.includes("사람이 판별"), "OQ 대시보드 한계 헤더(AC-2b 정합)");
    assert.ok(md.includes("제안: `feat`"), "액션 리스트 제안 표기(3회 승격)");
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
