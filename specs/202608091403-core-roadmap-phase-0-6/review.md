# Review — LocalMind 코어 중장기 개선 Phase 0~6

## 현재 판정

**Phase 3 완료, Phase 4 구현·검증 중** — Phase 2는 `[verified]` commit `cf31d79`,
Phase 3는 frozen v1 `4889f214…cdd3`의 동일 START/END fingerprint와 독립 양축
`COMMIT_ALLOWED`를 확인한 뒤 `[verified]` commit `4e45d82`로 닫았다. Phase 4는 기존
living-memory 위에 same-folder supersession, active-only stale-on-contact, multi-root brief scope
isolation만 좁게 완성한다.

## Phase 커밋

| Phase | Commit | 검증 | 판정 |
|---|---|---|---|
| 0 | `b26e3d5` | 원본 `022555e`와 tree SHA 동일; Node 215, shell/typecheck/build 성공 | 통과 |
| 1 | `9fad6d2` | 원본 `43b7d58`과 tree SHA 동일; setup 54, MCP 9, Node 247, CI Node 20/22/24 | 통과 |
| 2 | `cf31d79` | frozen v9 Node 312/312, shell 23/23, Bash 57/57, 양축 `COMMIT_ALLOWED` | 통과 |
| 3 | `4e45d82` | frozen v1 Node 318/318, shell 23/23, Bash 57/57, 양축 `COMMIT_ALLOWED` | 통과 |
| 4 | candidate | brief precision·same-folder supersession·active-only stale·multi-root scope | 구현·검증 |
| 5 | 대기 | portability/ops/security | 대기 |
| 6 | 대기 | evidence/cadence | 대기 |

## 최종 검증

구현 완료 후 실제 RED/GREEN 관찰, 명령 결과, 독립 리뷰 지적과 해결, 잔여 위험을 이 문서에 기록한다. PR 번호·CI run id 같은 일시적 메타데이터를 위한 별도 코드 커밋은 만들지 않는다.

## Phase 0 증거

- `docs/core-roadmap.md`가 북극성 여정, 제품 불변식, Phase 0~6 범위와 종료 게이트를 고정한다.
- canonical artifacts `goal.md`, `spec.md`, `plan.md`, `tasks.md`, `review.md`가 같은 일곱 Phase와
  Phase 0·1 선행 PR / Phase 2~6 후속 Draft PR rollout 계약을 사용한다.
- `main`의 required linear history 때문에 Phase 0·1은 rebase-merge됐다. 새 `b26e3d5`의 tree는
  원본 `022555e`와 같고, 새 `9fad6d2`의 tree는 원본 `43b7d58`과 같다. PR head의 필수 CI
  Node 20/22/24는 모두 성공했고 일반·formal·inline comment와 미해결 thread는 0이었다.
- `npm test`: 215 pass, 0 fail, 0 skip.
- `for t in scripts/*.test.sh; do bash "$t" || exit 1; done`: 전체 통과.
- `npm run typecheck`, `npm run build`: 성공.

## Phase 2 증거

### 구현·불변식

