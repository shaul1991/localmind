# OpenMemory를 최신 소스에서 빌드한다.
# 게시 이미지(mem0/openmemory-mcp:latest)는 구버전이라 pgvector 미지원 +
# 목록/검색 읽기 버그가 있어, 최신 소스 + localmind 패치로 직접 빌드한다.
FROM python:3.12-slim

WORKDIR /usr/src/openmemory

# 최신 openmemory/api 소스만 sparse 체크아웃해서 가져온다.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/* \
 && git clone --depth 1 --filter=blob:none --sparse https://github.com/mem0ai/mem0 /tmp/mem0 \
 && (cd /tmp/mem0 && git sparse-checkout set openmemory) \
 && cp -a /tmp/mem0/openmemory/api/. /usr/src/openmemory/ \
 && rm -rf /tmp/mem0 \
 && apt-get purge -y git && apt-get autoremove -y

RUN pip install --no-cache-dir -r requirements.txt

# localmind 패치: (1) 목록/검색 DISTINCT ON 버그, (2) Postgres 앱 DB 지원.
COPY patch.py /tmp/patch.py
RUN python /tmp/patch.py

EXPOSE 8765
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8765"]
