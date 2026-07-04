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
import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import http from "node:http";
import crypto from "node:crypto";
import {
  extractSearchQuery,
  removeFromIndex,
  watchNotes,
  extractLinks,
  resolveLink,
  moveToTrash,
  chunkText,
  createNoteFile,
  listMarkdown,
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

// ── specs/019 AC-10: 미러 마커(.localmind-mirror) 폴더 색인 제외 ────────────

describe("listMarkdown 미러 제외 (019 AC-10)", () => {
  it("마커가 있는 하위 폴더는 색인 대상에서 빠진다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lm-mirror-"));
    try {
      fs.writeFileSync(path.join(tmp, "note.md"), "# 노트");
      fs.mkdirSync(path.join(tmp, "agents"));
      fs.writeFileSync(path.join(tmp, "agents", "persona.md"), "# 페르소나(미러)");
      fs.writeFileSync(path.join(tmp, "agents", ".localmind-mirror"), "specs/019 미러 마커");
      fs.mkdirSync(path.join(tmp, "sub"));
      fs.writeFileSync(path.join(tmp, "sub", "keep.md"), "# 유지");
      const files = listMarkdown(tmp);
      assert.ok(files.some((f) => f.endsWith("note.md")));
      assert.ok(files.some((f) => f.endsWith("keep.md")));
      assert.ok(!files.some((f) => f.includes("persona.md")), "미러 하위 파일이 색인에 포함되면 안 된다");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("마커가 없는 같은 이름 폴더는 정상 색인된다(오탐 금지)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lm-mirror-"));
    try {
      fs.mkdirSync(path.join(tmp, "agents"));
      fs.writeFileSync(path.join(tmp, "agents", "doc.md"), "# 일반 노트");
      const files = listMarkdown(tmp);
      assert.ok(files.some((f) => f.endsWith("doc.md")));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ── specs/020 — 색인 프루닝 가드 (FR-1~5, AC-1~9) ──────────────────────────
//
// 검증 대상은 "명시적 재색인 경로"이므로 scripts/reindex.ts 자체를 자식 프로세스로
// 실행한다(출력 문구 AC까지 커버). 임베딩은 부모 프로세스의 HTTP 스텁이 처리하고
// 호출 횟수를 계측한다(AC-2 재임베딩 0건). execFileSync는 부모 이벤트 루프를 막아
// 스텁이 응답할 수 없으므로 비동기 execFile을 쓴다. BRAIN_INDEX를 명시해 같은 색인
// 파일을 NOTES_DIR 조합만 바꾼 여러 실행이 공유한다(plan 테스트 전략).

const execFileP = promisify(execFile);

function makePruneFixture(): { root: string; idxPath: string; nd: (labels: string[]) => string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-prune-"));
  const idxPath = path.join(root, "index.json");
  for (const l of ["a", "b", "c"]) {
    fs.mkdirSync(path.join(root, l), { recursive: true });
    fs.writeFileSync(path.join(root, l, `${l}1.md`), `# ${l} 노트\n${l} 폴더의 내용입니다`);
  }
  return { root, idxPath, nd: (labels) => labels.map((l) => `${l}=${path.join(root, l)}`).join(",") };
}

async function withEmbedStub(
  fn: (base: string, calls: () => number) => Promise<void>,
  opts: { failMarker?: string } = {}, // 요청 본문에 마커가 있으면 500 — 순번 기반보다 결정적(021 AC-3)
): Promise<void> {
  let count = 0;
  const srv = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      count++;
      if (opts.failMarker && raw.includes(opts.failMarker)) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "stub failure" }));
        return;
      }
      const n = (JSON.parse(raw || "{}").input || []).length;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data: Array.from({ length: n }, (_, i) => ({ index: i, embedding: [1, 0, 0, 0] })) }));
    });
  });
  await new Promise<void>((r) => srv.listen(0, r));
  const port = (srv.address() as { port: number }).port;
  try {
    await fn(`http://127.0.0.1:${port}/v1`, () => count);
  } finally {
    srv.close();
  }
}

async function runReindexCli(
  idxPath: string,
  base: string,
  env: Record<string, string | undefined>,
): Promise<{ stdout: string; stderr: string }> {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    BRAIN_INDEX: idxPath,
    EMBEDDINGS_URL: base,
    EMBEDDINGS_KEY: "test-key",
    EMBED_RETRIES: "1",
  };
  // 상속 env의 잔여값이 판정을 오염시키지 않게 관련 키를 먼저 비운다.
  delete childEnv.NOTES_DIR;
  delete childEnv.REINDEX_FALLBACK;
  delete childEnv.REINDEX_PRUNE_LABELS;
  delete childEnv.REINDEX_ADOPT_REBIND;
  for (const [k, v] of Object.entries(env)) if (v !== undefined) childEnv[k] = v;
  const { stdout, stderr } = await execFileP("node", ["--import", "tsx/esm", "scripts/reindex.ts"], {
    cwd: REPO_ROOT,
    env: childEnv,
    encoding: "utf8",
  });
  return { stdout, stderr };
}

function indexKeys(idxPath: string): string[] {
  return Object.keys(JSON.parse(fs.readFileSync(idxPath, "utf8")).files);
}