- digest 없는 v4/무-digest v5와 parse·digest·semantic 손상 세대는 캐시 chunk/vector를 신뢰하지 않고 readable canonical Markdown에서 authenticated clean rebuild한다.
- digest-valid v5 JSON/Float32 sidecar는 finite·dims·safe-integer slot·range·global uniqueness·completeness를 모두 만족할 때만 hydrate한다. file hash뿐 아니라 canonical root label에서 파생한 `folder`, chunk 수·path·text와 link 의미를 scan과 검색 반환 직전에 대조하며, stale reload-merge도 등록된 folder에서 같은 검증을 우회해 기존 bytes를 재봉인하지 않는다. 미등록 durable orphan은 자기 folder/key prefix가 맞을 때 보존하되 검색 표면에서는 제외한다.
- recursive canonical scan 또는 개별 Markdown read가 하나라도 실패하면 legacy 승격·정상 v5 prune·capability 발급·부분 generation 저장을 모두 중단한다. model/dimension/legacy clean rebuild는 기존 generation을 지우지 않고 메모리에서만 구성하며 progress/failure save를 억제한다. scan한 root와 guarded source identity를 JSON rename 전후에 재검증하고, rename 순간 drift면 이전 JSON bytes로 atomic rollback한다.
- duplicate/suffix-colliding folder label은 모든 base label을 먼저 예약하고 canonical path 순으로 suffix를 부여해 `NOTES_DIR` 입력 순서와 무관하다.
- nested index ancestor와 host identity marker의 원자 publish/fsync, lock ownership, concurrent writer merge를 격리 fixture로 검증했다. same-label binding은 load baseline 기반 three-way merge로 최신 durable adopt를 보존하고 양쪽 변경 충돌은 fail closed한다. deletion intent와 guarded source는 pre/post-commit 검사를 사용하며 delete/recreate·same-byte identity ABA면 이전 generation을 복원한다.
- backup은 effective env/`.env`/literal `~/` index·query 경로와 recursive host marker를 purge한다. custom exact path는 Git `:(literal)`과 anchored `.gitignore` literal escape를 사용하고 suffix만 escaped glob으로 처리해 `*`·`?` 이웃의 canonical 파일을 보존하며, control-character path·unsafe `.gitignore`·post-stage derived 추적은 publish 전에 중단한다.
- recover는 inline credential·option/control-character repo·host/origin mismatch·pull failure를 clone/install 전에 거부한다. repo ingress는 local path·HTTPS·SSH만 허용하고 remote-helper·unknown scheme·다중 `@` authority를 git/gh argv 전에 차단한다. existing clone은 branch tracking 설정이 아니라 검증된 literal `origin`과 현재 branch ref를 pull하고 `HEAD=FETCH_HEAD`를 확인한다. local bare remote에서 production backup → fresh clone → reindex → fresh search를 거친 뒤, 서로 다른 두 incoming SHA의 existing-clone 전진도 검증했다.
- 공용 URL formatter는 C0/DEL이 하나라도 있으면 원문을 부분 수정하지 않고 `[REDACTED]`만 반환하고, 다중 `@` userinfo는 마지막 authority delimiter까지 모두 마스킹한다. recovery·embedding·setup·doctor ingress는 parsing·fetch·curl·git/gh argv 전에 unsafe URL을 거부하고 synthetic canary가 stdout/stderr/MCP content에 없음을 확인한다.
- query-log merge는 destination leaf 또는 `$HOME` 아래 ancestor symlink를 따라가지 않고 non-zero로 거부한다. final rename 실패도 destination bytes 보존, temp cleanup, 성공 메시지 억제로 닫힌다.
- watcher는 awaitable ready/close lifecycle을 제공한다. close 이후 새 event/timer를 막고 이미 시작된 reindex callback과 underlying FSWatcher close를 모두 기다리되, 이미 `close` event가 발생한 watcher는 다시 기다리지 않고 stdio/HTTP shutdown을 완료한다. startup/error stderr는 공개-safe label과 generic error만 사용해 canonical absolute root를 노출하지 않는다.

### RED→GREEN

