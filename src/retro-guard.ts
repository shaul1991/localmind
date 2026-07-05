/**
 * specs/032 FR-7 — 회고의 유일한 파일 쓰기 지점(자기 개정 안전 게이트).
 *
 * 정직한 실체: Node 프로세스에 진짜 샌드박스는 없다 — 이것은 "모든 쓰기를 이 가드로
 * 라우팅하고, 해석된 절대경로가 reports/ 밖이면 throw"하는 **구조적 규율 + 테스트 단언**
 * 이다. 032 코드에서 쓰기 계열 fs API(writeFileSync·appendFileSync·createWriteStream·
 * renameSync 등)는 이 모듈에만 등장해야 한다(AC-6b — 코드 구조 grep으로 회귀 고정).
 */
import fs from "node:fs";
import path from "node:path";

/** reportsDir 안에서만 파일을 쓴다. 밖이면 throw — 회고는 규약·페르소나·스펙을 고칠 수 없다. */
export function guardedWriteFileSync(reportsDir: string, filePath: string, content: string): void {
  const base = path.resolve(reportsDir) + path.sep;
  const target = path.resolve(filePath);
  if (!target.startsWith(base)) {
    throw new Error(`회고 안전 게이트: reports/ 밖에는 쓸 수 없어요 — ${target}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}
