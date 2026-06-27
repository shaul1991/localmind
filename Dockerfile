# syntax=docker/dockerfile:1

# ───────────────────────── builder ─────────────────────────
# TypeScript를 빌드한다.
FROM node:24-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ───────────────────────── runtime ─────────────────────────
# claude(네이티브 glibc 바이너리)·codex(npm) CLI와 서버를 함께 담는다.
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# CLI 설치:
#  - codex: npm 전역 패키지(@openai/codex)
#  - claude: 공식 네이티브 설치 스크립트 → /root/.local/bin/claude
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g @openai/codex \
 && curl -fsSL https://claude.ai/install.sh | bash
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