- nested `readdirSync` EACCES에서 legacy v4가 빈 v5로 승격되고 trusted v5가 prune될 수 있던 실패를 재현한 뒤 JSON/sidecar bytes 불변으로 GREEN.
- `dup=/a,dup=/b,dup-2=/c`가 명시 `dup-2`를 선점하던 실패를 순방향/역방향으로 재현한 뒤 deterministic binding으로 GREEN.
- semantic sidecar 6종(fractional, negative, out-of-range, duplicate, in-range gap, JSON/header dims mismatch)을 valid index/vector digest로 재봉인한 fixture에서 load·reload-merge 양쪽 fail-closed로 GREEN.
- `.env` query source 무시, literal `~/` 미확장, `.gitignore` directory/symlink false success, nested marker 잔존을 재현한 뒤 GREEN.
- `BRAIN_INDEX=canonical*.md`와 `QUERY_LOG=private?.jsonl`이 canonical 이웃까지 untrack/ignore하던 RED를 exact literal operand와 escaped ignore rule로 GREEN. newline control path의 false success도 publish 전 exit 2로 GREEN.
- deferred embedding callback 중 watcher `close()`가 먼저 resolve하던 순서를 동기 fake FSWatcher로 재현한 뒤 `callback-released → close-resolved`로 GREEN.
- 첫 fresh clone 뒤 incoming commit이 없어 no-op pull만 통과하던 fixture를 RED로 고정하고, 두 번째 production backup/push와 existing-clone HEAD/content/search 전진으로 GREEN.
- digest-valid JSON/vector digest를 모두 재계산한 forged chunk와 forged `folder`가 canonical 의미를 잃던 RED를 canonical root label·chunk·link 대조, 재임베딩, 검색 직전 fail-closed로 GREEN.
- legacy 및 model/dimension clean rebuild가 기존 generation을 먼저 지우거나 첫 batch의 부분 v5를 publish하던 RED를 in-memory rebuild·progress/failure save 억제·기존 bytes 보존으로 GREEN.
- canonical root가 실제 JSON rename 순간 이동하던 RED를 post-commit root guard와 이전 JSON atomic rollback으로 GREEN.
- branch tracking `other`와 verified `origin`에 서로 다른 incoming SHA를 둔 RED를 literal origin/ref fetch·fast-forward와 exact `HEAD=FETCH_HEAD` 검증으로 GREEN.
- transient ENOENT→same-byte source recreate, deletion 확인 뒤 actual JSON rename recreate, guarded source의 same-byte identity 교체가 durable entry를 잃거나 stale generation을 publish하던 RED를 재확인·pre/post-commit guard·atomic rollback으로 GREEN.
- same-label 최신 durable binding이 stale writer의 unrelated 저장으로 과거 경로로 되돌아가던 RED를 load baseline three-way merge와 conflict fail-closed로 GREEN.
- 이미 `close` event가 발생한 watcher를 aggregate close가 영구 대기하던 RED를 close-state 추적으로 GREEN.
- direct embedding과 setup/doctor의 TAB·DEL URL이 fetch/curl 경계에 도달하던 RED를 URL parser·network 이전 거부와 canary 비노출로 GREEN.
- query-log destination symlink가 외부 파일을 읽고 leaf를 교체하던 RED를 leaf/`$HOME`-ancestor symlink 선거부와 target bytes 보존으로 GREEN.
- newline·TAB·CR·ESC·DEL userinfo masking, 다중 `@` authority, direct recovery URL subprocess ingress RED를 C0/DEL 선행 거부와 마지막 authority delimiter 마스킹으로 GREEN.
- v7 stale writer가 digest-valid forged disk entry를 재봉인하던 RED를 reload-merge canonical 검증과 disk bytes 보존으로 GREEN. 인접 self-review에서 registered disk entry의 revision-changed·confirmed-missing도 새 generation에 채택하던 RED를 `status === match` 조건으로 닫고, 미등록 durable orphan은 보존하면서 검색 전체를 실패시키던 RED를 candidate filter로 GREEN했다.
- canonical admission 강화 뒤 explicit deletion tombstone의 durable baseline까지 일반 disk-only entry로 먼저 거부하던 통합 RED 2건을 재현했다. tombstone과 key/hash가 같은 baseline은 같은 lock의 deletion guard가 최종 판단하도록 우선순위를 교정했고, 기존 synthetic reload-merge fixture는 실제 canonical source 또는 명시적 orphan으로 정합화해 4/4 targeted 및 311/311 전체 GREEN을 확인했다.
- guarded source가 연속 두 번 transient ENOENT 뒤 같은 bytes로 재생성될 때 durable entry를 삭제하던 RED를, 두 번째 ENOENT 뒤 `stat` 존재면 revision-conflict fail-closed하고 실제 부재면 post-rename deletion intent로 전환하는 규칙으로 GREEN. 기존 same-process·cross-process 실제 삭제 성공 회귀도 함께 보존했다.
- 개별 Markdown `EACCES`를 건너뛰고 다른 변경만 partial publish하던 RED를 generation 전체 중단과 기존 bytes 보존으로 GREEN.
- Brain과 setup smoke의 duplicate/reserved label allocator 불일치를 canonical-path reservation 알고리즘 공유 계약으로 GREEN.
- recover embedding URL의 TAB canary가 두 health fetch에 도달하던 RED를 공용 HTTP URL 선검증으로 GREEN.
- recover repo의 `ext::`, unknown scheme, 다중 `@` SSH canary가 git argv에 도달하던 RED를 local/HTTPS/SSH allowlist로 GREEN.
- watcher startup stderr의 canonical absolute root 노출 RED를 label-only 출력으로 GREEN.
- query-log `mkdir`·`append` filesystem 오류의 raw `Error.message`가 stdio MCP stderr에 absolute path·control canary를 노출하던 RED를 공통 path-free diagnostic으로 GREEN. sync MCP child와 async append 두 경계를 각각 보호했다.
- same-label 양쪽 변경 conflict와 forged `linksOut` 보호 테스트는 각각 production branch 제거 mutation에서 exit 1 RED, 원본에서 GREEN을 확인했다.

