# Project Manager Memory - Lawer

## Project Structure
- Monorepo: `/home/fake/projects/lawer/`
- Backend: `backend/` (Node.js + Express + TypeScript + Prisma)
- Frontend: `frontend/` (Next.js 14 + Tailwind + Zustand)
- MCP servers: `mcp/mcp-document-processor/`, `mcp/mcp-template-engine/`
- Docker Compose: `docker-compose.yml` (postgres pgvector, redis, minio, backend, frontend)
- TZ: `TZ.md`

## Environment
- No Node.js/npm installed on host -- code runs only in Docker containers
- Git is available, repo initialized on `master` branch

## Commit Conventions
- frontend: `--author="frontend-chat-ui <frontend@lawer.local>"`
- backend: `--author="backend-developer <backend@lawer.local>"`
- mcp: `--author="mcp-developer <mcp@lawer.local>"`
- infra/project: `--author="project-manager <project-manager@lawer.local>"`

## Phase 1 MVP Status
- [x] Monorepo structure, .gitignore, .env.example
- [x] Docker Compose (postgres pgvector, redis, minio, backend, frontend)
- [x] Backend: Express + Prisma schema (7 models), auth (JWT+bcrypt), conversations CRUD, SSE streaming
- [x] Frontend: Next.js 14, auth pages, chat layout with sidebar, SSE streaming, markdown rendering
- [ ] MCP servers: mcp-document-processor, mcp-template-engine (directories created, code TBD)
- [ ] Document upload/analysis API endpoints
- [ ] Template-based document generation (3 contract types)
- [ ] Connect to real LLM (currently MVP simulated responses)

## Key Files
- Prisma schema: `backend/prisma/schema.prisma`
- Backend entry: `backend/src/index.ts`
- Frontend entry: `frontend/src/app/page.tsx`
- API routes: `backend/src/routes/auth.ts`, `backend/src/routes/conversations.ts`
- Zustand stores: `frontend/src/stores/authStore.ts`, `frontend/src/stores/chatStore.ts`
