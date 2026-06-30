/**
 * brain.ts 단위 테스트 — node:test 기반
 *
 * 임베딩 서버 불필요 테스트: extractSearchQuery (순수 함수)
 * 임베딩 서버 필요 테스트:  capture() 검증 시나리오 (INTEGRATION_* 접두 — 기본 skip)
 *
 * 실행: npm test
 * 통합 테스트(서버 필요): LOCALMIND_INTEGRATION=1 npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { extractSearchQuery, capture, removeFromIndex, watchNotes } from "./brain.js";

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

const INTEGRATION = process.env.LOCALMIND_INTEGRATION === "1";

describe("capture() 검증 루프 (통합 — 임베딩 서버 필요)", { skip: !INTEGRATION }, () => {
  let tmpDir: string;

  it("setup", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-test-"));
    process.env.NOTES_DIR = tmpDir;
    process.env.BRAIN_INDEX = path.join(tmpDir, ".brain-index.json");
  });

  it("AC-1: 정상 캡처 시 validationStatus가 confirmed이다", async () => {
    const result = await capture(
      "오늘 미팅에서 결정한 사항: 배포 일정을 다음 주로 연기한다",
      "미팅 결정 사항",
    );
    assert.equal(result.validationStatus, "confirmed", "인덱싱이 확인돼야 한다");
    assert.equal(result.retried, false);
    assert.ok(result.path.endsWith(".md"));
  });

  it("AC-5: 10자 미만 텍스트는 validationStatus가 skipped이다", async () => {
    const result = await capture("짧음");
    assert.equal(result.validationStatus, "skipped");
  });

  it("teardown", () => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.NOTES_DIR;
    delete process.env.BRAIN_INDEX;
  });
});