### 전체 gate

- 폐기한 v7은 frozen Node 303/303·shell 23/23·typecheck·build·Bash·diff·credential·docs·process-leak gate가 green이었지만, 독립 리뷰 blocker로 bytes가 바뀌어 승인에 재사용하지 않는다.
- 최종 v9 `43db1928…7bb2`: frozen Node 312/312·52 suites, shell 23/23, Bash 57/57, typecheck·build·diff·credential·docs·dependency 4,305·process-leak 모두 GREEN, `overall_ok=true`.
- SPEC/SECURITY/CONCURRENCY와 QUALITY/TEST-ADEQUACY/DOCS 재검토는 모두 START=END=`43db1928…7bb2`, blocker 0, `COMMIT_ALLOWED`였다.
- reviewed 35개 staged blob의 path/mode/SHA-256을 manifest와 대조한 뒤 parent `9fad6d2` 위에 commit `cf31d79`를 생성했고 worktree clean을 확인했다.

### 독립 리뷰와 해결

- 초기 review 라운드에서 발견된 recursive scan, suffix collision, `.gitignore`/pathspec/recursive marker, effective query source, semantic sidecar branch witness, final merge write, bare remote provenance, host identity, watcher lifecycle, 042 정책 문구 문제는 실패 테스트 또는 직접 branch witness로 수정했다.
- 폐기한 docs-inclusive 후보 `f04179…9af0d`의 SPEC/SECURITY/CONCURRENCY 리뷰는 forged canonical chunk, clean-rebuild root loss, untrusted tracking upstream, unchanged-disk delete/recreate ABA, control-character userinfo 등 코드 blocker 5건을 독립 재현했고 종료 fingerprint도 실행하지 못했다. 그 후보의 gate·verdict는 재사용하지 않는다.
- 폐기한 v3 `160f72ec…e289`의 SPEC/SECURITY/CONCURRENCY 리뷰는 code blocker 8건(folder 의미 위조, dimension clean-rebuild root loss, source ABA, stale same-label binding, pre-closed watcher, embedding control URL, query-log symlink, multi-`@` masking)과 종료 fingerprint 미확인으로 `BLOCKERS: 9`, `VERDICT: BLOCKED`였다. QUALITY/TEST-ADEQUACY/DOCS 리뷰도 legacy progress partial publish와 actual rename ABA, fingerprint protocol 미완료로 `BLOCKERS: 3`, `VERDICT: BLOCKED`였다.
- v4 frozen quality runner는 evidence 보존을 고친 뒤 green이었지만, 위 blocker 수정으로 repository bytes가 바뀌어 즉시 폐기했다. 위 blocker와 adjacent guarded-source identity race는 `src/phase2-adversarial.test.ts`와 shell 회귀에서 GREEN이지만 이것은 commit authorization이 아니다.
- v6 `5277ea09…4a68`은 dependency 4,305 entries를 독립 포함해 Node 303/303, shell 23/23,
  Bash 57/57, typecheck·build·credential/docs/process/diff gate가 green이었다. 그러나 Phase 0·1
  rebase-merge 후 HEAD/branch framing과 rollout 문서가 달라졌으므로 리뷰 전 폐기했다.
