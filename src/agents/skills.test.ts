/**
 * skills.ts 테스트 — 스킬 정본 시드·verbatim 복사 배포·prune·불가침 (specs/018 FR-8·9).
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { deploySkills, formatSkillsResult, listSkills, seedSkills } from "./skills.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BRAIN_JS = path.join(REPO_ROOT, "src", "brain.js");

let root: string;
let dataSkills: string;
let claudeSkills: string;

function makeSkill(rootDir: string, name: string, opts: { managed?: boolean; body?: string } = {}) {
  const dir = path.join(rootDir, name);
  fs.mkdirSync(dir, { recursive: true });
  const marker = opts.managed === false ? "" : `<!-- managed-by: localmind (skill: ${name}) -->\n`;
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\n---\n${marker}${opts.body ?? "지침"}\n`);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-skills-"));
  dataSkills = path.join(root, "data-skills");
  claudeSkills = path.join(root, "dot-claude", "skills");
  fs.mkdirSync(dataSkills, { recursive: true });
  fs.mkdirSync(path.join(root, "dot-claude"), { recursive: true }); // "설치됨" 상태
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("seedSkills (templates → 데이터 폴더)", () => {
  it("동봉 정본(sdd-self-review)을 시드하고, 재실행은 unchanged(멱등)", () => {
    const first = seedSkills({ skillsDir: dataSkills });
    assert.ok(first.items.some((i) => i.name === "sdd-self-review" && i.status === "created"));
    assert.ok(fs.existsSync(path.join(dataSkills, "sdd-self-review", "SKILL.md")));
    const second = seedSkills({ skillsDir: dataSkills });
    assert.ok(second.items.every((i) => i.status === "unchanged"));
  });

  it("managed 정본이 구버전이면 갱신하고, 사용자가 포크한(마커 제거) 스킬은 보존한다", () => {
    seedSkills({ skillsDir: dataSkills });
    const skillMd = path.join(dataSkills, "sdd-self-review", "SKILL.md");
    // 구버전 시뮬레이션: managed 마커는 유지한 채 내용 변경
    fs.writeFileSync(skillMd, fs.readFileSync(skillMd, "utf8") + "\n구버전 흔적");
    const updated = seedSkills({ skillsDir: dataSkills });
    assert.ok(updated.items.some((i) => i.name === "sdd-self-review" && i.status === "updated"));
    assert.ok(!fs.readFileSync(skillMd, "utf8").includes("구버전 흔적"), "정본 최신으로 복원");

    // 사용자 포크: 마커 제거 → 불가침
    const forked = fs.readFileSync(skillMd, "utf8").replace(/<!-- managed-by[^\n]*-->\n/, "") + "\n내 커스텀";
    fs.writeFileSync(skillMd, forked);
    const third = seedSkills({ skillsDir: dataSkills });
    assert.ok(third.items.some((i) => i.name === "sdd-self-review" && i.status === "skipped-unmanaged"));
    assert.equal(fs.readFileSync(skillMd, "utf8"), forked, "포크가 보존돼야 한다");
  });
});

describe("deploySkills (데이터 폴더 → Claude Code) — AC-9·10·11", () => {
  it("AC-9: verbatim 복사·마커 포함·멱등", () => {
    makeSkill(dataSkills, "my-skill", { body: "형제 파일 포함" });
    fs.writeFileSync(path.join(dataSkills, "my-skill", "helper.md"), "형제");
    const r = deploySkills({ skillsDir: dataSkills, claudeSkillsDir: claudeSkills });
    assert.ok(r.items.some((i) => i.name === "my-skill" && i.status === "created"));
    const deployed = fs.readFileSync(path.join(claudeSkills, "my-skill", "SKILL.md"), "utf8");
    assert.equal(deployed, fs.readFileSync(path.join(dataSkills, "my-skill", "SKILL.md"), "utf8"), "verbatim(변환 없음)");
    assert.ok(fs.existsSync(path.join(claudeSkills, "my-skill", "helper.md")), "형제 파일도 복사");
    const again = deploySkills({ skillsDir: dataSkills, claudeSkillsDir: claudeSkills });
    assert.ok(again.items.every((i) => i.status === "unchanged"));
  });

  it("AC-10: 대상에 마커 없는 동명 스킬이 있으면 건드리지 않고 건너뛴다", () => {
    makeSkill(dataSkills, "my-skill");
    fs.mkdirSync(claudeSkills, { recursive: true });
    makeSkill(claudeSkills, "my-skill", { managed: false, body: "사용자가 직접 만든 스킬" });
    const before = fs.readFileSync(path.join(claudeSkills, "my-skill", "SKILL.md"), "utf8");
    const r = deploySkills({ skillsDir: dataSkills, claudeSkillsDir: claudeSkills });
    assert.ok(r.items.some((i) => i.name === "my-skill" && i.status === "skipped-unmanaged"));
    assert.equal(fs.readFileSync(path.join(claudeSkills, "my-skill", "SKILL.md"), "utf8"), before);
  });

  it("AC-11 계열: prune은 managed 스킬만 — 사용자 스킬(speckit 등)은 불가침", () => {
    makeSkill(dataSkills, "my-skill");
    deploySkills({ skillsDir: dataSkills, claudeSkillsDir: claudeSkills });
    makeSkill(claudeSkills, "speckit-specify", { managed: false, body: "기존 speckit 스킬" });
    fs.rmSync(path.join(dataSkills, "my-skill"), { recursive: true });
    const r = deploySkills({ skillsDir: dataSkills, claudeSkillsDir: claudeSkills });
    assert.ok(r.items.some((i) => i.name === "my-skill" && i.status === "pruned"));
    assert.ok(!fs.existsSync(path.join(claudeSkills, "my-skill")));
    assert.ok(fs.existsSync(path.join(claudeSkills, "speckit-specify", "SKILL.md")), "speckit 불가침");
  });

  it("대상 도구 미설치(~/.claude 부재) → 건너뛰고 사유 반환", () => {
    fs.rmSync(path.join(root, "dot-claude"), { recursive: true, force: true });
    const r = deploySkills({ skillsDir: dataSkills, claudeSkillsDir: claudeSkills });
    assert.equal(r.items.length, 0);
    assert.match(r.skippedTarget!, /Claude Code 미설치/);
    const text = formatSkillsResult("배포", r);
    assert.match(text, /건너뜀/);
  });
});

describe("listSkills — 읽기 전용 카탈로그 (specs/048 T010)", () => {
  it("SKILL.md 열거 + frontmatter name/description 파싱", () => {
    makeSkill(dataSkills, "my-skill", { body: "본문" });
    fs.writeFileSync(
      path.join(dataSkills, "my-skill", "SKILL.md"),
      "---\nname: my-skill\ndescription: 테스트용 스킬\n---\n<!-- managed-by: localmind (skill: my-skill) -->\n본문\n",
    );
    const items = listSkills(dataSkills);
    assert.equal(items.length, 1);
    assert.equal(items[0].name, "my-skill");
    assert.equal(items[0].description, "테스트용 스킬");
    assert.equal(items[0].file, path.join("my-skill", "SKILL.md"));
  });

  it("managed 마커 없는 스킬은 managed:false", () => {
    makeSkill(dataSkills, "unmanaged-skill", { managed: false, body: "직접 만든 스킬" });
    fs.writeFileSync(
      path.join(dataSkills, "unmanaged-skill", "SKILL.md"),
      "---\nname: unmanaged-skill\ndescription: 사용자 스킬\n---\n직접 만든 스킬\n",
    );
    const items = listSkills(dataSkills);
    assert.equal(items.find((i) => i.name === "unmanaged-skill")?.managed, false);
  });

  it("managed 마커 있는 스킬은 managed:true", () => {
    makeSkill(dataSkills, "managed-skill", { body: "관리되는 스킬" });
    const items = listSkills(dataSkills);
    assert.equal(items.find((i) => i.name === "managed-skill")?.managed, true);
  });

  it("SKILL.md 없는 디렉토리는 목록에서 제외된다", () => {
    fs.mkdirSync(path.join(dataSkills, "not-a-skill"), { recursive: true });
    fs.writeFileSync(path.join(dataSkills, "not-a-skill", "README.md"), "스킬 아님");
    const items = listSkills(dataSkills);
    assert.ok(!items.some((i) => i.name === "not-a-skill"));
  });

  it("description 프론트매터가 없으면 빈 문자열", () => {
    fs.mkdirSync(path.join(dataSkills, "no-desc"), { recursive: true });
    fs.writeFileSync(path.join(dataSkills, "no-desc", "SKILL.md"), "---\nname: no-desc\n---\n본문\n");
    const items = listSkills(dataSkills);
    assert.equal(items.find((i) => i.name === "no-desc")?.description, "");
  });

  it("정본 폴더가 없으면 빈 배열(오류 아님)", () => {
    assert.deepEqual(listSkills(path.join(root, "no-such-dir")), []);
  });
});

describe("AC-13: 스킬 정본은 노트 색인에서 제외 (자식 프로세스 격리)", () => {
  it("skills/ 하위 SKILL.md가 listNotes에 나타나지 않는다", () => {
    const notesDir = path.join(root, "notes");
    const skills = path.join(notesDir, "skills");
    fs.mkdirSync(skills, { recursive: true });
    fs.writeFileSync(path.join(notesDir, "note.md"), "일반 노트");
    makeSkill(skills, "sdd-self-review", { body: "스킬-지침-고유-문구" });
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
        NOTES_DIR: `notes=${notesDir}`,
        BRAIN_INDEX: path.join(notesDir, ".brain-index.json"),
        LOCALMIND_SKILLS_DIR: skills,
      },
    });
    const paths = (JSON.parse(out) as { path: string }[]).map((n) => n.path);
    assert.ok(paths.includes("notes/note.md"));
    assert.ok(!paths.some((p) => p.includes("skills")), `skills/가 노출됨: ${paths.join(", ")}`);
  });

  it("회귀(크리틱): env 없이 기본 경로(첫 노트 폴더/skills)에서도 제외된다", () => {
    const notesDir = path.join(root, "notes-default");
    const skills = path.join(notesDir, "skills");
    fs.mkdirSync(skills, { recursive: true });
    fs.writeFileSync(path.join(notesDir, "note.md"), "일반 노트");
    makeSkill(skills, "sdd-self-review");
    const script = [
      `import(${JSON.stringify(BRAIN_JS)}).then((m) => {`,
      `  process.stdout.write(JSON.stringify(m.listNotes()));`,
      `}).catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    const env: Record<string, string | undefined> = {
      ...process.env,
      NOTES_DIR: `notes=${notesDir}`,
      BRAIN_INDEX: path.join(notesDir, ".brain-index.json"),
    };
    delete env.LOCALMIND_SKILLS_DIR; // 기본 경로 유도 — skillsDir() = firstNotesDir()/skills
    const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: env as NodeJS.ProcessEnv,
    });
    const paths = (JSON.parse(out) as { path: string }[]).map((n) => n.path);
    assert.ok(paths.includes("notes/note.md"));
    assert.ok(!paths.some((p) => p.includes("skills")), `기본 경로 skills/가 노출됨: ${paths.join(", ")}`);
  });
});
