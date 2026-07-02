# OpenMemory를 mem0 upstream의 고정 커밋에서 빌드한다. (specs/014 — 공급망 고정)
# 게시 이미지(mem0/openmemory-mcp:latest)는 구버전이라 pgvector 미지원 +
# 목록/검색 읽기 버그가 있어, 고정 스냅샷 소스 + localmind 패치로 직접 빌드한다.

# [공급망 고정] 베이스 이미지 — 갱신하려면: https://hub.docker.com/_/python 태그에서
#   새 3.12.x-slim 확인 → 값 교체 → `make up` + `make smoke` 검증. (specs/014 FR-2, BACKLOG B5)
ARG PYTHON_TAG=3.12.13-slim
FROM python:${PYTHON_TAG}

WORKDIR /usr/src/openmemory

# [공급망 고정] mem0 소스 커밋 — 빌드 시점의 upstream HEAD가 아니라 이 sha가 빌드된다.
#   개인 기억을 다루는 컨테이너에 검토 안 된 upstream 변경이 직행하지 않게 한다.
#   갱신하려면: `git ls-remote https://github.com/mem0ai/mem0 HEAD`로 새 sha 확인 → 값 교체 →
#   `docker compose build openmemory`(patch.py assert가 호환성 검증) → `make up`·`make smoke`.
#   (specs/014 FR-1, BACKLOG B5 — "고정"과 "방치"는 다르다: 분기별/보안 공지 시 갱신)
ARG MEM0_COMMIT=cd79fa8914b5b1cf66daacc957d826065df57df8

# 고정 커밋의 openmemory/api 소스만 sparse 체크아웃해서 가져온다.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/* \
 && git init /tmp/mem0 \
 && git -C /tmp/mem0 remote add origin https://github.com/mem0ai/mem0 \
 && git -C /tmp/mem0 fetch --depth 1 --filter=blob:none origin "${MEM0_COMMIT}" \
 && git -C /tmp/mem0 sparse-checkout set openmemory \
 && git -C /tmp/mem0 checkout "${MEM0_COMMIT}" \
 && cp -a /tmp/mem0/openmemory/api/. /usr/src/openmemory/ \
 && rm -rf /tmp/mem0 \
 && apt-get purge -y git && apt-get autoremove -y

RUN pip install --no-cache-dir -r requirements.txt

# localmind 패치: (1) 목록/검색 DISTINCT ON 버그, (2) Postgres 앱 DB 지원,
# (3) Host 헤더 검증(DNS rebinding 차단 — specs/014).
COPY patch.py /tmp/patch.py
RUN python /tmp/patch.py

EXPOSE 8765
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8765"]
