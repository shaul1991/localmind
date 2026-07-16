/**
 * SDD 작업 흐름(AGENTS.md + goal/spec/plan 템플릿)을 대상 디렉토리에 심는다.
 *
 * 정본 템플릿은 templates/sdd/에 있다. 이 함수를 MCP 도구(scaffold_sdd)와
 * `make init-sdd` 커맨드 양쪽이 그대로 재사용해 로직 중복을 없앤다.
 * 기존 파일/폴더는 절대 덮어쓰지 않는다(안전 우선).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
// src/scaffold.ts 와 dist/scaffold.js 둘 다 저장소 루트의 1단계 하위 폴더이므로
// 소스 실행(tsx)·빌드 실행(dist) 어느 쪽이든 동일하게 저장소 루트의 templates/sdd로 해석된다.
const TEMPLATES_DIR = path.resolve(MODULE_DIR, "..", "templates", "sdd");

export interface ScaffoldItem {
  path: string;
  status: "created" | "skipped";
}
export interface ScaffoldResult {
  items: ScaffoldItem[];
}

/**
 * targetDir에 AGENTS.md + specs/{goal,spec,plan}.template.md를 심는다.
 * 기존 파일/폴더는 건드리지 않는다.
 *
 * targetDir는 반드시 절대경로여야 한다. MCP 서버는 장수명 프로세스라 "현재 작업
 * 디렉토리"가 호출자가 기대하는 프로젝트 위치와 다를 수 있다 — 상대경로를 허용하면
 * cwd에 따라 조용히 엉뚱한 위치에 파일이 생성될 위험이 있어(self-review에서 발견),
 * 모호함이 없는 절대경로만 받는다.
 */
export function scaffoldSdd(targetDir: string): ScaffoldResult {
  if (!path.isAbsolute(targetDir)) {
    throw new Error(`targetDir는 절대경로여야 합니다: "${targetDir}"`);
  }
  const dir = path.resolve(targetDir);
  fs.mkdirSync(dir, { recursive: true });

  const items: ScaffoldItem[] = [];

  // 컨텍스트 브리지 파일 — 각 item 단위 create-if-absent. AGENTS.md가 정본이고 CLAUDE.md/
  // GEMINI.md는 얇은 import stub이다. 어느 하나가 이미 있어도 나머지 missing item은 만들며,
  // 기존 파일 내용은 절대 병합·수정·덮어쓰기 하지 않는다(specs/044 FR-10).
  //
  // R4-04: no-follow 존재 판정(lstat) + exclusive create("wx", O_EXCL). existsSync는 dangling
  // symlink를 따라가 false를 주고, copyFileSync는 링크를 따라가 프로젝트 밖에 referent를 만든다.
  // lstat는 어떤 형태(파일/디렉토리/dangling·live symlink)든 항목을 감지해 보존하고, O_EXCL은
  // 검사 후 생긴 항목(경쟁)까지 EEXIST로 잡아 링크/외부 대상을 따라가거나 덮어쓰지 않는다.
  for (const name of ["AGENTS.md", "CLAUDE.md", "GEMINI.md"]) {
    items.push({ path: name, status: createIfAbsent(path.join(dir, name), path.join(TEMPLATES_DIR, name)) });
  }

  const specsDir = path.join(dir, "specs");
  if (entryExists(specsDir)) {
    items.push({ path: "specs/", status: "skipped" });
  } else {
    fs.mkdirSync(specsDir, { recursive: true });
    for (const name of ["goal.template.md", "spec.template.md", "plan.template.md"]) {
      createIfAbsent(path.join(specsDir, name), path.join(TEMPLATES_DIR, name));
    }
    items.push({ path: "specs/", status: "created" });
  }

  return { items };
}

/** 경로에 어떤 형태(파일/디렉토리/live·dangling symlink)든 항목이 있는가 — symlink 미추종(lstat). */
function entryExists(p: string): boolean {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * dest가 없을 때만 template을 exclusive create로 심는다(symlink 미추종·경쟁 안전).
 * 이미 있거나(검사 시점) 검사 후 생겼으면(O_EXCL EEXIST) 보존하고 "skipped"를 반환한다.
 */
function createIfAbsent(dest: string, templatePath: string): "created" | "skipped" {
  if (entryExists(dest)) return "skipped";
  try {
    // O_WRONLY|O_CREAT|O_EXCL — 최종 경로 요소가 symlink이면 따라가지 않고 EEXIST로 실패한다.
    fs.writeFileSync(dest, fs.readFileSync(templatePath), { flag: "wx" });
    return "created";
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return "skipped"; // 검사 후 생긴 항목 보존
    throw err;
  }
}

/** 결과를 사람이 읽기 쉬운 텍스트로 변환한다. */
export function formatScaffoldResult(result: ScaffoldResult): string {
  return result.items
    .map((it) => (it.status === "created" ? `생성됨: ${it.path}` : `건너뜀(이미 존재): ${it.path}`))
    .join("\n");
}
