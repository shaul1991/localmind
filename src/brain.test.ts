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
  moveToTrash,
  chunkText,
  createNoteFile,
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

// ── moveToTrash (soft-delete) 단위 테스트 — specs/011 트랙 B ────────────────
// 순수 fs 연산이라 임베딩/인덱싱 없이 검증한다(deleteNote는 이 위에 ensureIndexed만 얹음).
describe("moveToTrash (soft-delete)", () => {
  function tmpFolder(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "lm-trash-"));
  }

  it("AC-5(파일): 원위치에서 사라지고 .trash/로 이동한다", () => {
    const dir = tmpFolder();
    const note = path.join(dir, "note.md");
    fs.writeFileSync(note, "hello");
    const dest = moveToTrash(note, dir);
    assert.ok(!fs.existsSync(note), "원위치에서 사라짐");
    assert.equal(dest, path.join(dir, ".trash", "note.md"));
    assert.equal(fs.readFileSync(dest, "utf8"), "hello", "내용 보존(복구 가능)");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("AC-9: 하위폴더 상대경로가 .trash/sub/note.md로 보존된다", () => {
    const dir = tmpFolder();
    fs.mkdirSync(path.join(dir, "sub"), { recursive: true });
    const note = path.join(dir, "sub", "note.md");
    fs.writeFileSync(note, "x");
    const dest = moveToTrash(note, dir);
    assert.equal(dest, path.join(dir, ".trash", "sub", "note.md"));
    assert.ok(fs.existsSync(dest));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("AC-7: 같은 이름을 두 번 삭제해도 휴지통에 둘 다 보존(덮어쓰기 없음)", () => {
    const dir = tmpFolder();
    const note = path.join(dir, "note.md");
    fs.writeFileSync(note, "first");
    const d1 = moveToTrash(note, dir);
    fs.writeFileSync(note, "second"); // 재생성
    const d2 = moveToTrash(note, dir);
    assert.notEqual(d1, d2, "두 목적지가 다름");
    assert.ok(fs.existsSync(d1) && fs.existsSync(d2), "둘 다 존재");
    const trashFiles = fs.readdirSync(path.join(dir, ".trash"));
    assert.equal(trashFiles.length, 2, "휴지통에 2개");
    assert.equal(fs.readFileSync(d1, "utf8"), "first");
    assert.equal(fs.readFileSync(d2, "utf8"), "second");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ── specs/013 트랙 B — chunkText 분할 불변식 (FR-4, AC-6) ──────────────────
// 기본 MAX_CHUNK=2000(BRAIN_CHUNK_SIZE 미설정) 기준. 순수 함수라 직접 검증.

describe("chunkText — 분할 불변식 (013 AC-6)", () => {
  const MAX = 2000;

  /** 공백을 제외한 내용이 청크 합집합에 전부 보존됐는지(유실 0) */
  function strippedEqual(text: string, chunks: string[]): boolean {
    return chunks.join("").replace(/\s+/g, "") === text.replace(/\s+/g, "");
  }

  it("AC-6: 빈 줄 없는 5,000자 문단도 잘리지 않고 전부 분할된다(꼬리 유실 0)", () => {
    const tail = "이것이문단의마지막고유문구다"; // 기존 버그: 앞 2000자만 남고 이 꼬리가 유실됐다
    const text = "가나다라마바사아자차카타파하 ".repeat(330) + tail; // ~5,000자, 빈 줄 없음
    const chunks = chunkText(text);
    assert.ok(chunks.length >= 3, "여러 청크로 분할돼야 한다");
    for (const c of chunks) assert.ok(c.length <= MAX, `청크가 MAX(${MAX})를 넘으면 안 됨: ${c.length}`);
    assert.ok(strippedEqual(text, chunks), "공백 제외 내용 유실이 없어야 한다");
    assert.ok(chunks[chunks.length - 1].includes(tail), "문단 꼬리가 마지막 청크에 존재");
  });

  it("AC-6: 경계값 — 정확히 MAX 길이는 1청크, MAX+1은 분할되되 유실이 없다", () => {
    const exact = "a".repeat(MAX);
    assert.deepEqual(chunkText(exact), [exact]);

    const over = "b".repeat(MAX + 1); // 공백·문장 경계가 전혀 없는 극단 — 고정 창 분할
    const chunks = chunkText(over);
    assert.ok(chunks.length === 2);
    for (const c of chunks) assert.ok(c.length <= MAX);
    assert.ok(strippedEqual(over, chunks));
  });

  it("AC-6: 문장 경계가 있으면 경계에서 나눈다(문장이 중간에 동강나지 않음)", () => {
    const sentence = "이 문장은 충분히 길어서 여러 번 반복하면 청크 한계를 넘게 된다. ";
    const text = sentence.repeat(60); // ~2,700자
    const chunks = chunkText(text);
    assert.ok(chunks.length >= 2);
    for (const c of chunks) assert.ok(c.length <= MAX);
    assert.ok(strippedEqual(text, chunks));
    // 경계 분할 확인: 각 청크가 문장 종결로 끝난다
    for (const c of chunks.slice(0, -1)) assert.ok(c.trimEnd().endsWith("."), `문장 경계에서 잘려야 함: ...${c.slice(-20)}`);
  });

  it("기존 동작 보존: 짧은 문단들은 하나의 청크로 합쳐진다", () => {
    const text = "첫 문단입니다.\n\n둘째 문단입니다.\n\n셋째 문단입니다.";
    assert.deepEqual(chunkText(text), ["첫 문단입니다.\n\n둘째 문단입니다.\n\n셋째 문단입니다."]);
  });

  it("빈 입력은 빈 배열", () => {
    assert.deepEqual(chunkText(""), []);
    assert.deepEqual(chunkText("   \n\n  "), []);
  });
});

// ── specs/013 트랙 C — createNoteFile 배타 생성 (FR-8, AC-10) ───────────────

describe("createNoteFile — capture 파일명 충돌 방지 (013 AC-10)", () => {
  it("AC-10: 같은 파일명으로 두 번 생성해도 덮어쓰지 않고 둘 다 보존된다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-capture-collide-"));
    try {
      const f1 = createNoteFile(dir, "2026-07-03T10-00-00-메모.md", "첫 노트");
      const f2 = createNoteFile(dir, "2026-07-03T10-00-00-메모.md", "둘째 노트");
      assert.notEqual(f1, f2, "파일명이 달라야 한다");
      assert.equal(fs.readFileSync(path.join(dir, f1), "utf8"), "첫 노트", "첫 노트가 보존된다");
      assert.equal(fs.readFileSync(path.join(dir, f2), "utf8"), "둘째 노트");
      assert.ok(f2.endsWith(".md"), "접미가 붙어도 .md 확장자 유지");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("충돌이 없으면 요청한 파일명 그대로 생성된다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-capture-plain-"));
    try {
      const f = createNoteFile(dir, "note.md", "본문");
      assert.equal(f, "note.md");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── specs/013 트랙 C — deleteNote 대상 제한 (FR-7, AC-9) ────────────────────
// deleteNote는 FOLDERS(모듈 로드 시 고정)에 묶여 있어 자식 프로세스로 격리한다.

function runDeleteProbe(notesDir: string, targets: string[]): any {
  const script = [
    `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
    `  const out = [];`,
    `  for (const t of ${JSON.stringify(targets)}) out.push(await m.deleteNote(t));`,
    `  process.stdout.write(JSON.stringify(out));`,
    `}).catch((e) => { console.error(e); process.exit(1); });`,
  ].join("\n");
  const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      NOTES_DIR: `notes=${notesDir}`,
      BRAIN_INDEX: path.join(notesDir, ".brain-index.json"),
      // 삭제 성공 경로의 ensureIndexed가 임베딩을 부르지 않도록 빈 vault 유지가 원칙이나,
      // 여기서는 거부 경로만 검증하므로 임베딩 서버가 필요 없다.
    },
  });
  return JSON.parse(out);
}

describe("deleteNote — 대상 제한 (013 AC-9)", () => {
  it("AC-9: 비-.md·숨김 파일·폴더 탈출 경로는 거부되고 파일이 그대로 남는다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-delete-guard-"));
    try {
      fs.writeFileSync(path.join(dir, "data.txt"), "plain");
      fs.writeFileSync(path.join(dir, ".brain-index.json"), "{}");
      fs.mkdirSync(path.join(dir, ".trash"), { recursive: true });
      fs.writeFileSync(path.join(dir, ".trash", "old.md"), "trashed");
      const outside = path.join(path.dirname(dir), `outside-${path.basename(dir)}.md`);
      fs.writeFileSync(outside, "outside");
      // 심링크 경유 탈출(결함 3): notes/linkdir → 폴더 밖 디렉토리
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-delete-outside-"));
      fs.writeFileSync(path.join(outsideDir, "real.md"), "vault 밖 실제 파일");
      fs.symlinkSync(outsideDir, path.join(dir, "linkdir"));
      try {
        const results = runDeleteProbe(dir, [
          "notes/data.txt", // 비-.md
          "notes/.brain-index.json", // 숨김(인덱스 파일)
          "notes/.trash/old.md", // 숨김 폴더 내부
          `notes/../${path.basename(outside)}`, // 폴더 탈출(기존 동작 회귀 고정)
          "notes/no-such.md", // 없음
          "notes/linkdir/real.md", // 심링크 경유 탈출(결함 3)
        ]);
        for (const r of results) assert.equal(r.ok, false, `거부돼야 함: ${JSON.stringify(r)}`);
        assert.equal(results[0].reason, "invalid-target", "비-.md는 invalid-target");
        assert.equal(results[1].reason, "invalid-target", "숨김 파일은 invalid-target");
        assert.equal(results[2].reason, "invalid-target", "숨김 폴더 내부는 invalid-target");
        assert.equal(results[4].reason, "not-found", "존재하지 않는 노트는 not-found");
        assert.equal(results[5].reason, "invalid-target", "심링크 경유 vault 밖 파일은 invalid-target");
        // 파일이 전부 그대로 남아 있다
        assert.ok(fs.existsSync(path.join(dir, "data.txt")));
        assert.ok(fs.existsSync(path.join(dir, ".brain-index.json")));
        assert.ok(fs.existsSync(path.join(dir, ".trash", "old.md")));
        assert.ok(fs.existsSync(outside));
        assert.ok(fs.existsSync(path.join(outsideDir, "real.md")), "vault 밖 파일이 이동되지 않아야 한다");
      } finally {
        fs.rmSync(outside, { force: true });
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── specs/004 — 쿼리 로그 (FR-1·2·3, AC-1·2·3) ─────────────────────────────
// searchNotes는 쿼리 임베딩이 필요하므로, 프로브 안에서 임시 HTTP 임베딩 스텁을 띄워
// 외부 서버 없이 검증한다(고정 벡터 반환 — 유사도 값은 무관, 로깅 경로만 확인).

function runQueryLogProbe(notesDir: string, body: string): any {
  const script = [
    `const http = require("node:http");`,
    `const fsx = require("node:fs");`,
    `const srv = http.createServer((req, res) => {`,
    `  let raw = ""; req.on("data", (c) => (raw += c));`,
    `  req.on("end", () => {`,
    `    res.setHeader("content-type", "application/json");`,
    `    if ((req.url || "").includes("chat/completions")) {`,
    `      res.end(JSON.stringify({ choices: [{ message: { content: "노트 기반 답변 [notes/x.md]" } }] }));`,
    `      return;`,
    `    }`,
    `    const n = (JSON.parse(raw).input || []).length;`,
    `    res.end(JSON.stringify({ data: Array.from({ length: n }, (_, i) => ({ index: i, embedding: [1, 0, 0, 0] })) }));`,
    `  });`,
    `});`,
    `srv.listen(0, async () => {`,
    `  const base = "http://127.0.0.1:" + srv.address().port;`,
    `  process.env.EMBEDDINGS_URL = base + "/v1";`,
    `  process.env.LOCALMIND_URL = base; // ask_brain 종합(gateway)도 스텁으로`,
    `  const m = await import(${JSON.stringify(BRAIN_JS)});`,
    `  try {`,
    body,
    `  } catch (e) { console.error(e); process.exit(1); }`,
    `  srv.close();`,
    `});`,
  ].join("\n");
  const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      NOTES_DIR: `notes=${notesDir}`,
      BRAIN_INDEX: path.join(notesDir, ".brain-index.json"),
      QUERY_LOG: path.join(notesDir, "query-log.jsonl"),
      EMBEDDINGS_KEY: "test-key",
      EMBED_RETRIES: "1",
    },
  });
  return JSON.parse(out);
}

describe("쿼리 로그 (004)", () => {
  it("AC-1: 히트 없는 검색이 hitCount:0, success:false로 기록된다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-qlog-ac1-"));
    try {
      const r = runQueryLogProbe(dir, `
        await m.searchNotes("아무것도 없는 주제");
        // 로깅은 fire-and-forget(비동기 append) — 파일 '존재'가 아니라 '내용'을 기다린다.
        // appendFile은 open(생성) 후 write라, 그 사이에 읽으면 빈 파일이다(CI에서 발현된 경합).
        const ready = () => {
          try { return fsx.readFileSync(process.env.QUERY_LOG, "utf8").trim().length > 0; }
          catch { return false; }
        };
        for (let i = 0; i < 100 && !ready(); i++) await new Promise((r) => setTimeout(r, 20));
        const lines = fsx.readFileSync(process.env.QUERY_LOG, "utf8").trim().split("\\n").filter(Boolean).map(JSON.parse);
        process.stdout.write(JSON.stringify(lines));
      `);
      const rec = r.find((x: any) => x.tool === "search_notes");
      assert.ok(rec, "search_notes 레코드가 있어야 한다");
      assert.equal(rec.hitCount, 0);
      assert.equal(rec.success, false);
      assert.equal(rec.query, "아무것도 없는 주제");
      assert.ok(typeof rec.ts === "string" && !Number.isNaN(Date.parse(rec.ts)));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("AC-1(보강): capture는 validationStatus와 함께, 히트 있는 검색은 success:true로 기록된다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-qlog-ac2-"));
    try {
      const r = runQueryLogProbe(dir, `
        await m.capture("백업 절차를 정리한 노트 본문입니다. 자세한 단계는 다음과 같습니다.", "백업 절차");
        await m.searchNotes("백업 절차");
        // 로깅은 fire-and-forget(비동기 append) — 레코드 2건 반영을 잠시 대기
        const enough = () => {
          try { return fsx.readFileSync(process.env.QUERY_LOG, "utf8").trim().split("\\n").length >= 2; }
          catch { return false; }
        };
        for (let i = 0; i < 100 && !enough(); i++) await new Promise((r) => setTimeout(r, 20));
        const lines = fsx.readFileSync(process.env.QUERY_LOG, "utf8").trim().split("\\n").filter(Boolean).map(JSON.parse);
        process.stdout.write(JSON.stringify(lines));
      `);
      const cap = r.find((x: any) => x.tool === "capture_note");
      assert.ok(cap, "capture_note 레코드");
      assert.equal(cap.captureValidation, "confirmed");
      const srch = r.find((x: any) => x.tool === "search_notes");
      assert.ok(srch, "search_notes 레코드");
      assert.equal(srch.success, true);
      assert.ok(srch.hitCount >= 1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("AC-2: ask_brain이 sources·success와 함께 기록되고, 1회 호출은 레코드 1건이다(D-1 이중 기록 방지)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-qlog-ask-"));
    try {
      const r = runQueryLogProbe(dir, `
        await m.capture("백업 절차를 정리한 노트 본문입니다. 자세한 단계는 다음과 같습니다.", "백업 절차");
        const ans = await m.askBrain("백업 절차가 뭐지?");
        const enough = () => {
          try { return fsx.readFileSync(process.env.QUERY_LOG, "utf8").trim().split("\\n").length >= 2; }
          catch { return false; }
        };
        for (let i = 0; i < 100 && !enough(); i++) await new Promise((r) => setTimeout(r, 20));
        const lines = fsx.readFileSync(process.env.QUERY_LOG, "utf8").trim().split("\\n").filter(Boolean).map(JSON.parse);
        process.stdout.write(JSON.stringify({ lines, sources: ans.sources }));
      `);
      const ask = r.lines.filter((x: any) => x.tool === "ask_brain");
      assert.equal(ask.length, 1, "ask_brain 레코드는 1건");
      assert.equal(ask[0].success, true);
      assert.ok(Array.isArray(ask[0].sources) && ask[0].sources.length >= 1, "sources가 기록된다");
      // D-1: askBrain 경유 검색은 search_notes 레코드를 만들지 않는다(이중 기록·빈도 왜곡 방지)
      const search = r.lines.filter((x: any) => x.tool === "search_notes");
      assert.equal(search.length, 0, "위임 검색이 search_notes로 중복 기록되면 안 된다");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("AC-3: 로그 기록이 실패해도(쓰기 불가 경로) 검색 응답은 정상 반환된다(fire-and-forget)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-qlog-ac3-"));
    try {
      const script = [
        `const http = require("node:http");`,
        `const srv = http.createServer((req, res) => {`,
        `  let raw = ""; req.on("data", (c) => (raw += c));`,
        `  req.on("end", () => {`,
        `    const n = (JSON.parse(raw).input || []).length;`,
        `    res.setHeader("content-type", "application/json");`,
        `    res.end(JSON.stringify({ data: Array.from({ length: n }, (_, i) => ({ index: i, embedding: [1, 0, 0, 0] })) }));`,
        `  });`,
        `});`,
        `srv.listen(0, async () => {`,
        `  process.env.EMBEDDINGS_URL = "http://127.0.0.1:" + srv.address().port + "/v1";`,
        `  const m = await import(${JSON.stringify(BRAIN_JS)});`,
        `  const hits = await m.searchNotes("정상 동작 확인");`,
        `  process.stdout.write(JSON.stringify({ ok: Array.isArray(hits) }));`,
        `  srv.close();`,
        `});`,
      ].join("\n");
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          NOTES_DIR: `notes=${dir}`,
          BRAIN_INDEX: path.join(dir, ".brain-index.json"),
          QUERY_LOG: "/dev/null/불가능한/경로/query-log.jsonl", // 쓰기 불가
          EMBEDDINGS_KEY: "test-key",
          EMBED_RETRIES: "1",
        },
      });
      assert.equal(JSON.parse(out).ok, true, "로그 실패가 검색을 막으면 안 된다");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── specs/013 트랙 B — 다중 프로세스 인덱스 안전 (FR-6, AC-11·12) ───────────

describe("인덱스 다중 프로세스 안전 (013)", () => {
  it("AC-11: 다른 프로세스가 먼저 저장한 엔트리가 내 저장으로 유실되지 않는다(reload-merge)", () => {
    const r = runBrainProbe(`
      const V = m.loadIndex().version;
      const fe = (folder) => ({ hash: "h", folder, chunks: [], linksOut: [] });
      // 내 로드 시점: a만 있는 인덱스 저장(cachedStat 확정)
      m.saveIndex({ version: V, files: { "notes/a.md": fe("notes") } });
      // 다른 프로세스 저장 시뮬: saveIndex를 거치지 않고 직접 교체(b 추가) + mtime 변경
      fs.writeFileSync(idxPath, JSON.stringify({ version: V, files: { "notes/a.md": fe("notes"), "notes/b.md": fe("notes") } }));
      const future = Date.now() / 1000 + 10;
      fs.utimesSync(idxPath, future, future);
      // 내 저장: c를 추가 — b가 유실되면 안 된다
      m.saveIndex({ version: V, files: { "notes/a.md": fe("notes"), "notes/c.md": fe("notes") } });
      const finalIdx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
      process.stdout.write(JSON.stringify({ keys: Object.keys(finalIdx.files).sort() }));
    `);
    assert.deepEqual(r.keys, ["notes/a.md", "notes/b.md", "notes/c.md"], "양쪽 갱신이 모두 보존돼야 한다");
  });

  it("AC-12: 죽은 프로세스의 stale 락이 있어도 저장이 유한 시간 안에 완료된다", () => {
    const r = runBrainProbe(`
      const V = m.loadIndex().version;
      // 고아 락 파일(오래된 mtime) — 락 보유 프로세스가 죽은 상황
      fs.writeFileSync(idxPath + ".lock", "");
      const past = (Date.now() - 60_000) / 1000;
      fs.utimesSync(idxPath + ".lock", past, past);
      const t0 = Date.now();
      m.saveIndex({ version: V, files: {} });
      process.stdout.write(JSON.stringify({
        ms: Date.now() - t0,
        lockGone: !fs.existsSync(idxPath + ".lock"),
        saved: fs.existsSync(idxPath),
      }));
    `);
    assert.ok(r.saved, "저장이 완료돼야 한다");
    assert.ok(r.lockGone, "저장 후 락이 남지 않는다");
    assert.ok(r.ms < 5000, `영구 대기 없이 완료돼야 한다(${r.ms}ms)`);
  });

  it("결함1 회귀: 중간의 무관한 loadIndex가 있어도 병합 기준(객체별 스냅샷)이 유지된다", () => {
    const r = runBrainProbe(`
      const V = m.loadIndex().version;
      const fe = (folder) => ({ hash: "h", folder, chunks: [], linksOut: [] });
      m.saveIndex({ version: V, files: { "notes/a.md": fe("notes") } });
      const mine = m.loadIndex(); // 내 작업본 — 이 시점(a만 존재)이 병합 기준이어야 한다
      // 다른 프로세스가 b를 추가 저장
      fs.writeFileSync(idxPath, JSON.stringify({ version: V, files: { "notes/a.md": fe("notes"), "notes/b.md": fe("notes") } }));
      const future = Date.now() / 1000 + 10;
      fs.utimesSync(idxPath, future, future);
      m.loadIndex(); // 무관한 중간 로드(다른 도구 호출·watcher) — 공유 캐시가 전진하는 상황
      mine.files["notes/c.md"] = fe("notes"); // 내 작업본에 c 추가
      m.saveIndex(mine); // 기준이 공유 캐시라면 merge가 스킵돼 b가 유실된다
      const finalIdx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
      process.stdout.write(JSON.stringify({ keys: Object.keys(finalIdx.files).sort() }));
    `);
    assert.deepEqual(r.keys, ["notes/a.md", "notes/b.md", "notes/c.md"], "중간 로드가 있어도 b가 보존돼야 한다");
  });

  it("결함2 회귀: 스키마 버전 업그레이드 시 재색인 사유를 안내한다", () => {
    const r = runBrainProbe(`
      const errs = [];
      process.stderr.write = (s) => { errs.push(String(s)); return true; };
      fs.writeFileSync(idxPath, JSON.stringify({ version: 3, files: { "notes/x.md": { hash: "h", folder: "notes", chunks: [], linksOut: [] } } }));
      m._resetIndexCacheForTest();
      const idx = m.loadIndex();
      process.stdout.write(JSON.stringify({ fileCount: Object.keys(idx.files).length, notice: errs.join("") }));
    `);
    assert.equal(r.fileCount, 0, "구버전 인덱스는 재색인 대상으로 비워진다");
    assert.ok(r.notice.includes("다시 색인"), "재색인 사유가 안내돼야 한다");
  });

  it("결함4 회귀: dangling .md 심링크가 있어도 색인이 크래시하지 않는다", () => {
    const r = runBrainProbe(`
      fs.symlinkSync("/nonexistent-target-note.md", process.env.NOTES_DIR.split("=")[1] + "/dangling.md");
      const stats = await m.reindex(); // 읽기 실패 파일은 건너뛴다 — throw 없이 완료돼야 한다
      process.stdout.write(JSON.stringify({ files: stats.files }));
    `);
    assert.equal(r.files, 0, "dangling 심링크는 건너뛰고 색인이 완료된다");
  });

  it("AC-8(메타): 재색인 후 인덱스에 임베딩 모델명이 기록된다(빈 vault — dims는 임베딩 후에만)", () => {
    const r = runBrainProbe(`
      await m.reindex(); // 빈 vault — 임베딩 호출 없이 스캔·저장만
      const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
      process.stdout.write(JSON.stringify({ model: idx.embeddingModel }));
    `);
    assert.equal(r.model, "text-embedding-3-small", "기본 모델명이 기록돼야 한다");
  });

  it("AC-7(모델 게이트): 인덱스의 임베딩 모델이 현재 설정과 다르면 빈 인덱스로 폴백(전체 재색인 유도)", () => {
    const r = runBrainProbe(`
      const V = m.loadIndex().version;
      // 다른 모델로 만들어진 인덱스가 디스크에 있는 상황
      fs.writeFileSync(idxPath, JSON.stringify({
        version: V, embeddingModel: "other-model", dims: 768,
        files: { "notes/x.md": { hash: "h", folder: "notes", chunks: [], linksOut: [] } },
      }));
      m._resetIndexCacheForTest();
      const idx = m.loadIndex();
      process.stdout.write(JSON.stringify({ fileCount: Object.keys(idx.files).length }));
    `);
    assert.equal(r.fileCount, 0, "모델 불일치 인덱스는 재색인 대상으로 비워져야 한다");
  });
});

// ── specs/016 AC-9: 페르소나 레지스트리(agents/)는 노트 색인·목록에서 제외 ──
describe("agents/ 색인 제외 — specs/016 AC-9 (자식 프로세스 격리)", () => {
  it("노트 폴더 안의 agents/ 정의는 listNotes에 나타나지 않는다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-agents-exclude-"));
    try {
      fs.writeFileSync(path.join(dir, "note.md"), "일반 노트 본문");
      fs.mkdirSync(path.join(dir, "agents"));
      fs.writeFileSync(
        path.join(dir, "agents", "critic.md"),
        "---\nname: critic\ndescription: x\ntargets:\n  claude:\n    model: opus\n---\n페르소나-지침-고유-문구",
      );
      // agents와 무관한 하위 폴더는 여전히 색인되는지 함께 확인(과도 제외 방지)
      fs.mkdirSync(path.join(dir, "sub"));
      fs.writeFileSync(path.join(dir, "sub", "inner.md"), "하위 폴더 노트");

      const script = [
        `import(${JSON.stringify(BRAIN_JS)}).then((m) => {`,
        `  process.stdout.write(JSON.stringify(m.listNotes()));`,
        `}).catch((e) => { console.error(e); process.exit(1); });`,
      ].join("\n");
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          NOTES_DIR: `notes=${dir}`,
          BRAIN_INDEX: path.join(dir, ".brain-index.json"),
          LOCALMIND_AGENTS_DIR: path.join(dir, "agents"),
        },
      });
      const notes: { folder: string; path: string }[] = JSON.parse(out);
      const paths = notes.map((n) => n.path);
      assert.ok(paths.includes("notes/note.md"), "일반 노트가 목록에 없음");
      assert.ok(paths.includes(path.join("notes", "sub", "inner.md")), "하위 폴더 노트가 목록에 없음");
      assert.ok(!paths.some((p) => p.includes("agents")), `agents/ 파일이 목록에 노출됨: ${paths.join(", ")}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
