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

  const agentsDest = path.join(dir, "AGENTS.md");
  if (fs.existsSync(agentsDest)) {
    items.push({ path: "AGENTS.md", status: "skipped" });
  } else {
    fs.copyFileSync(path.join(TEMPLATES_DIR, "AGENTS.md"), agentsDest);
    items.push({ path: "AGENTS.md", status: "created" });
  }

  const specsDir = path.join(dir, "specs");
  if (fs.existsSync(specsDir)) {
    items.push({ path: "specs/", status: "skipped" });
  } else {
    fs.mkdirSync(specsDir, { recursive: true });
    for (const name of ["goal.template.md", "spec.template.md", "plan.template.md"]) {
      fs.copyFileSync(path.join(TEMPLATES_DIR, name), path.join(specsDir, name));
    }
    items.push({ path: "specs/", status: "created" });
  }

  return { items };
}

/** 결과를 사람이 읽기 쉬운 텍스트로 변환한다. */
export function formatScaffoldResult(result: ScaffoldResult): string {
  return result.items
    .map((it) => (it.status === "created" ? `생성됨: ${it.path}` : `건너뜀(이미 존재): ${it.path}`))
    .join("\n");
}
