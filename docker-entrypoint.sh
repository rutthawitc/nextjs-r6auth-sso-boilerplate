#!/bin/sh
set -e

# Parse host and port from DATABASE_URL
# Format: postgresql://user:pass@host:port/db
DB_HOST=$(echo "$DATABASE_URL" | sed 's|.*@||' | cut -d':' -f1)
DB_PORT=$(echo "$DATABASE_URL" | sed 's|.*@||' | cut -d':' -f2 | cut -d'/' -f1)
DB_PORT=${DB_PORT:-5432}

echo "Waiting for PostgreSQL at $DB_HOST:$DB_PORT..."

RETRY=0
MAX=30
until nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
  RETRY=$((RETRY + 1))
  if [ $RETRY -ge $MAX ]; then
    echo "✗ Database not reachable after $MAX attempts. Exiting."
    exit 1
  fi
  echo "  Attempt $RETRY/$MAX — retrying in 2s..."
  sleep 2
done

echo "✓ Database is ready."

echo "Running migrations..."
node scripts/docker-migrate.mjs
echo "✓ Migrations complete."

exec "$@"
