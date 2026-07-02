/**
 * brain.ts 단위 테스트 — node:test 기반
 *
 * 임베딩 서버 불필요: extractSearchQuery·extractLinks·resolveLink(순수 함수),
 *   noteLinks AC-7(빈 vault), 인덱스 캐시·원자성·single-flight(009, 빈 vault)
 * 임베딩 서버 필요(LOCALMIND_INTEGRATION=1로만 실행): capture()·noteLinks AC-1/2/4/5
 *
 * NOTES_DIR/BRAIN_INDEX는 brain.ts 모듈 로드 시점에 한 번만 읽히므로, 이미 로드된 프로세스
 * 안에서 process.env를 나중에 바꿔도 반영되지 않는다 — 통합 테스트는 반드시 자식 프로세스를
 * 새로 띄워(runNoteLinksProbe/runCaptureProbe) 격리해야 실제 ~/.localmind를 건드리지 않는다.
 *
 * 실행: npm test
 * 통합 테스트(서버 필요): LOCALMIND_INTEGRATION=1 npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  extractSearchQuery,
  removeFromIndex,
  watchNotes,
  extractLinks,
  resolveLink,
  type BrainIndex,
} from "./brain.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BRAIN_JS = path.join(REPO_ROOT, "src", "brain.js");
const INTEGRATION = process.env.LOCALMIND_INTEGRATION === "1";

// ── extractSearchQuery 단위 테스트 ─────────────────────────────────────────

describe("extractSearchQuery", () => {
  it("일반 텍스트에서 첫 50자를 반환한다", () => {
    const q = extractSearchQuery("오늘 미팅에서 결정한 사항은 다음과 같다. 1) 배포 일정 변경");
    assert.ok(q !== null);
    assert.ok(q!.length <= 50);
    assert.ok(q!.includes("오늘 미팅"));
  });

  it("10자 미만 텍스트는 null을 반환한다 (AC-5)", () => {
    assert.equal(extractSearchQuery("짧음"), null);
    assert.equal(extractSearchQuery("Hello"), null);
    assert.equal(extractSearchQuery("9자미만임"), null);
  });

  it("frontmatter를 제외하고 본문에서 추출한다", () => {
    const text = [
      "---",
      "title: 테스트 노트",
      "date: 2026-06-30",
      "---",
      "",
      "실제 노트 본문 내용입니다 여기서부터 추출되어야 합니다",
    ].join("\n");
    const q = extractSearchQuery(text);
    assert.ok(q !== null);
    assert.ok(!q!.includes("title:"), "frontmatter 필드가 포함되면 안 됨");
    assert.ok(q!.includes("실제 노트"), "본문이 포함돼야 함");
  });

  it("마크다운 헤딩 기호(#)를 제거한다", () => {
    const text = "# 프로젝트 회고 — 2분기\n\n상세 내용 이하 생략";
    const q = extractSearchQuery(text);
    assert.ok(q !== null);
    assert.ok(!q!.startsWith("#"), "헤딩 기호가 제거돼야 함");
    assert.ok(q!.includes("프로젝트 회고"));
  });

  it("빈 문자열은 null을 반환한다", () => {
    assert.equal(extractSearchQuery(""), null);
    assert.equal(extractSearchQuery("   \n  "), null);
  });

  it("50자 초과 텍스트는 50자로 잘린다", () => {
    const long = "가".repeat(100);
    const q = extractSearchQuery(long);
    assert.ok(q !== null);
    assert.equal(q!.length, 50);
  });
});

// ── extractLinks 단위 테스트 ───────────────────────────────────────────────

describe("extractLinks", () => {
  it("[[target]] 형식의 위키링크를 추출한다", () => {
    assert.deepEqual(extractLinks("본문에 [[노트B]]가 있다"), ["노트B"]);
  });

  it("AC-3: [[target|alias]] 형식에서 target만 추출하고 alias는 버린다", () => {
    assert.deepEqual(extractLinks("[[노트B|표시 텍스트]]"), ["노트B"]);
  });

  it("여러 링크를 순서대로 모두 추출한다", () => {
    assert.deepEqual(extractLinks("[[A]] 그리고 [[B|별칭]] 그리고 [[C]]"), ["A", "B", "C"]);
  });

  it("링크가 없으면 빈 배열을 반환한다", () => {
    assert.deepEqual(extractLinks("위키링크가 전혀 없는 평범한 텍스트"), []);
  });

  it("경로 형태의 타겟(폴더/하위폴더/노트명)도 그대로 추출한다", () => {
    assert.deepEqual(extractLinks("[[personal/project/README]]"), ["personal/project/README"]);
  });
});

// ── resolveLink 단위 테스트 ────────────────────────────────────────────────

describe("resolveLink", () => {
  function mockIndex(): BrainIndex {
    return {
      version: 3,
      files: {
        "work/note-b.md": { hash: "h1", folder: "work", chunks: [], linksOut: [] },
        "life/note-b.md": { hash: "h2", folder: "life", chunks: [], linksOut: [] },
        "work/only-here.md": { hash: "h3", folder: "work", chunks: [], linksOut: [] },
      },
    };
  }

  it("basename이 일치하는 노트를 해석한다", () => {
    const idx = mockIndex();
    assert.equal(resolveLink("only-here", "work", idx), "work/only-here.md");
  });

  it("AC-4: 매칭되는 파일이 없으면 null(미해결)을 반환한다", () => {
    const idx = mockIndex();
    assert.equal(resolveLink("존재하지않는노트", "work", idx), null);
  });

  it("AC-6: 동일 basename이 여러 폴더에 있으면 같은 폴더(fromFolder)를 우선한다", () => {
    const idx = mockIndex();
    assert.equal(resolveLink("note-b", "work", idx), "work/note-b.md");
    assert.equal(resolveLink("note-b", "life", idx), "life/note-b.md");
  });

  it("같은 폴더에 없으면 전체 vault에서 첫 매칭을 사용한다", () => {
    const idx = mockIndex();
    // 'other' 폴더에서 링크했지만 note-b는 work/life에만 존재 → 첫 매칭(work) 사용
    assert.equal(resolveLink("note-b", "other", idx), "work/note-b.md");
  });

  it("타겟에 경로가 포함돼도 basename만으로 매칭한다", () => {
    const idx = mockIndex();
    assert.equal(resolveLink("아무경로/only-here", "work", idx), "work/only-here.md");
  });

  it("회귀: basename 매칭은 대소문자를 구분하지 않는다(self-review에서 발견)", () => {
    const idx = mockIndex();
    assert.equal(resolveLink("Only-Here", "work", idx), "work/only-here.md");
    assert.equal(resolveLink("ONLY-HERE", "work", idx), "work/only-here.md");
  });
});

// ── noteLinks 통합 테스트 (격리된 자식 프로세스로 실제 ~/.localmind 오염 방지) ──
//
// brain.ts는 NOTES_DIR/BRAIN_INDEX를 모듈 로드 시점에 한 번만 읽으므로, 이미 로드된
// 프로세스 안에서 process.env.NOTES_DIR을 나중에 바꿔도 반영되지 않는다. 따라서 실제
// 격리를 위해서는 자식 프로세스를 env와 함께 새로 띄워야 한다.

function runNoteLinksProbe(notesDir: string, notePath: string, env: Record<string, string> = {}): any {
  const script = [
    `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
    `  await m.reindex();`,
    `  const nl = await m.noteLinks(${JSON.stringify(notePath)});`,
    `  process.stdout.write(JSON.stringify(nl));`,
    `}).catch((e) => { console.error(e); process.exit(1); });`,
  ].join("\n");
  const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
      // 라벨을 "notes"로 명시 — 안 하면 mkdtemp가 만든 임시 폴더명(무작위 접미사 포함)이
      // 라벨이 되어 테스트의 'notes/파일명' 경로 가정이 깨진다.
      NOTES_DIR: `notes=${notesDir}`,
      BRAIN_INDEX: path.join(notesDir, ".brain-index.json"),
    },
  });
  return JSON.parse(out);
}

describe("noteLinks — AC-7 (임베딩 불필요: 빈 vault)", () => {
  it("AC-7: 인덱스에 없는 노트 경로로 조회하면 null을 반환한다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-notelinks-empty-"));
    try {
      const result = runNoteLinksProbe(dir, "nonexistent/path.md");
      assert.equal(result, null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// INTEGRATION 플래그는 파일 하단(capture() 통합 테스트 앞)에서 한 번만 선언한다.
describe("noteLinks — AC-1/2/5 (통합 — 임베딩 서버 필요)", { skip: !INTEGRATION }, () => {
  it("AC-1: outgoing — 노트A가 [[노트B]]를 링크하면 noteLinks(A)에 B가 해석된 상태로 포함된다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-notelinks-ac1-"));
    try {
      fs.writeFileSync(path.join(dir, "note-a.md"), "노트A 본문입니다. [[note-b]]를 참고하세요.");
      fs.writeFileSync(path.join(dir, "note-b.md"), "노트B 본문입니다. 별다른 링크는 없습니다.");
      const result = runNoteLinksProbe(dir, "notes/note-a.md");
      assert.ok(result, "노트A의 링크 정보가 반환돼야 한다");
      const outgoing = result.outgoing as { target: string; resolved: boolean }[];
      assert.ok(outgoing.some((l) => l.resolved && l.target === "notes/note-b.md"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("AC-2: incoming — 노트A가 [[노트B]]를 링크하면 noteLinks(B)의 incoming에 A가 포함된다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-notelinks-ac2-"));
    try {
      fs.writeFileSync(path.join(dir, "note-a.md"), "노트A 본문입니다. [[note-b]]를 참고하세요.");
      fs.writeFileSync(path.join(dir, "note-b.md"), "노트B 본문입니다. 별다른 링크는 없습니다.");
      const result = runNoteLinksProbe(dir, "notes/note-b.md");
      assert.ok(result);
      assert.ok((result.incoming as string[]).includes("notes/note-a.md"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("AC-5: 위키링크가 전혀 없는 노트는 outgoing/incoming이 모두 빈 배열이다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-notelinks-ac5-"));
    try {
      fs.writeFileSync(path.join(dir, "lonely.md"), "이 노트는 어디에도 링크되지 않고 어디도 링크하지 않는다.");
      const result = runNoteLinksProbe(dir, "notes/lonely.md");
      assert.ok(result);
      assert.deepEqual(result.outgoing, []);
      assert.deepEqual(result.incoming, []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("AC-4(통합 확인): 미해결 링크가 있으면 outgoing에 resolved:false로 포함된다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-notelinks-ac4-"));
    try {
      fs.writeFileSync(path.join(dir, "note-a.md"), "본문에 [[존재하지않는노트]] 링크가 있다.");
      const result = runNoteLinksProbe(dir, "notes/note-a.md");
      assert.ok(result);
      const outgoing = result.outgoing as { target: string; resolved: boolean }[];
      assert.ok(outgoing.some((l) => !l.resolved && l.target === "존재하지않는노트"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── removeFromIndex 단위 테스트 ────────────────────────────────────────────

describe("removeFromIndex", () => {
  it("존재하지 않는 키를 제거해도 오류가 없다 (AC-3 안전성)", () => {
    assert.doesNotThrow(() => removeFromIndex("nonexistent/key.md"));
  });
});

// ── watchNotes 단위 테스트 ─────────────────────────────────────────────────

describe("watchNotes", () => {
  it("close()가 존재하고 에러 없이 호출된다 (AC-6 — 기동/종료)", () => {
    // NOTES_DIR이 없는 경우에도 watchNotes()는 throw하지 않고 빈 watcher를 반환
    const savedDir = process.env.NOTES_DIR;
    process.env.NOTES_DIR = "/tmp/nonexistent-localmind-test-dir";
    const watcher = watchNotes();
    assert.ok(typeof watcher.close === "function");
    assert.doesNotThrow(() => watcher.close());
    process.env.NOTES_DIR = savedDir;
  });

  it("실제 폴더를 감시하고 close()로 정리된다 (AC-6 — 다중 폴더)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-watch-test-"));
    try {
      process.env.NOTES_DIR = tmpDir;
      const watcher = watchNotes();
      assert.ok(typeof watcher.close === "function");
      watcher.close(); // 정리 확인
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      delete process.env.NOTES_DIR;
    }
  });
});

// ── capture() 검증 통합 테스트 (임베딩 서버 필요) ─────────────────────────
//
// 주의(회귀 발견): brain.ts는 NOTES_DIR/BRAIN_INDEX를 모듈 로드 시점에 한 번만 읽는다.
// 예전엔 이 테스트가 it("setup") 안에서 process.env.NOTES_DIR을 바꿨는데, 그 시점엔
// 이미 brain.js가 로드돼 있어 반영되지 않았다 — 즉 실제로는 격리되지 않고 진짜
// ~/.localmind에 테스트 노트를 만들고 있었다(005 작업 중 실행해 실제로 오염 발생·확인 후
// 정리함). noteLinks 테스트와 동일하게 자식 프로세스로 완전히 격리한다.

function runCaptureProbe(notesDir: string, text: string, title?: string): any {
  const script = [
    `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
    `  const result = await m.capture(${JSON.stringify(text)}, ${title ? JSON.stringify(title) : "undefined"});`,
    `  process.stdout.write(JSON.stringify(result));`,
    `}).catch((e) => { console.error(e); process.exit(1); });`,
  ].join("\n");
  const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      NOTES_DIR: `notes=${notesDir}`,
      BRAIN_INDEX: path.join(notesDir, ".brain-index.json"),
    },
  });
  return JSON.parse(out);
}

describe("capture() 검증 루프 (통합 — 임베딩 서버 필요)", { skip: !INTEGRATION }, () => {
  it("AC-1: 정상 캡처 시 validationStatus가 confirmed이다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-capture-ac1-"));
    try {
      const result = runCaptureProbe(dir, "오늘 미팅에서 결정한 사항: 배포 일정을 다음 주로 연기한다", "미팅 결정 사항");
      assert.equal(result.validationStatus, "confirmed", "인덱싱이 확인돼야 한다");
      assert.equal(result.retried, false);
      assert.ok(result.path.endsWith(".md"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("AC-5: 10자 미만 텍스트는 validationStatus가 skipped이다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-capture-ac5-"));
    try {
      const result = runCaptureProbe(dir, "짧음");
      assert.equal(result.validationStatus, "skipped");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── 009: 인덱스 원자성·캐싱·동시성 (임베딩 불필요 — 순수 인덱스 IO) ──────────
//
// loadIndex/saveIndex는 INDEX_PATH(모듈 로드 시 고정)에 묶여 있어, 실제 ~/.localmind
// 오염을 막으려면 자식 프로세스로 BRAIN_INDEX/NOTES_DIR을 격리해야 한다.

function runBrainProbe(scriptBody: string): any {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-index-"));
  const idxPath = path.join(tmp, ".brain-index.json");
  const script = [
    `import * as fs from "node:fs";`,
    `const idxPath = process.env.BRAIN_INDEX;`,
    `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
    scriptBody,
    `}).catch((e) => { console.error(e); process.exit(1); });`,
  ].join("\n");
  try {
    const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        NOTES_DIR: `notes=${tmp}`,
        BRAIN_INDEX: idxPath,
      },
    });
    return JSON.parse(out);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

describe("인덱스 캐시·원자성·동시성 (009)", () => {
  it("AC-1: 파일 변경이 없으면 두 번째 loadIndex는 같은 객체를 반환한다(캐시 적중)", () => {
    const r = runBrainProbe(`
      const V = m.loadIndex().version;
      m.saveIndex({ version: V, files: {} });
      const a = m.loadIndex();
      const b = m.loadIndex();
      process.stdout.write(JSON.stringify({ same: a === b }));
    `);
    assert.equal(r.same, true);
  });

  it("AC-2: 외부에서 파일이 바뀌면(mtime/size 변화) 다시 읽는다", () => {
    const r = runBrainProbe(`
      const V = m.loadIndex().version;
      m.saveIndex({ version: V, files: { "a/x.md": { hash: "h", folder: "a", chunks: [], linksOut: [] } } });
      m.loadIndex(); // 캐시 적중 상태 만들기
      // 외부 변경 시뮬: saveIndex 안 거치고 파일 직접 교체 + mtime 강제 변경
      fs.writeFileSync(idxPath, JSON.stringify({ version: V, files: { "b/y.md": { hash: "h2", folder: "b", chunks: [], linksOut: [] } } }));
      const future = Date.now() / 1000 + 10;
      fs.utimesSync(idxPath, future, future);
      const after = m.loadIndex();
      process.stdout.write(JSON.stringify({ keys: Object.keys(after.files) }));
    `);
    assert.deepEqual(r.keys, ["b/y.md"]);
  });

  // 참고: "temp 쓰기 도중 중단 시 원본 온전"은 fs.renameSync의 POSIX 원자성(OS 보장)에
  // 의존하므로 유닛 테스트로 중단을 재현하기 부적절하다. 여기서는 원자적 쓰기의 관측 가능한
  // 결과(잔여 temp 없음 + 기존 인덱스가 새 내용으로 온전히 교체됨)를 검증한다.
  it("AC-3: saveIndex는 원자적이다 — temp 잔여 없이 기존 인덱스를 온전히 교체한다", () => {
    const r = runBrainProbe(`
      const V = m.loadIndex().version;
      // 기존 인덱스가 있는 상태에서 새 내용으로 교체(중단 없이 정상 경로).
      m.saveIndex({ version: V, files: { "old/a.md": { hash: "h", folder: "old", chunks: [], linksOut: [] } } });
      m.saveIndex({ version: V, files: { "new/b.md": { hash: "h2", folder: "new", chunks: [], linksOut: [] } } });
      let parsed = null;
      try { parsed = JSON.parse(fs.readFileSync(idxPath, "utf8")); } catch {}
      process.stdout.write(JSON.stringify({
        tmpExists: fs.existsSync(idxPath + ".tmp"),
        keys: parsed ? Object.keys(parsed.files) : null,
      }));
    `);
    assert.equal(r.tmpExists, false, "temp 파일이 남으면 안 된다");
    assert.deepEqual(r.keys, ["new/b.md"], "새 내용으로 온전히 교체돼야 한다");
  });

  it("AC-4: 동시 호출은 1회로 합치고(single-flight), 종료 후 새 호출은 새로 실행한다", () => {
    const r = runBrainProbe(`
      m._resetIndexCacheForTest();
      // reindex()는 내부에서 ensureIndexed()를 호출한다. 빈 vault라 임베딩 없이 스캔만.
      // 1) 동시 3회 → in-flight 공유 → 실제 실행 1회
      await Promise.all([m.reindex(), m.reindex(), m.reindex()]);
      const afterConcurrent = m._indexRunCountForTest();
      // 2) 앞 실행이 끝난 뒤(in-flight=null) 새 호출 → 새 실행 → 2회
      await m.reindex();
      const afterSequential = m._indexRunCountForTest();
      process.stdout.write(JSON.stringify({ afterConcurrent, afterSequential }));
    `);
    assert.equal(r.afterConcurrent, 1, "동시 3회는 1회로 합쳐져야 한다");
    assert.equal(r.afterSequential, 2, "in-flight 종료 후 새 호출은 새로 실행돼야 한다");
  });

  it("AC-6: 캐시가 있어도 파일이 삭제되면 빈 인덱스를 반환한다(낡은 캐시 금지)", () => {
    const r = runBrainProbe(`
      const V = m.loadIndex().version;
      m.saveIndex({ version: V, files: { "a/x.md": { hash: "h", folder: "a", chunks: [], linksOut: [] } } });
      m.loadIndex(); // 캐시 적중
      fs.unlinkSync(idxPath);
      const after = m.loadIndex();
      process.stdout.write(JSON.stringify({ fileCount: Object.keys(after.files).length }));
    `);
    assert.equal(r.fileCount, 0);
  });
});
