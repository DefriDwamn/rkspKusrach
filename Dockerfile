FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

COPY tsconfig.base.json eslint.config.mjs ./
COPY apps/backend apps/backend
COPY packages/shared packages/shared
RUN npm run build --workspace @rksp/backend

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=10000 \
    RAG_VECTOR_INDEX_PATH=/app/data/processed/vector-index.json

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --omit=dev

COPY --from=build /app/apps/backend/dist apps/backend/dist
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --chown=node:node data/processed/vector-index.json data/processed/vector-index.json

USER node
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1

CMD ["npm", "run", "start", "--workspace", "@rksp/backend"]
