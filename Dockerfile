# syntax=docker/dockerfile:1

# [공급망 고정 — specs/010] node 베이스 버전을 여기 한 곳에서만 고정한다(builder·runtime 공유).
#   풀버전(24.18.0) 고정 = 재현성 우선. 트레이드오프: 마이너 태그(24-slim)면 보안 패치를
#   자동 수용하나 빌드마다 내용이 달라진다 → specs/010은 재현성을 택했다.
#   버전을 올리려면: https://hub.docker.com/_/node 에서 24 계열 신규 slim 태그 확인 후
#   이 ARG 한 줄만 바꾸고 `make up`으로 검증(AC-4: 고정 지점 단일화).
ARG NODE_VERSION=24.18.0

# ───────────────────────── builder ─────────────────────────
# TypeScript를 빌드한다.
FROM node:${NODE_VERSION}-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ───────────────────────── runtime ─────────────────────────
# claude(네이티브 glibc 바이너리)·codex(npm) CLI와 서버를 함께 담는다.
# 베이스 버전은 위 ARG NODE_VERSION을 공유(갱신은 그 한 줄만).
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# [비-root 실행 결정 — specs/010 FR-6] 현재는 root로 실행한다(보류).
#   근거: claude 설치가 /root/.local/bin에 놓이고 codex는 npm 전역(/usr/local),
#   compose가 ~/.codex를 /root/.codex로 마운트한다. `USER node`로 바꾸면 이 세 경로
#   (설치 위치·PATH·볼륨 마운트)를 모두 조정해야 해 파급이 크다. 위협 모델이 "내 머신에서
#   나 혼자"·루프백 전용이라 우선순위가 낮아, 경로 재설계는 후속(BACKLOG)으로 보류한다.
#
# CLI 설치(버전 고정):
#  - codex: npm 전역 @openai/codex@<버전>.
#      갱신: `npm view @openai/codex version`으로 신규 버전 확인 후 아래 값 변경.
#  - claude: 공식 install.sh에 버전 인자 전달(스크립트가 [stable | 특정 VERSION] 인자를 받음)
#      → /root/.local/bin/claude. 갱신: 호스트 `claude --version` 확인 후 아래 값 변경.
#      주의: install.sh 스크립트 자체는 매 빌드 원격에서 받는다 — 설치 '버전'은 고정되지만
#      설치 '스크립트'는 미고정. 더 강한 고정(바이너리 직접 다운로드+체크섬)은 BACKLOG 후속.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g @openai/codex@0.142.4 \
 && curl -fsSL https://claude.ai/install.sh | bash -s -- 2.1.196
ENV PATH="/root/.local/bin:${PATH}"

# 프로덕션 의존성만 설치 후 빌드 산출물 복사.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist

# 컨테이너 외부에서 접근하려면 0.0.0.0 바인딩이 필요하다.
ENV HOST=0.0.0.0 \
    PORT=8787
EXPOSE 8787

CMD ["node", "dist/index.js"]
