import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { listNotesWithMeta, parseNoteMeta } from "./brain.js";
import { readNoteContent } from "./ui-status.js";

describe("parseNoteMeta — 노트 카드 메타 추출(038 AC-1·2)", () => {
  it("frontmatter 완비: title·tags·date·snippet 추출", () => {
    const text = [
      "---",
      "title: Gemini 백엔드 결정",
      "date: 2026-07-06T09:00:00",
      'tags: ["decision", "design"]',
      "---",
      "",
      "# 무시되는 헤딩",
      "본문 첫 문장이 스니펫이 된다. 이 내용이 카드에 보인다.",
    ].join("\n");
    const m = parseNoteMeta(text, "projects/note-1.md", "localmind");
    assert.strictEqual(m.title, "Gemini 백엔드 결정");
    assert.deepStrictEqual(m.tags, ["decision", "design"]);
    assert.strictEqual(m.date, "2026-07-06");
    assert.strictEqual(m.folder, "localmind");
    assert.strictEqual(m.path, "localmind/projects/note-1.md");
    assert.match(m.snippet, /본문 첫 문장/);
    assert.ok(!m.snippet.includes("무시되는 헤딩"), "헤딩은 스니펫에서 제외");
  });

  it("frontmatter 없음: title은 첫 # 헤딩, date는 파일명에서", () => {
    const text = "# Docker 도메인 맵\n\n도커 관련 지식 정리.";
    const m = parseNoteMeta(text, "domains/map-20260612-docker.md", "vault");
    assert.strictEqual(m.title, "Docker 도메인 맵");
    assert.strictEqual(m.date, "2026-06-12");
    assert.deepStrictEqual(m.tags, []);
    assert.match(m.snippet, /도커 관련 지식/);
  });

  it("헤딩·frontmatter 모두 없음: title은 파일명 basename", () => {
    const m = parseNoteMeta("그냥 본문만 있는 노트.", "raw-note.md", "notes");
    assert.strictEqual(m.title, "raw-note");
    assert.match(m.snippet, /그냥 본문만/);
  });

  it("가짜 날짜 방어: 숫자 id나 비현실 월/일은 date로 안 잡힌다", () => {
    // telegram 인제스트 노트의 숫자 id가 8715-58-77로 오인되던 도그푸드 버그
    assert.strictEqual(parseNoteMeta("안녕? id=87155877", "chat-87155877.md", "f").date, "");
    // 긴 숫자 id에 우연히 박힌 날짜 부분열도 배제(앞뒤 숫자 경계 — self-review)
    assert.strictEqual(parseNoteMeta("x", "chat-5202601159.md", "f").date, "");
    // 유효한 20xx 날짜는 여전히 추출(구분자 유무 무관)
    assert.strictEqual(parseNoteMeta("본문", "cap-20260611-0013.md", "f").date, "2026-06-11");
    assert.strictEqual(parseNoteMeta("---\ndate: 2026-07-06T09:00\n---\n본문", "n.md", "f").date, "2026-07-06");
  });

  it("블록 스타일 YAML 태그도 파싱한다(self-review 경미)", () => {
    const text = "---\ntitle: T\ntags:\n  - decision\n  - design\n---\n본문";
    assert.deepStrictEqual(parseNoteMeta(text, "n.md", "f").tags, ["decision", "design"]);
  });
});

describe("listNotesWithMeta — 심링크 리스팅 제외(038 self-review 중대-1)", () => {
  it("심링크 노트는 리스팅에서 빠지고 외부 내용이 스니펫으로 안 샌다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nbl-"));
    const dir = path.join(root, "v");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "real.md"), "# 진짜 노트\n안전한 본문");
    fs.writeFileSync(path.join(root, "secret.md"), "SECRET-API-KEY=sk-abcdef123456 비밀");
    try {
      fs.symlinkSync(path.join(root, "secret.md"), path.join(dir, "leak.md"));
    } catch {
      return; // 심링크 불가 환경 스킵
    }
    const { notes } = listNotesWithMeta([{ label: "v", dir }]);
    const paths = notes.map((n) => n.path);
    assert.ok(paths.includes("v/real.md"), "실파일은 포함");
    assert.ok(!paths.some((p) => p.includes("leak")), "심링크는 리스팅 제외");
    assert.ok(!notes.some((n) => n.snippet.includes("SECRET")), "외부 파일 내용 미노출");
  });

  it("snippet: frontmatter·헤딩·인용·리스트마커 제거", () => {
    const text = "---\ntitle: T\n---\n## 섹션\n- 항목 A\n> 인용\n실제 문장입니다.";
    const m = parseNoteMeta(text, "n.md", "f");
    assert.ok(!m.snippet.includes("섹션"), "헤딩 제외");
    assert.ok(!m.snippet.startsWith(">"), "인용 마커 제외");
    assert.match(m.snippet, /항목 A|실제 문장/);
  });
});

describe("readNoteContent — 경로 안전(038 AC-3)", () => {
  function setup() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nb-"));
    const dir = path.join(root, "vault");
    fs.mkdirSync(path.join(dir, "sub"), { recursive: true });
    fs.writeFileSync(path.join(dir, "sub", "ok.md"), "안전한 본문");
    fs.writeFileSync(path.join(root, "secret.md"), "루트 밖 비밀");
    return { root, folders: [{ label: "vault", dir }] };
  }

  it("유효 경로(하위폴더 포함)는 본문 반환", () => {
    const { folders } = setup();
    const r = readNoteContent(folders, "vault/sub/ok.md");
    assert.ok(r.ok && r.content === "안전한 본문");
  });

  it("트래버설(../)은 거부", () => {
    const { folders } = setup();
    const r = readNoteContent(folders, "vault/../secret.md");
    assert.ok(!r.ok);
  });

  it("모르는 라벨은 거부", () => {
    const { folders } = setup();
    assert.ok(!readNoteContent(folders, "nope/x.md").ok);
  });

  it("심볼릭 링크는 거부", () => {
    const { root, folders } = setup();
    const link = path.join(folders[0].dir, "sub", "link.md");
    try {
      fs.symlinkSync(path.join(root, "secret.md"), link);
    } catch {
      return; // 심링크 불가 환경은 스킵
    }
    const r = readNoteContent(folders, "vault/sub/link.md");
    assert.ok(!r.ok, "심링크는 거부돼야 함");
  });
});
