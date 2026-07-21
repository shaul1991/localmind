/**
 * second-brain 노트를 (재)인덱싱한다. 새 기기 복구나 노트 대량 추가 후 인덱스를 미리 데운다
 * (안 돌려도 첫 검색 때 자동 인덱싱되지만, 미리 해두면 첫 질의가 빠르다).
 *
 *   npm run reindex
 *   NOTES_DIR="work=/notes/work,life=/notes/personal" npm run reindex
 *
 * 전제: 임베딩 엔진(Ollama — EMBEDDINGS_URL, 기본 http://localhost:11434/v1)이 떠 있어야 한다.
 */
import { listFolders, reindex } from "../src/brain.js";

async function main(): Promise<void> {
  const folders = listFolders();
  console.log(`인덱싱 대상 폴더: ${folders.map((f) => `${f.label}:${f.dir}`).join(", ")}`);
  const { files, chunks, summary } = await reindex();
  console.log(`인덱싱 완료: ${files}개 파일 · ${chunks}개 청크`);
  // specs/020 FR-4 — 프루닝 요약은 이 명시적 재색인 경로에서만 안내한다(MCP 검색 경로 침묵).
  if (summary) {
    if (summary.fallback)
      console.log("! 노트 폴더 설정(NOTES_DIR)이 확정되지 않아 삭제 반영은 보류했어요 — 색인 추가·갱신만 진행했습니다.");
    for (const m of summary.missing)
      console.log(`! ${m.label}: 폴더를 열 수 없어 이 폴더의 색인은 그대로 보존했어요 (${m.dir}) — 연결(마운트)·권한을 확인해 주세요.`);
    for (const o of summary.orphans)
      console.log(
        `! ${o.label}: 지금 설정에 없는 폴더의 색인 ${o.files}건을 보존 중이에요 — 더 안 쓰는 폴더면 'REINDEX_PRUNE_LABELS=${o.label} make reindex'로 정리할 수 있어요.`,
      );
    for (const l of summary.pruneIgnored)
      console.log(`! ${l}: 지금 노트 폴더 설정에 있는 라벨이라 정리하지 않았어요 — 파일은 폴더 안에서 지우면 자동 반영돼요.`);
    for (const l of summary.pruneUnknown) console.log(`! ${l}: 그런 라벨은 색인에 없어요.`);
    for (const p of summary.pruned) console.log(`✓ ${p.label}: 색인에서 정리했어요(${p.files}건).`);
    // specs/024 — 라벨↔경로 바인딩(재바인딩 보존·수락) 안내
    for (const rb of summary.rebinds)
      console.log(
        `! ${rb.label}: 노트 폴더 위치가 바뀌었어요(${rb.recordedPath} → ${rb.currentPath}) — 이전 위치의 색인 ${rb.preserved}건을 보존 중이에요. 새 위치가 맞으면 'REINDEX_ADOPT_REBIND=${rb.label} make reindex'로 정리돼요.`,
      );
    for (const a of summary.rebindAdopted) console.log(`✓ ${a.label}: 새 위치를 수락했어요 — 이전 위치 색인 ${a.removed}건 정리.`);
    for (const l of summary.adoptDeferred) console.log(`! ${l}: 폴더를 열 수 없어 수락을 보류했어요 — 연결(마운트)·권한 확인 후 다시 시도해 주세요.`);
    for (const l of summary.adoptIgnored) console.log(`! ${l}: 위치가 바뀐 라벨이 아니라 수락할 것이 없어요.`);
  }
}

main().catch((e) => {
  console.error("reindex 실패:", (e as Error).message);
  process.exit(1);
});
