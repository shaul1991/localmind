/**
 * second-brain 노트를 (재)인덱싱한다. 새 기기 복구나 노트 대량 추가 후 인덱스를 미리 데운다
 * (안 돌려도 첫 검색 때 자동 인덱싱되지만, 미리 해두면 첫 질의가 빠르다).
 *
 *   npm run reindex
 *   NOTES_DIR="work=/notes/work,life=/notes/personal" npm run reindex
 *
 * 전제: 임베딩 게이트웨이(:4000)가 떠 있어야 한다(make up).
 */
import { listFolders, reindex } from "../src/brain.js";

async function main(): Promise<void> {
  const folders = listFolders();
  console.log(`인덱싱 대상 폴더: ${folders.map((f) => `${f.label}:${f.dir}`).join(", ")}`);
  const { files, chunks } = await reindex();
  console.log(`인덱싱 완료: ${files}개 파일 · ${chunks}개 청크`);
}

main().catch((e) => {
  console.error("reindex 실패:", (e as Error).message);
  process.exit(1);
});
