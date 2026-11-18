# Docker notes

Summary is in the README (section 11); this file keeps the operational details.

## Files

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build (deps, builder, runner), Node 22 Alpine, non-root user `nextjs`, Next.js `standalone` output |
| `docker-compose.yml` | `postgres` (17, volume `postgres-data`) and `app` (port 3000), healthchecks (`pg_isready`; app: `GET /api/health`), `env_file: .env.docker` |
| `docker-entrypoint.sh` | Waits for the DB (`nc`), runs `scripts/docker-migrate.mjs`, then starts `server.js` |
| `scripts/docker-migrate.mjs` | Applies the Drizzle migrations from `drizzle/` using only `postgres` and `drizzle-orm` |
| `dist-scripts/r6auth-check.mjs` | `r6auth:check` bundled by `pnpm build:scripts` so it runs without tsx |
| `.env.docker.example` | Template for `.env.docker` (git-ignored) |

The builder stage uses dummy values for `IRON_SESSION_PASSWORD` and `DATABASE_URL`; nothing connects
during the build. Real values come from `.env.docker` at runtime.

## Run

```bash
cp .env.docker.example .env.docker      # set IRON_SESSION_PASSWORD, R6AUTH_* ...
docker compose up -d --build
docker compose logs -f app
```

First-time data (run once; the scripts are not in the runtime image, so run them from a checkout
that can reach the database, or use `docker compose run`/psql as you prefer):

```bash
pnpm create-local-admin -- --username admin --password '<strong password>'
pnpm seed-roles
pnpm seed-cost-centers
```

## Useful commands

```bash
docker compose ps
curl -s localhost:3000/api/health   # {"status":"ok"} / 503 {"status":"error","reason":"db_error"|"db_timeout"}
docker compose exec app node dist-scripts/r6auth-check.mjs
docker compose exec postgres psql -U pwa_auth -d pwa_auth_db
docker compose down            # keep data
docker compose down -v         # also delete the database volume
```

## Notes

- `GET /api/health` (public, `Cache-Control: no-store`) checks Postgres with `select 1` and a 2 s
  timeout. r6auth is deliberately not checked: restarting the container does not fix an SSO outage,
  and the local admin break-glass login must keep working. Use it for load balancers and monitoring too.
- Container names are `pwa-sso-postgres` / `pwa-sso-app`. Compose derives the volume name from the
  project (folder) name, so renaming the folder or project also changes the volume; an old volume
  is not reused automatically.
- r6auth uses a public (DigiCert) certificate: no CA file is needed. If an internal CA is ever used,
  mount it read-only and set `NODE_EXTRA_CA_CERTS`; never disable verification.
- The Postgres port is published on the host for development. Remove the `ports:` entry in production.
