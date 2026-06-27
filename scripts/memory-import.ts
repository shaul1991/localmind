/**
 * memory:export 로 만든 마크다운에서 mem0 메모리를 복원(import)한다.
 *
 *   npm run memory:import -- [입력경로]
 *   OPENMEMORY_USER=내이름 npm run memory:import -- ~/brain/memory.md
 *
 * 추출된 사실을 그대로 저장하려고 infer:false 로 넣는다(재추출 방지).
 * 이미 있는 내용은 건너뛰어 여러 번 돌려도 안전하다(멱등).
 */
import fs from "node:fs";

const OM = (process.env.OPENMEMORY_URL ?? "http://localhost:8767").replace(/\/$/, "");
const USER = process.env.OPENMEMORY_USER ?? "localmind";
const IN = process.argv[2] ?? process.env.MEMORY_BACKUP_FILE ?? "memory-backup.md";

async function existingContents(): Promise<Set<string>> {
  const set = new Set<string>();
  let page = 1;
  const size = 100;
  for (;;) {
    const r = await fetch(
      `${OM}/api/v1/memories/?user_id=${encodeURIComponent(USER)}&page=${page}&size=${size}`,
    );
    if (!r.ok) break;
    const j: any = await r.json();
    const got: any[] = j.items ?? [];
    for (const m of got) set.add(String(m.content ?? "").trim());
    if (!got.length || set.size >= (j.total ?? set.size)) break;
    page++;
  }
  return set;
}

async function main(): Promise<void> {
  const text = fs.readFileSync(IN, "utf8");
  const memories = text
    .split("\n")
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim())
    .filter(Boolean);

  if (!memories.length) {
    console.log("복원할 메모리가 없습니다(- 로 시작하는 줄 없음).");
    return;
  }

  const existing = await existingContents(); // 멱등: 이미 있는 내용은 스킵
  let added = 0;
  let skipped = 0;
  for (const m of memories) {
    if (existing.has(m)) {
      skipped++;
      continue;
    }
    const r = await fetch(`${OM}/api/v1/memories/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: USER, text: m, infer: false }),
    });
    if (r.ok) {
      added++;
      existing.add(m);
    } else {
      console.error("skip:", m.slice(0, 40), "→", (await r.text()).slice(0, 120));
    }
  }
  console.log(`복원: 추가 ${added} · 기존 스킵 ${skipped} / 총 ${memories.length} (user_id=${USER})`);
}

main().catch((e) => {
  console.error("import 실패:", (e as Error).message);
  process.exit(1);
});
