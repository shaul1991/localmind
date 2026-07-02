# 실험: 같은 스펙, 다른 모델 — 동작 수렴 vs 코드 형태 발산

## 질문
goal/spec/plan(특히 `spec.md`의 Interface Contract)이 충분히 정밀하면, 서로 다른 AI 모델
(Fable/Opus/Sonnet)이 **독립적으로** 구현해도 관측 가능한 동작이 수렴하는가? 그리고 코드
형태(구조·네이밍·문구)는 어디까지 발산하는가?

## 설계
- **고정 공유 오라클**(`oracle.test.sh`) = 유일한 채점자. 39개 assertion으로 AC-1~18의
  관측 가능한 동작을 검사한다. 이 파일은 실험 대상이 아니며 누구도 수정하지 않는다.
- **각 모델은 오라클·레퍼런스를 보지 않는다.** 계약 문서만 보고 `notes-connect.sh`를 구현한다.
  → "알려진 테스트 맞추기"가 아니라 "스펙 해석의 수렴"을 측정하기 위함.
- **레퍼런스 구현**(`reference/notes-connect.sh`) = 오라클이 통과 가능함을 증명하는 control.
  오라클 채점 결과 39/39.
- **테스트 seam**(계약에 명시): `MCP_INSTALL_CMD`(등록 스텁), `NOTES_CONNECT_ENV`(.env 폴백
  경로), `GIT_BIN`(git 없음 재현). 네트워크 불필요 — 로컬 bare repo를 원격으로 삼는다.

## 채점
```
bash grade.sh <구현 notes-connect.sh 경로>
# 예: bash grade.sh impl-fable/notes-connect.sh
```
오라클은 `NC_SCRIPT` env로 대상 구현을 받는다(`grade.sh`가 설정).

## 측정 지표
1. **동작 수렴**: 각 구현의 오라클 통과 개수(/39). 39/39가 여럿이면 동작 수렴.
2. **코드 형태 발산**: 구현 간 `diff`, 라인 수, 헬퍼 구조, 기계 판독 라인 외 메시지 문구.

## 산출물 배치
- `reference/notes-connect.sh` — control (39/39).
- `impl-fable/notes-connect.sh`, `impl-opus/notes-connect.sh`, `impl-sonnet/notes-connect.sh`
  — 각 모델 arm.
- `results.md` — 채점 표 + 형태 비교 요약(실행 후 기록).
