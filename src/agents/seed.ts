/**
 * specs/026 FR-5 — 패키지 동봉 페르소나 정본(templates/agents) → 노트 폴더 agents/ 시드.
 *
 * fill-missing-only: 정본이 없는 파일만 복사한다. 기존 정본·사용자 수정은 절대 덮지
 * 않으며 update·prune도 없다 — seedSkills의 update-managed 분기는 채택하지 않는다
 * (운영 정본은 사용자 데이터, templates 갱신은 릴리스로만 전파 — 026 goal Risks 위계).
 * 호출은 배포 스크립트(scripts/agents-deploy.ts)의 seed→deploy 순차뿐 —
 * deployAgents()·MCP deploy_agents는 시드하지 않는다(스킬의 스크립트 2단계 관례 대칭).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { agentsDir } from "./registry.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
// src/agents/ 와 dist/agents/ 모두 저장소 루트의 2단계 하위 — templates/agents로 동일 해석
const TEMPLATES_DIR = path.resolve(MODULE_DIR, "..", "..", "templates", "agents");

export interface SeedItem {
  name: string;
  status: "seeded" | "exists";
}

export function seedAgents(opts: { agentsDir?: string; templatesDir?: string } = {}): SeedItem[] {
  const src = opts.templatesDir ?? TEMPLATES_DIR;
  const dest = opts.agentsDir ?? agentsDir();
  let names: string[];
  try {
    names = fs
      .readdirSync(src)
      .filter((n) => n.toLowerCase().endsWith(".md"))
      .sort();
  } catch {
    return []; // templates 없음(비정상 설치) — 시드는 부트스트랩 편의일 뿐, 배포를 막지 않는다
  }
  fs.mkdirSync(dest, { recursive: true });
  const items: SeedItem[] = [];
  for (const name of names) {
    const target = path.join(dest, name);
    if (fs.existsSync(target)) {
      items.push({ name, status: "exists" });
      continue;
    }
    fs.copyFileSync(path.join(src, name), target);
    items.push({ name, status: "seeded" });
  }
  return items;
}
