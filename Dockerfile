# Multi-stage build for Next.js 16 with PostgreSQL + bcrypt support
# pnpm version: keep in sync with "packageManager" in package.json
ARG PNPM_VERSION=11.24.0

# Stage 1: Dependencies builder
FROM node:22-alpine AS deps
ARG PNPM_VERSION

# Install build dependencies for native modules (bcrypt, esbuild)
RUN apk add --no-cache libc6-compat python3 make g++

# Enable and setup pnpm
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install dependencies with frozen lockfile (reproducible builds)
RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM node:22-alpine AS builder
ARG PNPM_VERSION

RUN apk add --no-cache libc6-compat python3 make g++
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy entire source tree
COPY . .

# Set environment variables required at build time
# These are placeholders; actual values come from .env.docker at runtime
ENV IRON_SESSION_PASSWORD=build-time-placeholder-32-chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ENV DATABASE_URL=postgresql://pwa_auth:pwapass@localhost:5432/pwa_auth_db
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the application, then bundle the ops script (r6auth:check)
# so it runs in the runtime image without tsx / devDependencies.
RUN pnpm build && pnpm build:scripts

# Stage 3: Runtime
FROM node:22-alpine AS runner

RUN apk add --no-cache libc6-compat netcat-openbsd

WORKDIR /app

# Set environment variables for runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Copy standalone server from builder
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle

# Copy packages needed by docker-migrate.mjs at runtime
# (standalone mode bundles these into server.js so they're absent from node_modules)
COPY --from=deps /app/node_modules/postgres ./node_modules/postgres
COPY --from=deps /app/node_modules/drizzle-orm ./node_modules/drizzle-orm

# Next's standalone output tracer only copies the cjs/ subset of @swc/helpers,
# but next's own require-hook needs esm/ files at runtime too. Overwrite the
# trimmed copy with the full package (both symlinks in standalone resolve to
# this same pnpm store directory).
COPY --from=deps /app/node_modules/@swc/helpers ./node_modules/@swc/helpers


# Ops script: docker compose exec app node dist-scripts/r6auth-check.mjs
COPY --from=builder --chown=nextjs:nodejs /app/dist-scripts ./dist-scripts

# Copy docker entrypoint and migration script
COPY --chown=nextjs:nodejs docker-entrypoint.sh /usr/local/bin/
COPY --chown=nextjs:nodejs scripts/docker-migrate.mjs ./scripts/

# Make entrypoint executable
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Switch to non-root user
USER nextjs

# Expose application port
EXPOSE 3000

# Health check: /api/health runs `select 1` against Postgres (r6auth is deliberately not checked)
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
    CMD node -e "require('http').get('http://localhost:3000/api/health',{timeout:5000},(r)=>process.exit(r.statusCode===200?0:1)).on('timeout',()=>process.exit(1)).on('error',()=>process.exit(1))"

# Run entrypoint script which waits for DB, runs migrations, then starts app
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
