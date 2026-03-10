FROM node:20-alpine AS base

RUN apk add --no-cache openssl

# ---- Build backend ----
WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json* ./
RUN npm install

COPY backend/prisma ./prisma
RUN npx prisma generate

COPY backend/ .
RUN npm run build

# ---- Build MCP servers ----
WORKDIR /app/mcp/mcp-document-processor

COPY mcp/mcp-document-processor/package.json mcp/mcp-document-processor/package-lock.json* ./
RUN npm install

COPY mcp/mcp-document-processor/ .
RUN npm run build

WORKDIR /app/mcp/mcp-template-engine

COPY mcp/mcp-template-engine/package.json mcp/mcp-template-engine/package-lock.json* ./
RUN npm install

COPY mcp/mcp-template-engine/ .
RUN npm run build

# ---- Production stage ----
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl

WORKDIR /app

RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

# Backend
COPY --from=base /app/backend/node_modules ./node_modules
COPY --from=base /app/backend/dist ./dist
COPY --from=base /app/backend/prisma ./prisma
COPY --from=base /app/backend/package.json ./package.json
COPY backend/docker-entrypoint.sh /app/docker-entrypoint.sh

# MCP servers
COPY --from=base /app/mcp/mcp-document-processor/dist ./mcp/mcp-document-processor/dist
COPY --from=base /app/mcp/mcp-document-processor/node_modules ./mcp/mcp-document-processor/node_modules
COPY --from=base /app/mcp/mcp-document-processor/package.json ./mcp/mcp-document-processor/package.json

COPY --from=base /app/mcp/mcp-template-engine/dist ./mcp/mcp-template-engine/dist
COPY --from=base /app/mcp/mcp-template-engine/node_modules ./mcp/mcp-template-engine/node_modules
COPY --from=base /app/mcp/mcp-template-engine/package.json ./mcp/mcp-template-engine/package.json

RUN chmod +x /app/docker-entrypoint.sh

USER appuser

EXPOSE 3001

ENTRYPOINT ["/app/docker-entrypoint.sh"]
