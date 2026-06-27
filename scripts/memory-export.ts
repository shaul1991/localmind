/**
 * mem0 메모리를 git에 올리기 좋은 마크다운으로 export 한다.
 *
 *   npm run memory:export -- [출력경로]
 *   OPENMEMORY_USER=내이름 npm run memory:export -- ~/brain/memory.md
 *
 * 출력은 메모리 1개당 한 줄(- ...)이라 git diff가 깔끔하다.
 * 복원은 memory:import 로 한다(파생 DB/인덱스는 import 후 재생성).
 */
import fs from "node:fs";
import path from "node:path";

const OM = (process.env.OPENMEMORY_URL ?? "http://localhost:8767").replace(/\/$/, "");
const USER = process.env.OPENMEMORY_USER ?? "localmind";
const OUT = process.argv[2] ?? process.env.MEMORY_BACKUP_FILE ?? "memory-backup.md";

async function fetchAll(): Promise<any[]> {
  const items: any[] = [];
  let page = 1;
  const size = 100;
  for (;;) {
    const url = `${OM}/api/v1/memories/?user_id=${encodeURIComponent(USER)}&page=${page}&size=${size}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`GET memories HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j: any = await r.json();
    const got: any[] = j.items ?? [];
    items.push(...got);
    if (!got.length || items.length >= (j.total ?? items.length)) break;
    page++;
  }
  return items;
}

async function main(): Promise<void> {
  const items = await fetchAll();
  items.sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
  const date = new Date().toISOString().slice(0, 10);
  const body = [
    "# localmind memory backup",
    "",
    `> user_id: \`${USER}\` · exported: ${date} · count: ${items.length}`,
    "",
    ...items.map((m) => `- ${String(m.content ?? "").replace(/\s*\n\s*/g, " ").trim()}`),
    "",
  ].join("\n");

  const abs = path.resolve(OUT);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
  console.log(`내보냄: ${items.length}개 메모리 → ${OUT}`);
  console.log(`백업: cd <git repo> && git add ${path.basename(OUT)} && git commit -m "memory backup" && git push`);
}

main().catch((e) => {
  console.error("export 실패:", (e as Error).message);
  process.exit(1);
});
