# Docker Deployer Memory

## .env Special Characters
- Passwords with `$` cause docker-compose interpolation issues
- Passwords with `#` get truncated (treated as comments)
- Solution: wrap values containing `$`, `#`, `!`, `@` in **single quotes** in `.env`
- Docker-compose strips quotes when passing to containers -- values arrive clean
- Single quotes prevent BOTH `$` interpolation AND `#` comment parsing

## Prisma DATABASE_URL
- `prisma migrate deploy` requires DATABASE_URL env var at runtime
- Node.js code builds it in `env.ts` via `buildDatabaseUrl()`, but Prisma CLI runs before Node
- Solution: `backend/docker-entrypoint.sh` builds DATABASE_URL from components with URL-encoding
- The entrypoint runs `prisma migrate deploy` then `exec node dist/index.js`

## Redis Password with Special Characters
- Cannot pass password via `--requirepass "$VAR"` when value contains `$` -- shell double-interprets
- Solution: use `printenv REDIS_PASSWORD` (command substitution result is not re-expanded in quotes)
- Write redis.conf dynamically: `printf 'requirepass %s\n' "$(printenv REDIS_PASSWORD)" > /tmp/redis.conf`
- Healthcheck also uses `$(printenv REDIS_PASSWORD)` pattern

## MinIO Environment
- MinIO reads MINIO_ROOT_USER and MINIO_ROOT_PASSWORD directly from env
- Do NOT duplicate them in `environment:` section of docker-compose -- `env_file: .env` is sufficient
- Duplicating causes compose interpolation issues

## Key Files
- `/home/fake/projects/lawer/.env` -- single-quoted passwords
- `/home/fake/projects/lawer/docker-compose.yml` -- service definitions
- `/home/fake/projects/lawer/backend/Dockerfile` -- multi-stage, uses docker-entrypoint.sh
- `/home/fake/projects/lawer/backend/docker-entrypoint.sh` -- builds DATABASE_URL, runs migrations
- `/home/fake/projects/lawer/backend/src/config/env.ts` -- runtime env config with URL builders
