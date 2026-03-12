# Security Gate Memory -- Lawer Project

## Last Audit: 2026-03-10 (post-fix validation)
- Score: 77/100 (up from 28/100)
- Status: APPROVED WITH CONDITIONS
- See `audit-2026-03-10-postfix.md` for detailed findings

## Project Architecture
- Frontend: Next.js 14, Zustand state, React Markdown
- Backend: Express 4, Prisma ORM (PostgreSQL with pgvector), JWT auth, bcrypt (12 rounds), Zod validation
- MCP servers: document-processor (pdf-parse, mammoth, docx), template-engine
- Storage: MinIO (S3-compatible), Redis (with password auth)
- Docker: docker-compose, no orchestrator

## Current Security Posture (post-fix)
### Fixed Issues
1. Secrets extracted to .env file (not in git)
2. PostgreSQL, Redis, MinIO bound to 127.0.0.1
3. Redis now has password authentication
4. JWT fallback secret removed -- requireEnv() enforced
5. Hardcoded reset password replaced with crypto.randomBytes
6. Helmet + rate limiting added (100/15min general, 10/15min auth)
7. Backend Dockerfile: multi-stage, non-root (appuser:1001)
8. Error handler masks stack traces in production
9. Password complexity: 8+ chars, upper, lower, digit

### Remaining Issues
1. ~~[HIGH] seed.ts: "changeme123" hardcoded~~ -- FIXED 2026-03-10: env var + crypto.randomBytes(16) fallback
2. **[MEDIUM] Backend/Frontend ports (3001, 3000) bound to 0.0.0.0** -- no TLS/reverse proxy
3. **[MEDIUM] Password validation not confirmed on admin user creation route**
4. **[LOW] npm install instead of npm ci in Dockerfile**
5. **[LOW] No audit logging for security events**
6. **[LOW] seed.ts: auto-generated password printed to stdout (docker logs exposure)**

## Security Patterns (Good)
- Prisma ORM prevents SQL injection
- Zod validation on all API endpoints
- RBAC with requireRole middleware on admin routes
- Conversation ownership check via findFirst({where: {id, userId}})
- bcrypt 12 rounds for password hashing
- Frontend Dockerfile uses non-root user (nextjs)
- Error responses masked for clients (errorHandler.ts)
- CORS restricted to single origin (env.frontendUrl)
- requireEnv() pattern for all critical env vars

## Key File Locations
- Auth middleware: backend/src/middleware/auth.ts
- Role middleware: backend/src/middleware/roleMiddleware.ts
- JWT config: backend/src/config/env.ts
- User service: backend/src/services/userService.ts
- CORS/rate-limit config: backend/src/index.ts
- Prisma schema: backend/prisma/schema.prisma
- Seed (fixed -- env var + random fallback): backend/prisma/seed.ts
- Password validation: backend/src/routes/auth.ts (changePasswordSchema)
- Error handler: backend/src/middleware/errorHandler.ts
- Docker compose: docker-compose.yml
- Secrets: .env (gitignored)