describe("색인 프루닝 가드 (020)", () => {
  it("AC-1: 후퇴 신호(REINDEX_FALLBACK=1) 재색인은 키를 1건도 지우지 않고 보류를 안내한다", async () => {
    const f = makePruneFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        assert.equal(indexKeys(f.idxPath).length, 3, "사전 색인 3키");
        const fb = path.join(f.root, "fb");
        fs.mkdirSync(fb);
        fs.writeFileSync(path.join(fb, "f.md"), "폴백 폴더의 노트입니다");
        const { stdout } = await runReindexCli(f.idxPath, base, { NOTES_DIR: `fb=${fb}`, REINDEX_FALLBACK: "1" });
        const keys = indexKeys(f.idxPath);
        for (const k of ["a/a1.md", "b/b1.md", "c/c1.md", "fb/f.md"]) assert.ok(keys.includes(k), `${k} 보존/추가`);
        assert.match(stdout, /보류/, "삭제 반영 보류 안내");
        assert.doesNotMatch(stdout, /REINDEX_PRUNE_LABELS/, "후퇴 중 고아 정리 명령 미포함");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-1(자체 폴백): NOTES_DIR 완전 부재도 무프루닝 — HOME 격리로 검증", async () => {
    const f = makePruneFixture();
    const home = path.join(f.root, "home");
    fs.mkdirSync(path.join(home, ".localmind"), { recursive: true });
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b"]) });
        assert.equal(indexKeys(f.idxPath).length, 2);
        const { stdout } = await runReindexCli(f.idxPath, base, { HOME: home });
        const keys = indexKeys(f.idxPath);
        assert.ok(keys.includes("a/a1.md") && keys.includes("b/b1.md"), "자체 폴백에서도 보존");
        assert.match(stdout, /보류/);
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-2: 후퇴 후 정상 재색인은 재임베딩 0건 + 삭제 반영 재개", async () => {
    const f = makePruneFixture();
    try {
      await withEmbedStub(async (base, calls) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${path.join(f.root, "a")}`, REINDEX_FALLBACK: "1" });
        fs.rmSync(path.join(f.root, "c", "c1.md")); // 정상 실행에서 삭제 반영이 재개되는지
        const before = calls();
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        assert.equal(calls() - before, 0, "해시 불변 → 재임베딩 0건");
        const keys = indexKeys(f.idxPath);
        assert.ok(keys.includes("a/a1.md") && keys.includes("b/b1.md"), "보존");
        assert.ok(!keys.includes("c/c1.md"), "정상 실행에서 삭제 반영 재개");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-3: 등록됐지만 readdir 실패(부재·권한)한 폴더의 키는 보존 + 경로 경고", async () => {
    const f = makePruneFixture();
    const cDir = path.join(f.root, "c");
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        fs.renameSync(cDir, `${cDir}.away`); // 디렉토리 부재(미마운트·클론 전)
        const { stdout } = await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        let keys = indexKeys(f.idxPath);
        assert.ok(keys.includes("c/c1.md"), "부재 라벨 보존");
        assert.ok(keys.includes("a/a1.md") && keys.includes("b/b1.md"), "나머지 정상 색인");
        assert.ok(stdout.includes(cDir), "경고에 폴더 경로 표시");
        assert.doesNotMatch(stdout, /REINDEX_PRUNE_LABELS=c/, "부재 라벨에 정리 안내 금지");
        fs.renameSync(`${cDir}.away`, cDir);
        fs.chmodSync(cDir, 0o000); // 권한 거부도 같은 가드
        try {
          await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
          keys = indexKeys(f.idxPath);
          assert.ok(keys.includes("c/c1.md"), "권한 거부 라벨 보존");
        } finally {
          fs.chmodSync(cDir, 0o755);
        }
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-4: 대상 폴더 안의 파일 삭제는 그 키만 반영된다", async () => {
    const f = makePruneFixture();
    try {
      await withEmbedStub(async (base) => {
        fs.writeFileSync(path.join(f.root, "a", "a2.md"), "곧 삭제될 노트입니다");
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        assert.equal(indexKeys(f.idxPath).length, 4);
        fs.rmSync(path.join(f.root, "a", "a2.md"));
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        const keys = indexKeys(f.idxPath);
        assert.ok(!keys.includes("a/a2.md"), "삭제 키만 제거");
        for (const k of ["a/a1.md", "b/b1.md", "c/c1.md"]) assert.ok(keys.includes(k), `${k} 보존`);
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-5: readdir 가능한 빈 폴더는 기존대로 전량 삭제 반영된다(회귀 고정)", async () => {
    const f = makePruneFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        fs.rmSync(path.join(f.root, "a", "a1.md")); // a는 존재하는 빈 폴더가 됨
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        const keys = indexKeys(f.idxPath);
        assert.ok(!keys.includes("a/a1.md"), "빈 폴더 라벨은 삭제 반영");
        assert.ok(keys.includes("b/b1.md") && keys.includes("c/c1.md"), "다른 라벨 보존");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-6: 고아 라벨은 요약에 라벨·건수·보존·정리 명령으로 안내된다", async () => {
    const f = makePruneFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        const { stdout } = await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a"]) });
        const keys = indexKeys(f.idxPath);
        assert.ok(keys.includes("b/b1.md") && keys.includes("c/c1.md"), "고아 라벨 키 보존");
        assert.match(stdout, /b.*1건.*보존/, "라벨·건수·보존 문구");
        assert.match(stdout, /REINDEX_PRUNE_LABELS=b/, "정리 명령 안내");
        assert.match(stdout, /REINDEX_PRUNE_LABELS=c/);
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-7: REINDEX_PRUNE_LABELS는 고아 라벨만 제거하며 공백 표기도 트림된다", async () => {
    const f = makePruneFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        const { stdout } = await runReindexCli(f.idxPath, base, {
          NOTES_DIR: f.nd(["a"]),
          REINDEX_PRUNE_LABELS: " b , ", // 트림 + 빈 항목 무시
        });
        const keys = indexKeys(f.idxPath);
        assert.ok(!keys.some((k) => k.startsWith("b/")), "지정한 고아 라벨 b 제거");
        assert.ok(keys.includes("c/c1.md"), "지정 안 한 고아 라벨 c 보존");
        assert.ok(keys.includes("a/a1.md"), "대상 라벨 불변");
        assert.match(stdout, /b.*정리/, "정리 결과 안내");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-8: 대상·부재 라벨은 탈출구로 지울 수 없고 사유가 안내된다", async () => {
    const f = makePruneFixture();
    const cDir = path.join(f.root, "c");
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        fs.renameSync(cDir, `${cDir}.away`); // c = 부재 라벨
        const { stdout } = await runReindexCli(f.idxPath, base, {
          NOTES_DIR: f.nd(["a", "b", "c"]),
          REINDEX_PRUNE_LABELS: "a,c",
        });
        const keys = indexKeys(f.idxPath);
        assert.ok(keys.includes("a/a1.md"), "대상 라벨 a 보존");
        assert.ok(keys.includes("c/c1.md"), "부재 라벨 c 보존");
        assert.match(stdout, /a.*정리하지 않았/, "대상 라벨 무시 사유");
        assert.match(stdout, /c.*정리하지 않았/, "부재 라벨 무시 사유");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("손상 색인 방어: folder 필드 없는 엔트리는 undefined 노출 없이 자가 치유된다", async () => {
    // 정상 업그레이드 경로로는 생기지 않는 손상·수기 편집 엣지(구현 리뷰 D-1) — 기존
    // 프루닝의 자가 치유(스캔 미매칭 키 삭제)를 회귀 없이 유지하는지 고정한다.
    const f = makePruneFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        const idx = JSON.parse(fs.readFileSync(f.idxPath, "utf8"));
        idx.files["ghost/old.md"] = { hash: "deadbeef", chunks: [], linksOut: [] }; // folder 없음 + 대응 파일 없음
        fs.writeFileSync(f.idxPath, JSON.stringify(idx));
        const { stdout } = await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        assert.ok(!indexKeys(f.idxPath).includes("ghost/old.md"), "미매칭 folderless 엔트리 자가 치유(삭제)");
        assert.doesNotMatch(stdout, /undefined/, "사용자 안내에 undefined 노출 금지");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-9: 색인에 없는 라벨은 안내, 빈 값은 조용한 no-op이다", async () => {
    const f = makePruneFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        const r1 = await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]), REINDEX_PRUNE_LABELS: "x" });
        assert.match(r1.stdout, /x.*색인에 없어요/, "미지 라벨 안내");
        assert.equal(indexKeys(f.idxPath).length, 3, "아무것도 제거되지 않음");
        const r2 = await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]), REINDEX_PRUNE_LABELS: "" });
        assert.doesNotMatch(r2.stdout, /색인에 없어요|정리/, "빈 값은 조용한 no-op");
        assert.equal(indexKeys(f.idxPath).length, 3);
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });
});

// ── specs/021 — 색인 저장 성능 (FR-1~3, AC-1~5) ─────────────────────────────
//
// AC-1·2는 저장 횟수 계측이 필요해 reindex CLI 대신 카운터(_saveRunCountForTest)를
// 출력하는 node -e 프로브를 쓴다(같은 reindex() 경로). AC-3은 CLI 그대로 —
// 마커 실패 스텁 + BRAIN_CONCURRENCY=1 + EMBED_RETRIES=1로 결정화(스펙 AC-3).

async function runSaveProbe(
  base: string,
  env: Record<string, string | undefined>,
): Promise<{ files: number; saves: number }> {
  const script = [
    `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
    `  const r = await m.reindex();`,
    `  process.stdout.write(JSON.stringify({ files: r.files, saves: m._saveRunCountForTest() }));`,
    `}).catch((e) => { console.error(e); process.exit(1); });`,
  ].join("\n");
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    EMBEDDINGS_URL: base,
    EMBEDDINGS_KEY: "test-key",
    EMBED_RETRIES: "1",
    BRAIN_BATCH: "1", // 파일 1개 = 배치 1개 — 배치 수를 결정적으로
  };
  delete childEnv.NOTES_DIR;
  delete childEnv.BRAIN_SAVE_INTERVAL;
  for (const [k, v] of Object.entries(env)) if (v !== undefined) childEnv[k] = v;
  const { stdout } = await execFileP("node", ["--import", "tsx/esm", "-e", script], {
    cwd: REPO_ROOT,
    env: childEnv,
    encoding: "utf8",
  });
  return JSON.parse(stdout);
}

function makeBatchFixture(n: number): { root: string; idxPath: string; nd: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-save-"));
  const idxPath = path.join(root, "index.json");
  fs.mkdirSync(path.join(root, "n"));
  for (let i = 0; i < n; i++) fs.writeFileSync(path.join(root, "n", `f${i}.md`), `노트 ${i}의 짧은 내용입니다`);
  return { root, idxPath, nd: `n=${path.join(root, "n")}` };
}

describe("색인 저장 성능 (021)", () => {
  it("AC-1: 기본 간격에서 저장 횟수가 배치 수(≥8)에 비례하지 않는다(≤2회)", async () => {
    const f = makeBatchFixture(9); // BRAIN_BATCH=1 → 9배치
    try {
      await withEmbedStub(async (base) => {
        const r = await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        assert.equal(r.files, 9, "9파일 = 9배치 색인");
        assert.ok(r.saves <= 2, `저장 ≤2회여야 함(진행 0~1 + 최종 1) — 실제 ${r.saves}회`);
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-2: BRAIN_SAVE_INTERVAL=0이면 배치마다 저장된다(기존 동작 복귀)", async () => {
    const f = makeBatchFixture(9);
    try {
      await withEmbedStub(async (base) => {
        const r = await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath, BRAIN_SAVE_INTERVAL: "0" });
        assert.ok(r.saves >= 9, `배치(9)마다 저장돼야 함 — 실제 ${r.saves}회`);
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-3: 임베딩 실패 중단 시 커밋분이 저장되고, 재실행은 저장된 파일을 재임베딩하지 않는다", async () => {
    const f = makePruneFixture(); // a,b,c 순서로 스캔·배치
    const MARKER = "FAIL-MARKER-021";
    fs.writeFileSync(path.join(f.root, "c", "c1.md"), `# c 노트\n${MARKER} 이 청크에서 실패한다`);
    const stubOpts: { failMarker?: string } = { failMarker: MARKER };
    try {
      await withEmbedStub(async (base, calls) => {
        const env = {
          NOTES_DIR: f.nd(["a", "b", "c"]),
          BRAIN_BATCH: "1",
          BRAIN_CONCURRENCY: "1", // 워커 인터리빙 비결정 제거(스펙 AC-3)
          EMBED_RETRIES: "1",
        };
        let failed = false;
        try {
          await runReindexCli(f.idxPath, base, env);
        } catch {
          failed = true; // CLI 비0 종료
        }
        assert.ok(failed, "마커 배치에서 비0으로 실패해야 함");
        const keys = indexKeys(f.idxPath);
        assert.ok(keys.includes("a/a1.md") && keys.includes("b/b1.md"), "커밋분(a·b)이 저장돼 있어야 함");
        assert.ok(!keys.includes("c/c1.md"), "실패 파일은 미커밋");
        stubOpts.failMarker = undefined; // 스텁 정상화
        const before = calls();
        await runReindexCli(f.idxPath, base, env);
        assert.equal(calls() - before, 1, "재실행은 남은 파일(c, 1배치)만 임베딩");
        assert.ok(indexKeys(f.idxPath).includes("c/c1.md"), "재실행으로 완결");
      }, stubOpts);
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-4: 최종 색인 내용은 스로틀과 무관하게 동일하다", async () => {
    const f0 = makeBatchFixture(5);
    const f1 = makeBatchFixture(5);
    try {
      await withEmbedStub(async (base) => {
        await runSaveProbe(base, { NOTES_DIR: f0.nd, BRAIN_INDEX: f0.idxPath, BRAIN_SAVE_INTERVAL: "0" });
        await runSaveProbe(base, { NOTES_DIR: f1.nd, BRAIN_INDEX: f1.idxPath });
        const shape = (p: string) => {
          const idx = JSON.parse(fs.readFileSync(p, "utf8"));
          return Object.entries(idx.files)
            .map(([k, v]: [string, any]) => `${k}:${v.chunks.length}`)
            .sort();
        };
        assert.deepEqual(shape(f0.idxPath), shape(f1.idxPath), "파일·청크 집합 동일");
      });
    } finally {
      fs.rmSync(f0.root, { recursive: true, force: true });
      fs.rmSync(f1.root, { recursive: true, force: true });
    }
  });
});

// ── specs/022 — 색인 쓰기 위생: 무변경 말미 저장 생략 (FR-1·2, AC-1~4) ──────
//
// 저장 카운터는 021 하니스(runSaveProbe — 자식 프로세스 + _saveRunCountForTest)를
// 재사용한다. AC-1은 두 자식 프로세스: 첫 프로세스가 색인을 만들고, 두 번째(카운터
// 0에서 시작)가 무변경 재색인 → saves===0. 벽시계 의존 없음(결정적 상태·카운터).

describe("색인 쓰기 위생 (022)", () => {
  it("AC-1: 무변경 재색인은 저장 0회 — 색인 파일 불변", async () => {
    const f = makeBatchFixture(3);
    try {
      await withEmbedStub(async (base) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const before = fs.statSync(f.idxPath);
        const contentBefore = fs.readFileSync(f.idxPath, "utf8");
        const r = await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        assert.equal(r.saves, 0, "무변경 → 말미 저장 생략");
        const after = fs.statSync(f.idxPath);
        assert.equal(before.mtimeMs, after.mtimeMs, "색인 파일 mtime 불변");
        assert.equal(contentBefore, fs.readFileSync(f.idxPath, "utf8"), "색인 파일 내용 바이트 불변");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-1b: 스탬프 없는 구형 색인의 무변경 재색인도 저장 0회(스탬프-only는 dirty 아님)", async () => {
    const f = makeBatchFixture(2);
    try {
      await withEmbedStub(async (base) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const idx = JSON.parse(fs.readFileSync(f.idxPath, "utf8"));
        delete idx.embeddingModel; // pre-스탬프 v4 재현(loadIndex는 스탬프 없으면 그대로 로드)
        fs.writeFileSync(f.idxPath, JSON.stringify(idx));
        const r = await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        assert.equal(r.saves, 0, "스탬프-only 전이는 저장을 만들지 않음(현 기본 정책 고정)");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-2: 파일 내용 변경은 dirty — 저장 발생 + 반영", async () => {
    const f = makeBatchFixture(2);
    try {
      await withEmbedStub(async (base) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const hashBefore = JSON.parse(fs.readFileSync(f.idxPath, "utf8")).files["n/f0.md"].hash;
        fs.writeFileSync(path.join(f.root, "n", "f0.md"), "바뀐 내용입니다 — dirty 판정 대상");
        const r = await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        assert.ok(r.saves >= 1, `변경 → 저장 발생(실제 ${r.saves}회)`);
        const entry = JSON.parse(fs.readFileSync(f.idxPath, "utf8")).files["n/f0.md"];
        assert.notEqual(entry.hash, hashBefore, "변경 파일의 해시가 갱신됨");
        assert.match(entry.chunks[0].text, /바뀐 내용/, "변경 내용이 색인에 반영됨");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-3: 파일 삭제(프루닝)도 dirty — 키 제거 + 저장 발생", async () => {
    const f = makeBatchFixture(2);
    try {
      await withEmbedStub(async (base) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        fs.rmSync(path.join(f.root, "n", "f1.md"));
        const r = await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        assert.ok(r.saves >= 1, "삭제 → 저장 발생");
        assert.ok(!indexKeys(f.idxPath).includes("n/f1.md"), "삭제 키 반영");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-4: 후퇴 재색인 — 신규 있으면 저장, 무변경 재실행은 저장 0회", async () => {
    const f = makeBatchFixture(2);
    try {
      await withEmbedStub(async (base) => {
        const env = { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath, REINDEX_FALLBACK: "1" };
        const r1 = await runSaveProbe(base, env);
        assert.ok(r1.saves >= 1, "첫 후퇴 재색인(신규 커밋) → 저장");
        const r2 = await runSaveProbe(base, env);
        assert.equal(r2.saves, 0, "후퇴 + 무변경 → 삭제 보류 + 커밋 없음 → clean");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });
});

// ── specs/023 — 색인 포맷 v5: 벡터 바이너리 사이드카 (FR-1~5, AC-1~9) ───────

function readSidecarHeaderT(p: string): { magic: string; dims: number; count: number; size: number } {
  const buf = fs.readFileSync(p);
  return { magic: buf.toString("ascii", 0, 4), dims: buf.readUInt32LE(4), count: buf.readUInt32LE(8), size: buf.length };
}
function vecFiles(idxPath: string): string[] {
  const dir = path.dirname(idxPath);
  const prefix = `${path.basename(idxPath)}.vec-`;
  return fs.readdirSync(dir).filter((n) => n.startsWith(prefix) && !n.includes(".tmp-"));
}
function diskJson(idxPath: string): any {
  return JSON.parse(fs.readFileSync(idxPath, "utf8"));
}

async function runBrainScript(
  base: string,
  env: Record<string, string>,
  body: string,
): Promise<{ stdout: string; stderr: string }> {
  const script = [
    `import * as fsx from "node:fs";`,
    `import * as pathx from "node:path";`,
    `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
    body,
    `}).catch((e) => { console.error(e); process.exit(1); });`,
  ].join("\n");
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    EMBEDDINGS_URL: base,
    EMBEDDINGS_KEY: "test-key",
    EMBED_RETRIES: "1",
    QUERY_LOG: "/dev/null", // 테스트 검색이 실사용 쿼리 로그(~/.localmind)를 오염시키지 않게(004 분석 신뢰성)
    ...env,
  };
  delete childEnv.REINDEX_FALLBACK;
  const { stdout, stderr } = await execFileP("node", ["--import", "tsx/esm", "-e", script], {
    cwd: REPO_ROOT,
    env: childEnv,
    encoding: "utf8",
  });
  return { stdout, stderr };
}

describe("색인 포맷 v5 — 벡터 사이드카 (023)", () => {
  it("AC-1: v5 디스크 JSON엔 벡터가 없고 slot·사이드카(16B 헤더)가 정확하다", async () => {
    const f = makeBatchFixture(2);
    try {
      await withEmbedStub(async (base) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const idx = diskJson(f.idxPath);
        assert.equal(idx.version, 5);
        let chunkCount = 0;
        for (const fe of Object.values(idx.files) as any[])
          for (const c of fe.chunks) {
            assert.equal(c.vector, undefined, "디스크 청크에 인라인 벡터 없음");
            assert.equal(typeof c.slot, "number", "slot 참조 존재");
            chunkCount++;
          }
        assert.ok(idx.vectorFile, "vectorFile 기록");
        const h = readSidecarHeaderT(path.join(path.dirname(f.idxPath), idx.vectorFile));
        assert.equal(h.magic, "LMV1");
        assert.equal(h.dims, 4);
        assert.equal(h.count, chunkCount);
        assert.equal(h.size, 16 + chunkCount * 4 * 4, "크기 = 16 + count×dims×4");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-2·4: 별도 프로세스가 디스크(JSON+사이드카)만으로 벡터 복원 + 검색 정상", async () => {
    const f = makeBatchFixture(2);
    try {
      await withEmbedStub(async (base) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const { stdout } = await runBrainScript(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath }, `
          const idx = m.loadIndex();
          const allVec = Object.values(idx.files).every((fe) => fe.chunks.every((c) => Array.isArray(c.vector) && c.vector.length === 4));
          const hits = await m.searchNotes("노트 내용");
          process.stdout.write(JSON.stringify({ n: Object.keys(idx.files).length, allVec, hitPaths: hits.map((h) => h.path).sort() }));
        `);
        const r = JSON.parse(stdout);
        assert.equal(r.n, 2, "전 항목 로드");
        assert.equal(r.allVec, true, "전 청크 벡터 복원(cosine 가능)");
        assert.deepEqual(r.hitPaths, ["n/f0.md", "n/f1.md"], "저장 전과 동일한 히트 집합(스텁 벡터 동일 → 전 노트 히트)");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-3: 3회 저장 후 사이드카는 2개 이하(keep=2 유예 GC)", async () => {
    const f = makeBatchFixture(2);
    try {
      await withEmbedStub(async (base) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        fs.writeFileSync(path.join(f.root, "n", "f0.md"), "두 번째 저장 유발 내용");
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        fs.writeFileSync(path.join(f.root, "n", "f0.md"), "세 번째 저장 유발 내용");
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const files = vecFiles(f.idxPath);
        assert.ok(files.length <= 2, `사이드카 ${files.length}개 — keep=2 초과 GC`);
        assert.ok(files.includes(diskJson(f.idxPath).vectorFile), "참조 중인 사이드카는 항상 존재");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-3b: reader 경합(파싱 후 GC·신규 커밋) — 재시도로 복원, 자가 치유 미발생", async () => {
    const f = makeBatchFixture(2);
    try {
      await withEmbedStub(async (base) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const { stdout, stderr } = await runBrainScript(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath }, `
          const idxPath = process.env.BRAIN_INDEX;
          m._setAfterJsonParseHookForTest(() => {
            // 동시 writer 재현: 새 gen 커밋 + 옛 gen GC — reader는 옛 gen 참조를 쥔 상태
            const raw = JSON.parse(fsx.readFileSync(idxPath, "utf8"));
            const dir = pathx.dirname(idxPath);
            const oldVec = pathx.join(dir, raw.vectorFile);
            const newName = raw.vectorFile + "x"; // 새 generation basename(접두 유지)
            fsx.copyFileSync(oldVec, pathx.join(dir, newName));
            raw.vectorFile = newName;
            fsx.writeFileSync(idxPath, JSON.stringify(raw));
            fsx.rmSync(oldVec);
            m._setAfterJsonParseHookForTest(null); // 재파싱에는 미적용
          });
          m._resetIndexCacheForTest();
          const idx = m.loadIndex();
          const allVec = Object.values(idx.files).every((fe) => fe.chunks.every((c) => Array.isArray(c.vector)));
          process.stdout.write(JSON.stringify({ n: Object.keys(idx.files).length, allVec }));
        `);
        const r = JSON.parse(stdout);
        assert.equal(r.n, 2, "항목 보존(자가 치유로 제거되지 않음)");
        assert.equal(r.allVec, true, "새 generation에서 벡터 복원");
        assert.doesNotMatch(stderr, /자가 치유/, "양성 경합을 자가 치유로 오판하지 않음");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-5: 사이드카 유실·손상 → 영향 파일 재임베딩(자가 치유) + 안내 1회", async () => {
    const f = makeBatchFixture(2);
    try {
      await withEmbedStub(async (base, calls) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const vec = path.join(path.dirname(f.idxPath), diskJson(f.idxPath).vectorFile);
        fs.rmSync(vec); // 유실(재파싱해도 같은 gen → 재시도 실패 → 자가 치유)
        const before = calls();
        const { stderr } = await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd });
        assert.ok(calls() - before > 0, "영향 파일 재임베딩");
        assert.equal((stderr.match(/자가 치유/g) ?? []).length, 1, "사유 안내는 1회만(notify-once)");
        const { stdout } = await runBrainScript(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath }, `
          const hits = await m.searchNotes("노트 내용");
          process.stdout.write(JSON.stringify({ hits: hits.length }));
        `);
        assert.ok(JSON.parse(stdout).hits > 0, "치유 후 검색 정상");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-6: 디스크 v4 · 인메모리 v5 — reload-merge가 병합하지 않는다(교차버전 가드)", async () => {
    const f = makeBatchFixture(1);
    try {
      await withEmbedStub(async (base) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const { stdout } = await runBrainScript(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath }, `
          const idx = m.loadIndex(); // v5 인메모리(n/f0.md)
          // 구버전 프로세스의 v4 저장 재현 — 다른 항목(ghost) 포함
          fsx.writeFileSync(process.env.BRAIN_INDEX, JSON.stringify({
            version: 4, embeddingModel: idx.embeddingModel, dims: 4,
            files: { "ghost/g.md": { hash: "h", folder: "ghost", chunks: [{ path: "ghost/g.md", text: "고스트", vector: [1,0,0,0] }], linksOut: [] } },
          }));
          m.saveIndex(idx); // stat 변화 → 병합 시도 → 버전 가드로 스킵돼야 함
          const disk = JSON.parse(fsx.readFileSync(process.env.BRAIN_INDEX, "utf8"));
          process.stdout.write(JSON.stringify({ keys: Object.keys(disk.files), version: disk.version }));
        `);
        const r = JSON.parse(stdout);
        assert.ok(!r.keys.includes("ghost/g.md"), "v4 항목이 병합되지 않음");
        assert.ok(r.keys.includes("n/f0.md"), "내 항목 유지");
        assert.equal(r.version, 5);
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-7: 두 로드가 각자 다른 파일을 저장해도 양쪽 벡터가 모두 복원 가능(reload-merge)", async () => {
    const f = makeBatchFixture(1);
    try {
      await withEmbedStub(async (base) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const { stdout } = await runBrainScript(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath }, `
          const a = m.loadIndex();       // 스냅샷 A
          m._resetIndexCacheForTest();
          const b = m.loadIndex();       // 스냅샷 B(별도 객체 — 다중 프로세스 재현, 013 관례)
          b.files["y/b.md"] = { hash: "hb", folder: "y", chunks: [{ path: "y/b.md", text: "비", vector: [0,1,0,0] }], linksOut: [] };
          m.saveIndex(b);                // 디스크: {n/f0, y/b}
          a.files["z/a.md"] = { hash: "ha", folder: "z", chunks: [{ path: "z/a.md", text: "에이", vector: [0,0,1,0] }], linksOut: [] };
          m.saveIndex(a);                // reload-merge가 y/b를 보존해야 함
          m._resetIndexCacheForTest();
          const fin = m.loadIndex();
          const allVec = Object.values(fin.files).every((fe) => fe.chunks.every((c) => Array.isArray(c.vector)));
          process.stdout.write(JSON.stringify({ keys: Object.keys(fin.files).sort(), allVec }));
        `);
        const r = JSON.parse(stdout);
        assert.deepEqual(r.keys, ["n/f0.md", "y/b.md", "z/a.md"], "양쪽 저장분 모두 보존");
        assert.equal(r.allVec, true, "전 벡터 디스크에서 복원 가능");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-8: v4 색인 무재임베딩 마이그레이션 — 임베딩 0건 + v5 영속", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-migrate-"));
    const idxPath = path.join(root, "index.json");
    try {
      fs.mkdirSync(path.join(root, "n"));
      const text = "마이그레이션 노트 본문입니다";
      fs.writeFileSync(path.join(root, "n", "m.md"), text);
      const hash = crypto.createHash("sha256").update(text).digest("hex");
      fs.writeFileSync(
        idxPath,
        JSON.stringify({
          version: 4,
          dims: 4,
          files: { "n/m.md": { hash, folder: "n", chunks: [{ path: "n/m.md", text, vector: [1, 0, 0, 0] }], linksOut: [] } },
        }),
      );
      await withEmbedStub(async (base, calls) => {
        const before = calls();
        const { stderr } = await runReindexCli(idxPath, base, { NOTES_DIR: `n=${path.join(root, "n")}` });
        assert.equal(calls() - before, 0, "무재임베딩(인라인 벡터 재사용)");
        assert.match(stderr, /새 형식/, "마이그레이션 안내");
        const idx = diskJson(idxPath);
        assert.equal(idx.version, 5, "v5로 영속");
        assert.equal(idx.files["n/m.md"].chunks[0].slot, 0, "slot 참조");
        assert.ok(idx.vectorFile && fs.existsSync(path.join(root, idx.vectorFile)), "사이드카 생성");
        const h = readSidecarHeaderT(path.join(root, idx.vectorFile));
        assert.equal(h.count, 1);
        // 마이그레이션된 v5로 검색 정상(쿼리 임베딩 1건은 재색인 카운트와 분리 계측)
        const { stdout } = await runBrainScript(base, { NOTES_DIR: `n=${path.join(root, "n")}`, BRAIN_INDEX: idxPath }, `
          const hits = await m.searchNotes("마이그레이션 노트");
          process.stdout.write(JSON.stringify({ hitPaths: hits.map((h) => h.path) }));
        `);
        assert.deepEqual(JSON.parse(stdout).hitPaths, ["n/m.md"], "마이그레이션 후 검색 정상");
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("사이드카 유실 수복: 캐시 보유 프로세스의 재색인이 재임베딩 0건으로 디스크를 수복한다", async () => {
    // codex 교차 리뷰 차단 결함 재현 — 장수 MCP 프로세스: loadIndex 캐시가 살아 있는 채
    // 사이드카가 지워지면, 같은 프로세스 재색인은 캐시(벡터 보유)를 보므로 자가 치유
    // 경로를 타지 않는다. dirty의 sidecarMissing 수복이 없으면 디스크가 깨진 채 남아
    // 다음 프로세스가 전량 재임베딩을 문다.
    const f = makeBatchFixture(2);
    try {
      await withEmbedStub(async (base, calls) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const before = calls();
        const { stdout } = await runBrainScript(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath }, `
          m.loadIndex(); // 캐시 하이드레이션(벡터 보유)
          const vec = pathx.join(pathx.dirname(process.env.BRAIN_INDEX), JSON.parse(fsx.readFileSync(process.env.BRAIN_INDEX, "utf8")).vectorFile);
          fsx.rmSync(vec); // 사이드카 유실 — 캐시는 그대로
          const r = await m.reindex();
          const disk = JSON.parse(fsx.readFileSync(process.env.BRAIN_INDEX, "utf8"));
          const restored = disk.vectorFile && fsx.existsSync(pathx.join(pathx.dirname(process.env.BRAIN_INDEX), disk.vectorFile));
          process.stdout.write(JSON.stringify({ files: r.files, restored }));
        `);
        const r = JSON.parse(stdout);
        assert.equal(calls() - before, 0, "재임베딩 0건(메모리 벡터로 수복)");
        assert.equal(r.files, 2, "항목 무손실");
        assert.equal(r.restored, true, "사이드카 디스크 수복");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("사이드카 값 왕복: distinct 벡터가 slot 순서대로 정확히 복원된다", async () => {
    // 균일 스텁([1,0,0,0])만으로는 slot 오프셋·aliasing·엔디안 회귀를 못 잡는다(리뷰
    // 경미-4). float32로 정확히 표현되는 값(2^-k 배수)이라 무허용오차 비교가 결정적.
    const f = makeBatchFixture(1);
    try {
      await withEmbedStub(async (base) => {
        const { stdout } = await runBrainScript(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath }, `
          const idx = m.loadIndex();
          idx.dims = 4;
          idx.files["a/x.md"] = { hash: "h1", folder: "a", chunks: [
            { path: "a/x.md", text: "하나", vector: [0.125, -1.5, 3.25, 42] },
            { path: "a/x.md", text: "둘", vector: [9.75, 0.0625, -2.25, 7] },
          ], linksOut: [] };
          idx.files["b/y.md"] = { hash: "h2", folder: "b", chunks: [
            { path: "b/y.md", text: "셋", vector: [5.5, 6.5, -7.5, 8.5] },
          ], linksOut: [] };
          m.saveIndex(idx);
          m._resetIndexCacheForTest();
          const fin = m.loadIndex();
          process.stdout.write(JSON.stringify({
            a: fin.files["a/x.md"].chunks.map((c) => c.vector),
            b: fin.files["b/y.md"].chunks.map((c) => c.vector),
          }));
        `);
        const r = JSON.parse(stdout);
        assert.deepEqual(r.a, [[0.125, -1.5, 3.25, 42], [9.75, 0.0625, -2.25, 7]], "청크별 distinct 벡터 정확 복원");
        assert.deepEqual(r.b, [[5.5, 6.5, -7.5, 8.5]], "파일 간 slot 매핑 정확");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("사이드카 truncate 수복: 캐시 보유 프로세스의 재색인이 크기 불일치를 감지해 수복한다", async () => {
    const f = makeBatchFixture(2);
    try {
      await withEmbedStub(async (base, calls) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const before = calls();
        const { stdout } = await runBrainScript(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath }, `
          m.loadIndex(); // 캐시 하이드레이션
          const vec = pathx.join(pathx.dirname(process.env.BRAIN_INDEX), JSON.parse(fsx.readFileSync(process.env.BRAIN_INDEX, "utf8")).vectorFile);
          fsx.truncateSync(vec, 8); // 부분 손상 — 파일은 존재
          await m.reindex();
          const disk = JSON.parse(fsx.readFileSync(process.env.BRAIN_INDEX, "utf8"));
          const p2 = pathx.join(pathx.dirname(process.env.BRAIN_INDEX), disk.vectorFile);
          process.stdout.write(JSON.stringify({ size: fsx.statSync(p2).size }));
        `);
        assert.equal(calls() - before, 0, "재임베딩 0건(메모리 벡터로 수복)");
        assert.equal(JSON.parse(stdout).size, 16 + 2 * 4 * 4, "수복된 사이드카 크기 정상(2파일×1청크)");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-9: 손상 v4 색인은 기존 관례대로 전량 재빌드(재임베딩) 후 v5", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-migrate-bad-"));
    const idxPath = path.join(root, "index.json");
    try {
      fs.mkdirSync(path.join(root, "n"));
      fs.writeFileSync(path.join(root, "n", "m.md"), "재빌드 대상 노트입니다");
      fs.writeFileSync(idxPath, "not json {{{");
      await withEmbedStub(async (base, calls) => {
        const before = calls();
        await runReindexCli(idxPath, base, { NOTES_DIR: `n=${path.join(root, "n")}` });
        assert.ok(calls() - before > 0, "전량 재빌드(재임베딩)");
        assert.equal(diskJson(idxPath).version, 5, "최종 포맷 v5");
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ── specs/024 — 라벨↔경로 바인딩 (FR-1~4, AC-1~8) ───────────────────────────
//
// 재바인딩 재현은 기존 관례 그대로: 같은 BRAIN_INDEX에 NOTES_DIR의 경로만 바꿔
// 자식 프로세스(runReindexCli)를 다시 실행한다. 안내 문구는 reindex CLI stdout.

function makeRebindFixture(): { root: string; idxPath: string; dirA: string; dirB: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-rebind-"));
  const idxPath = path.join(root, "index.json");
  const dirA = path.join(root, "locA");
  const dirB = path.join(root, "locB");
  fs.mkdirSync(dirA);
  fs.mkdirSync(dirB);
  fs.writeFileSync(path.join(dirA, "old-only.md"), "이전 위치에만 있는 노트");
  fs.writeFileSync(path.join(dirB, "new-only.md"), "새 위치에만 있는 노트"); // relpath 비중첩(AC-1)
  return { root, idxPath, dirA, dirB };
}

function diskBindings(idxPath: string): Record<string, string> | undefined {
  return diskJson(idxPath).bindings;
}

describe("라벨↔경로 바인딩 (024)", () => {
  it("AC-1: 재바인딩은 이전 위치 항목을 보존하고 수락 명령을 안내한다", async () => {
    const f = makeRebindFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}` });
        assert.equal(diskBindings(f.idxPath)?.a, fs.realpathSync(f.dirA), "바인딩 기록(realpath)");
        const { stdout } = await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirB}` });
        const keys = indexKeys(f.idxPath);
        assert.ok(keys.includes("a/old-only.md"), "이전 위치 항목 보존(프루닝 안 됨)");
        assert.ok(keys.includes("a/new-only.md"), "새 위치 파일은 같은 라벨로 추가");
        assert.match(stdout, /a.*위치가 바뀌/, "재바인딩 안내(라벨·경로)");
        assert.ok(stdout.includes(fs.realpathSync(f.dirA)), "기록 경로 표기");
        assert.ok(stdout.includes(fs.realpathSync(f.dirB)), "현재 경로 표기");
        assert.match(stdout, /1건.*보존/, "보존 건수 안내");
        assert.match(stdout, /REINDEX_ADOPT_REBIND=a/, "수락 명령 안내");
        assert.equal(diskBindings(f.idxPath)?.a, fs.realpathSync(f.dirA), "보존 중엔 바인딩 미갱신(반복 안내 근거)");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-2: 경로 불변 라벨의 파일 삭제는 기존대로 그 키만 프루닝(오판 없음)", async () => {
    const f = makeRebindFixture();
    try {
      await withEmbedStub(async (base) => {
        fs.writeFileSync(path.join(f.dirA, "second.md"), "두 번째 노트");
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}` });
        fs.rmSync(path.join(f.dirA, "second.md"));
        const { stdout } = await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}` });
        const keys = indexKeys(f.idxPath);
        assert.ok(!keys.includes("a/second.md"), "삭제 키 프루닝");
        assert.ok(keys.includes("a/old-only.md"), "나머지 보존");
        assert.doesNotMatch(stdout, /위치가 바뀌/, "재바인딩 오판 없음");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-3: 바인딩 없는 기존 색인(구버전)은 오판 없이 현재 경로를 기록한다", async () => {
    const f = makeRebindFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}` });
        const idx = diskJson(f.idxPath);
        delete idx.bindings; // 구버전 색인 재현
        fs.writeFileSync(f.idxPath, JSON.stringify(idx));
        const before = indexKeys(f.idxPath).sort();
        const { stdout } = await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}` });
        assert.deepEqual(indexKeys(f.idxPath).sort(), before, "항목 불변(보존 오판·프루닝 없음)");
        assert.doesNotMatch(stdout, /위치가 바뀌/, "재바인딩 아님");
        assert.equal(diskBindings(f.idxPath)?.a, fs.realpathSync(f.dirA), "현재 경로 기록");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-4: REINDEX_ADOPT_REBIND 수락 — 옛 항목 제거 + 바인딩 갱신 + 안내 종료", async () => {
    const f = makeRebindFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}` });
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirB}` }); // 재바인딩(보존)
        const { stdout } = await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirB}`, REINDEX_ADOPT_REBIND: "a" });
        const keys = indexKeys(f.idxPath);
        assert.ok(!keys.includes("a/old-only.md"), "옛 위치 항목(seen 아님) 제거");
        assert.ok(keys.includes("a/new-only.md"), "새 위치 항목 유지");
        assert.match(stdout, /a.*수락/, "수락 결과 안내");
        assert.equal(diskBindings(f.idxPath)?.a, fs.realpathSync(f.dirB), "바인딩 갱신");
        const again = await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirB}` });
        assert.doesNotMatch(again.stdout, /위치가 바뀌/, "수락 후 재바인딩 안내 종료");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-5: 비재바인딩·미지 라벨 수락 지정은 무시 + 사유 안내, 빈 값은 no-op", async () => {
    const f = makeRebindFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}` });
        const before = indexKeys(f.idxPath).sort();
        const r1 = await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}`, REINDEX_ADOPT_REBIND: " a , x ," });
        assert.deepEqual(indexKeys(f.idxPath).sort(), before, "아무것도 제거되지 않음");
        assert.match(r1.stdout, /a.*수락할 것이 없/, "비재바인딩 라벨 사유");
        assert.match(r1.stdout, /x.*수락할 것이 없/, "미지 라벨 사유");
        const r2 = await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}`, REINDEX_ADOPT_REBIND: "" });
        assert.doesNotMatch(r2.stdout, /수락/, "빈 값은 조용한 no-op");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-6: 새 경로 미마운트 상태의 수락은 보류 — 무삭제·바인딩 불변·사유 안내", async () => {
    const f = makeRebindFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}` });
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirB}` }); // 재바인딩 상태
        fs.rmSync(f.dirB, { recursive: true }); // 미마운트 재현
        const { stdout } = await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirB}`, REINDEX_ADOPT_REBIND: "a" });
        const keys = indexKeys(f.idxPath);
        assert.ok(keys.includes("a/old-only.md") && keys.includes("a/new-only.md"), "어떤 항목도 제거되지 않음");
        assert.equal(diskBindings(f.idxPath)?.a, fs.realpathSync(f.dirA), "바인딩 불변");
        assert.match(stdout, /a.*열 수 없어.*보류/, "보류 사유 안내");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-7: 후퇴 재색인은 바인딩을 기록·변경하지 않는다(수락도 무시)", async () => {
    const f = makeRebindFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}` });
        const bindingsBefore = JSON.stringify(diskBindings(f.idxPath));
        const keysBefore = indexKeys(f.idxPath).sort();
        const { stdout } = await runReindexCli(f.idxPath, base, {
          NOTES_DIR: `a=${f.dirB}`,
          REINDEX_FALLBACK: "1",
          REINDEX_ADOPT_REBIND: "a",
        });
        assert.deepEqual(JSON.stringify(diskBindings(f.idxPath)), bindingsBefore, "bindings 1건도 변경 없음");
        for (const k of keysBefore) assert.ok(indexKeys(f.idxPath).includes(k), `${k} 보존(후퇴 무프루닝)`);
        assert.match(stdout, /보류/, "020 보류 안내");
        assert.doesNotMatch(stdout, /수락/, "후퇴 중 수락 무시");
        // 강화(codex 조언): 바인딩이 아예 없는 색인의 후퇴 실행도 bindings를 만들지 않는다
        const bare = diskJson(f.idxPath);
        delete bare.bindings;
        fs.writeFileSync(f.idxPath, JSON.stringify(bare));
        fs.writeFileSync(path.join(f.dirA, "extra.md"), "후퇴 중 신규 노트(저장 유발)");
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}`, REINDEX_FALLBACK: "1" });
        assert.equal(diskBindings(f.idxPath), undefined, "후퇴 저장이 bindings를 생성하지 않음");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-8: reload-merge가 서로 다른 라벨의 바인딩을 모두 보존한다(??= 규칙)", async () => {
    const f = makeRebindFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}` });
        const { stdout } = await runBrainScript(base, { NOTES_DIR: `a=${f.dirA}`, BRAIN_INDEX: f.idxPath }, `
          const one = m.loadIndex();
          m._resetIndexCacheForTest();
          const two = m.loadIndex(); // 별도 스냅샷(다중 프로세스 재현)
          two.bindings = { ...(two.bindings ?? {}), y: "/notes/y" };
          m.saveIndex(two);
          one.bindings = { ...(one.bindings ?? {}), z: "/notes/z" };
          m.saveIndex(one); // reload-merge가 y를 보존해야 함
          m._resetIndexCacheForTest();
          process.stdout.write(JSON.stringify(m.loadIndex().bindings));
        `);
        const b = JSON.parse(stdout);
        assert.ok(b.a, "원 바인딩 유지");
        assert.equal(b.y, "/notes/y", "다른 스냅샷의 바인딩 보존");
        assert.equal(b.z, "/notes/z", "내 바인딩 유지");
        // 강화(codex 조언): 실제 두 자식 프로세스가 각자 다른 라벨을 색인·저장(AC-8 원문)
        const dirY = path.join(f.root, "locY");
        fs.mkdirSync(dirY);
        fs.writeFileSync(path.join(dirY, "y.md"), "와이 라벨 노트");
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `yy=${dirY}` });
        const fin = diskBindings(f.idxPath);
        assert.ok(fin?.a, "프로세스 1의 바인딩 보존(고아 항목과 함께)");
        assert.equal(fin?.yy, fs.realpathSync(dirY), "프로세스 2의 바인딩 기록");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });
});