- v7 `8717243f…a561` SPEC/SECURITY/CONCURRENCY 리뷰는 production blocker 7건과 END 누락을 포함해
  `BLOCKERS: 8`, `BLOCKED`였다. QUALITY/TEST-ADEQUACY/DOCS 리뷰는 binding-conflict·forged-link
  회귀 공백 2건과 END 누락으로 `BLOCKERS: 3`, `BLOCKED`였다. START=MID는 일치했으나 END가 없어
  protocol만으로도 commit 불가이며, 해당 fingerprint의 gate·verdict는 재사용하지 않는다.
- 최종 문서 포함 v9는 독립 양축 검토에서 고정된 Phase 2 불변식의 deterministic 위반 0을 확인했다. 범위 밖 제안은 non-blocking 잔여 위험으로 유지했고 verdict 뒤 candidate bytes를 바꾸지 않은 채 commit했다.

### 잔여 위험

- 외부 Git host·실제 Ollama·개인 HOME/notes는 Phase 2 검증에 사용하지 않았다. Git remote는 local bare repo, embedding은 loopback deterministic fixture로 격리했다.
- Markdown이 정본이며 JSON/vector/query report는 재생성 가능한 파생물이라는 계약을 유지한다.
- 실제 provider latency/장기 다중 writer stress, 검색 relevance baseline, folder-label helper의 단일 모듈 추출, 운영 telemetry 확대는 각각 Phase 3~6에서 점진적으로 다룬다. 이 항목들은 현재 Phase 2 closure blocker가 아니다.
- 종료 규칙: 고정 회귀와 전체 gate가 GREEN이고 최신 fingerprint 독립 검토가 명시된 Phase 2 위반을 재현하지 못하면 Phase 2를 완료한다. 이후 발견은 새 Phase 또는 별도 작은 TDD slice로 계산한다.

## Phase 3 증거

- 공개 CC0 synthetic corpus 5문서·positive 4/no-match 1 질의를 `retrievalEvaluationPort`의 production chunk/embed/index/save/reload/search 경로로 실행한다.
- missing CLI RED를 `eval:retrieval` report/manifest GREEN으로 닫았다. strict no-match baseline은 exit 1과 deterministic violation을 남긴다.
- duplicate chunk가 relevant recall을 2로 부풀리던 RED를 query별 고유 document 집계로 GREEN했다.
- forged relevance·unknown returned document는 corpus 정본 검증에서 거부하고 document path traversal·symlink는 indexing 전에 차단한다.
- report는 품질 metric·ranked sources·query drain과 비차단 p50/p95 timing을 기록한다. corpus/document/baseline/source/runtime manifest는 temp root와 무관하게 재현된다.
- live gate: targeted 6/6, 전체 Node 318/318·52 suites, shell 23/23, typecheck·build·diff GREEN.
- 최종 frozen v1 `4889f214…cdd3`: Node 318/318, shell 23/23, Bash 57/57, dependency 4,305, docs·credential·process leak 0, `overall_ok=true`.
- 독립 SPEC/SECURITY와 QUALITY/TEST-ADEQUACY/DOCS 검토는 모두 START=END, blocker 0, `COMMIT_ALLOWED`였다. reviewed 22개 staged blob을 검증해 parent `cf31d79` 위에 commit `4e45d82`를 만들고 clean tree를 확인했다.
- 잔여 위험: production relevance threshold가 없어 no-match FPR은 현재 1.0이다. baseline은 이를 숨기지 않으며 실제 provider/개인 corpus/hybrid/rerank/threshold는 후속 단계로 이월한다.
