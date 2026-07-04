/**
 * specs/022 FR-4 — doctor의 고아·부재 라벨 안내용 리더(얇은 래퍼).
 * 판정은 TS 단일 소스(brain.indexLabelReport)가 하고, 여기서는 셸이 렌더하기 좋은
 * 라인 단위 레코드(탭 구분)로만 출력한다 — doctor는 렌더만 한다(019 원칙).
 *
 *   NOTES_DIR=... node --import tsx/esm scripts/index-labels.ts
 *
 * 출력(0건이면 아무것도 출력하지 않음 — doctor의 0건 침묵):
 *   orphan\t<라벨>\t<항목수>
 *   missing\t<라벨>\t<폴더경로>\t<항목수>
 */
import { indexLabelReport } from "../src/brain.js";

const r = indexLabelReport();
for (const o of r.orphans) console.log(`orphan\t${o.label}\t${o.files}`);
for (const m of r.missing) console.log(`missing\t${m.label}\t${m.dir}\t${m.files}`);
