# Security Audit & Hardening Session — 2026-03-10

## Аудит

Security-gate провёл полный аудит проекта. **Оценка: 28/100**.
Обнаружено: 5 критических, 7 высоких, 8 средних уязвимостей.
Код написан грамотно (Prisma ORM, Zod, bcrypt 12 rounds, RBAC), основная проблема — инфраструктурная безопасность.

## Применённые фиксы (коммит `07b157d`)

Все фиксы прошли валидацию security-gate (PASS).

- Секреты вынесены из `docker-compose.yml` в `.env` (gitignored), используется `env_file`
- Порты PostgreSQL/Redis/MinIO привязаны к `127.0.0.1`
- Redis защищён паролем (`--requirepass`)
- Добавлены `helmet` и `express-rate-limit` (100/15мин общий, 10/15мин auth)
- Захардкоженный `changeme123` заменён на `crypto.randomBytes` (seed.ts, userService.ts)
- Fallback-секреты удалены из `env.ts`, добавлен `requireEnv()`
- Backend Dockerfile: multi-stage, non-root user `appuser:1001`, entrypoint-скрипт
- Валидация пароля усилена (8+ символов, верхний/нижний регистр, цифра)
- Stack trace скрыт от клиента в production
- JSON body limit снижен с 50mb до 10mb

## Ключевые изменения по файлам

### `docker-compose.yml`
- `environment:` с захардкоженными секретами → `env_file: .env`
- Порты: `"5432:5432"` → `"127.0.0.1:5432:5432"` (аналогично Redis, MinIO)
- Redis: добавлен `command` с `requirepass` через `printenv`, healthcheck через `redis-cli -a`
- MinIO: healthcheck `curl` → `mc ready local`
- Backend: убраны все явные переменные, добавлено только `NODE_ENV: production`
- Frontend: `NEXT_PUBLIC_API_URL` через `${NEXT_PUBLIC_API_URL}` из `.env`

### `backend/docker-entrypoint.sh` (новый)
Собирает `DATABASE_URL` и `REDIS_URL` из компонентов (POSTGRES_USER, POSTGRES_PASSWORD, etc.) для Prisma CLI, затем запускает `prisma migrate deploy` и `node dist/index.js`.

### `backend/Dockerfile`
Из однослойного стал multi-stage (`base` → `runner`). Runner-стейдж копирует только `node_modules`, `dist`, `prisma`, `package.json`, `docker-entrypoint.sh`. Запуск от `appuser:1001`.

### `backend/src/config/env.ts`
- Добавлены `requireEnv()`, `buildDatabaseUrl()`, `buildRedisUrl()`
- `buildDatabaseUrl()` — если `DATABASE_URL` задан (entrypoint), используется как есть; иначе собирается из компонентов
- Все критичные переменные (JWT_SECRET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, DB credentials) теперь обязательны — приложение не стартует без них

### `backend/src/index.ts`
- Добавлены `helmet()` и два rate-limiter: `generalLimiter` (100 req/15min), `authLimiter` (10 req/15min)
- `authLimiter` применяется только к `/api/auth`
- Body limit: `50mb` → `10mb`

### `backend/src/services/userService.ts`
- `DEFAULT_TEMP_PASSWORD = "changeme123"` → `generateTempPassword()` через `crypto.randomBytes(16)`
- `updateUser` возвращает `tempPassword` при сбросе пароля (для отображения админу)

### `backend/prisma/seed.ts`
- Пароль admin берётся из `ADMIN_PASSWORD` env var или генерируется `crypto.randomBytes(16)`
- Сгенерированный пароль выводится в stdout однократно

## Проблема с Prisma и спецсимволами

**Prisma 5.22 не декодирует URL-encoded спецсимволы** (`#`, `@`, `!`, `$`) в connection strings.
- `#` обрезает URL как fragment delimiter
- `%23`, `%21` и т.д. передаются литерально, не декодируются

**Решение**: пароли используют только RFC 3986 unreserved символы (`-`, `_`, `.`, `~`).
Security-gate одобрил: при длине 20+ символов энтропия 120+ бит (алфавит 66 символов) — выше порога NIST SP 800-63B (112 бит).

Также обнаружено, что `env_file` в docker-compose передаёт значения с одинарными кавычками как часть значения (если кавычки есть). Финальный `.env` использует значения без кавычек.

## Оставшиеся рекомендации

- HTTPS через reverse proxy (nginx/traefik)
- CSRF-защита
- Аудит-логирование действий пользователей
- Для production: сгенерировать новые пароли (текущие засвечены в контексте сессии)
