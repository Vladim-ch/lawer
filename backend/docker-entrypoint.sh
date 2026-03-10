#!/bin/sh
set -e

# Build DATABASE_URL from components
# Passwords use RFC 3986 unreserved chars (-._~) so no URL-encoding needed
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-lawer}"

export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public"

# Build REDIS_URL
REDIS_H="${REDIS_HOST:-localhost}"
REDIS_P="${REDIS_PORT:-6379}"

export REDIS_URL="redis://:${REDIS_PASSWORD}@${REDIS_H}:${REDIS_P}"

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Starting application..."
exec node dist/index.js
