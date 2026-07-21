---
candidate-id: post-impl (feat/living-memory, 커밋은 self-review 후 확정)
round: 0
independence: 구현 fork 자신의 도그푸드(비독립 — 격리 critic은 부모 세션이 실행)
blockers: []
advisories: []
approval-needed: false
completion: dogfood-recorded
---

# T4.2 도그푸드 — 실 stdio · 실 Ollama(bge-m3) · 격리 노트 폴더

2026-07-21 17:52(KST 기준 로컬), M5. `dist/mcp.js`(빌드 산출물)를 StdioClientTransport로
실기동 — 임시 노트 폴더(사용자 벌트 무오염), 임베딩은 **실 Ollama 직결**(스텁 아님).

## 관찰 시퀀스 (전부 실제 출력에서 발췌)

1. **tools/list** → `brief, capture_note, search_notes, whoami` (정확히 4 — 표면 최소 유지).
2. **capture_note(결정)** — choice/why/assumptions(high 1·low 1) 1회 호출 → 파일 1개 완성:
   frontmatter에 `type: decision` + 3층 + 전제별 `last_verified` 자동 스탬프. ✅ 인덱싱 확인
   (실 bge-m3 임베딩 — watcher reindex 로그 관찰).
3. **search_notes(fresh)** — 결과 정상, 신호 없음(오탐 0).
4. **brief(fresh)** — `■ 선택 [노트경로]` + 이유 요지 + 전제 상태. 신호 없음.
5. **stale 재현** — high 전제 last_verified를 40일 전으로 파일 직접 편집 → **brief에 ⏳ 한 줄
   신호**(경로·1건·40일 경과) 부가, 본문 블록은 동일 + 전제 상태에 "재검증 필요" 표시.
6. **재검증 관례** — last_verified를 오늘로 갱신 → 다음 brief에서 신호 소멸(AC-10 반영).
7. **query-log** — 5건: `capture_note, search_notes, brief, brief, brief` — brief가 별도
   tool로 기록됨(측정 구분 성립).

## 습관화 관찰 항목 (advisory ⑧ — 판정은 실사용 후)

brief는 여전히 pull 도구다 — §6-3의 "자동 주입" 성립은 지침 파일의 한 줄
("새 세션 시작 시 brief 호출")을 호스트 AI가 실제로 따르는지에 달렸다. **관찰 계획**:
사용자 지침 파일에 연결 후, query-log의 `tool: "brief"` 레코드가 세션 시작 시점대에
자동으로 쌓이는지를 회고 리듬에서 확인한다. 안 쌓이면 OQ-V3의 다른 배달 수단(훅·파일 생성)
재검토가 다음 슬라이스다.

## 한계

- 도그푸드는 격리 임시 폴더에서 수행 — 사용자 실 벌트 캡처는 지침 연결 후 실사용에서 관찰.
- 스위트: 전체 252/252 green + typecheck 통과(자식 probe 10종 포함) — suites 산출은 스위트
  로그가 근거(테스트 실행이 재현 수단).

## 리베이스 후 재확인 (2026-07-22, main aa13b42 위 재배치 후)

- 도구 노출: tools/list == [brief, capture_note, search_notes, whoami] (4종 — stdio 실기동).
- 무키 경로: EMBEDDINGS_KEY 미설정 기동 시 brief가 신 에러 문구("임베딩 키(EMBEDDINGS_KEY)가
  설정되지 않았어요…")로 응답 — great-reduction r1 B4 수정과 정합.
- 격리 폴더 풀 사이클(실 Ollama bge-m3): 결정 캡처(choice·why·assumptions top-level) →
  fresh brief 무신호 → last_verified 42일 조작 → brief에 "재검증 필요" 마킹 + ⏳ 재검증 권장
  한 줄(노트 경로 포함, 본문 뒤 부가·비차단) → 전 단계 isError=false.
- 관찰 2건(코드 결함 아님·후속 참고): ① NOTES_DIR 라벨 구분자는 `=`인데 `:`를 쓰면 문자
  그대로 상대경로가 되어 의도치 않은 폴더에 저장된다 — 진단 메시지 없음(UX 후속 후보).
  ② 실 코퍼스(1240파일·간밤 신규 캡처 다수) 첫 질의는 증분 재색인이 선행되어 응답이 수십 초
  ~ 분 단위로 지연될 수 있다(brief 신규 아님 — search_notes 동일 거동, 기존 특성).
