# CLAUDE.md

Guidance for coding agents working in this repository. User-facing docs (Thai) are in `README.md`.

## What this is

Next.js 16 (App Router, Turbopack) + iron-session + Drizzle/PostgreSQL boilerplate. Employees sign in
**only** through **r6auth**, the PWA region 6 central login (OAuth-style authorization code: browser →
`authorize.php` → callback with `code` + `state` → backend POSTs `token.php` with the client secret →
user JSON). The app never sees employee passwords. Contractors (local accounts) and a `local_admins`
break-glass account sign in with a password on the same `/login` page. "PWA" means Provincial Waterworks
Authority (กปภ.), not Progressive Web App. `username` is the employee code.

Next.js 16 differs from older versions (e.g. `proxy.ts` replaces `middleware.ts`). Check
`node_modules/next/dist/docs/` before using unfamiliar Next APIs.

## Commands

```bash
pnpm dev                       # next dev --turbopack
pnpm lint                      # must report 0 problems
pnpm exec tsc --noEmit         # typecheck
pnpm test                      # vitest run (TMPDIR=.tmp); single file: pnpm test tests/auth/sso-login.test.ts
pnpm build                     # needs DATABASE_URL and a non-placeholder IRON_SESSION_PASSWORD (>= 32 chars)
pnpm db:migrate                # drizzle-kit migrate (generate with: pnpm exec drizzle-kit generate)
pnpm create-local-admin -- --username admin --password '...'
pnpm seed-roles                # Super Admin, Admin, Manager, User, Viewer
pnpm seed-settings             # optional: registration_mode (defaults to allow_new_users)
pnpm seed-cost-centers         # upsert data/cost-centers.csv into cost_centers (--file to override)
pnpm r6auth:check              # config, ping.php, URLs to register (never prints the secret)
pnpm build:scripts             # bundle scripts/r6auth-check.ts to dist-scripts/ (used in Docker)
```

Dev without r6auth: `R6AUTH_FAKE=true` sends the SSO button to `/dev/sso`, which lists fake users
`10001` / `10002` (BA 1059) and `10003` (BA 1060) plus a simulated outage (`fake:down`).

## Module map

- `src/lib/r6auth/` (Node only): `config.ts` (env parsing, lazy, `isFakeActive`), `client.ts`
  (`R6AuthClient`, `HttpR6AuthClient`: token.php exchange, zod-validated), `errors.ts`
  (`InvalidGrantError`, `R6AuthUnavailableError`), `urls.ts` (`buildAuthorizeUrl`, `buildLogoutUrl`),
  `fake.ts` (`FakeR6AuthClient`, `FAKE_SSO_USERS`), `types.ts`, `index.ts` (`getR6AuthClient`).
- `src/lib/auth/`: `sso-login.ts` (`attemptSsoLogin`, pure with injectable deps), `sso-state.ts`
  (sealed `<cookie>_sso` state cookie, `statesMatch`), `login.ts` (`attemptLogin`: password path for
  local admins and contractors), `normalize.ts`, `throttle.ts` (Postgres fixed window, 5 / 60 s),
  `principal.ts` (`loadActivePrincipal` / `loadCurrentPrincipal`), `require-active-user.ts`, `client-ip.ts`,
  `messages.ts` (Thai UI strings, `SSO_ERROR_MESSAGES`), `redirect.ts` (`safeRedirectPath`), `fresh-session.ts`.
- Routes: `src/app/api/auth/sso/login` (start), `src/app/api/auth/sso/callback`, `src/app/api/auth/login`
  (password), `src/app/api/auth/logout` (returns `redirectTo`: r6auth `logout.php` for SSO users, else
  `/login`). `src/app/dev/sso` is the fake authorize page (404 unless fake is active).
- `src/lib/users/`: `sync.ts` (`syncSsoUser`: upsert + base role + cost center role reconcile), `unit.ts`
  (`unitOf`: office → department → division), `admin-list.ts`.
- `src/lib/cost-centers/`: `csv.ts` (`parseCostCenterCsv`), `admin.ts` (reference data and
  `cost_center_roles` CRUD, `CostCenterRoleError`). Admin page `src/app/admin/cost-center-roles/`.
- `src/lib/contractors/`: local contractor accounts (ลูกจ้าง): admin service, contract window
  (Bangkok day), password, change-password, view helpers. Admin API `src/app/api/admin/contractors/**`.
- `src/lib/session-core.ts`: dependency-free (proxy-safe) session types and rules (`isSessionValid`,
  `isSsoExpired`, `assertSessionPassword`, `sessionConfigFromEnv`). `src/lib/session.ts`: iron-session options and `getSession`.
- `src/lib/health.ts` + `src/app/api/health/route.ts`: public DB-only healthcheck; never add r6auth to it.
- `src/lib/auth-strategies.ts`: local admin (bcrypt). `src/lib/api-middleware.ts`: admin API guard.
- `src/proxy.ts`: cookie-only redirect for `/profile`, `/change-password` and `/admin/*`; a session with
  `mustChangePassword` is sent to `/change-password`. Not a security boundary.
- `src/db/schema.ts`, `drizzle/`: `users` (`account_type` `sso` | `contractor`), `local_admins`, `roles`,
  `user_roles`, `cost_center_roles`, `cost_centers`, `system_settings`, `login_throttle`.
- `data/cost-centers.csv`: sample cost centers (`cctr,ba,cctrname`, UTF-8 BOM) matching the fake users. Deployments replace it with the real file; do not commit real organisation data here.
- `scripts/`: ops scripts. `tests/`: vitest, mirrors `src/`. `docs/LOGIN_FLOWCHART.md`: both flows.

## SSO order (`/api/auth/sso/*` + `attemptSsoLogin`)

1. `sso/login`: 32-byte hex `state`; seal `{state, from: safeRedirectPath(from)}` into `<cookie>_sso`
   (HttpOnly, SameSite=Lax, path `/api/auth/sso`, 10 min); redirect to `authorize.php` (fake: `/dev/sso`).
2. `sso/callback`: always clear `<cookie>_sso`. Valid session already → `/profile`. Missing/invalid
   cookie, no `code`/`state`, an `error` param, or `!statesMatch` → `/login?error=SSO_EXPIRED` without
   calling token.php.
3. Exchange: `InvalidGrantError` → `SSO_EXPIRED`; any other failure → `SERVICE_UNAVAILABLE`.
4. Empty username or `expires_at` in the past (60 s skew) → `SERVICE_UNAVAILABLE`.
5. `R6AUTH_ALLOWED_BA` non-empty and `ba` not in it → `NOT_ALLOWED` (before any row is written).
6. `syncSsoUser` (profile, base role, cost center roles). Failure (incl. contractor username clash) →
   `SERVICE_UNAVAILABLE`.
7. `is_active` → `INACTIVE`; `approval_status` pending/rejected → `PENDING_APPROVAL` / `REJECTED`.
8. Fresh session with `loginAt` and `expiresAt` (ms) → redirect to `from`. Failures → `/login?error=<CODE>`.

## Password order (`attemptLogin`)

1. Validate input (lengths, no control chars) → `INVALID_CREDENTIALS`, no throttle hit.
2. `normalizeUsername` (strips `PWA\` / `@suffix`); empty → `INVALID_CREDENTIALS`.
3. Throttle check (`lower(username)|ip`) → `TOO_MANY_ATTEMPTS` (429). DB failure → `SERVICE_UNAVAILABLE`.
4. Local admin (bcrypt) → success (`kind: "local"`) or `INACTIVE`.
5. Contractor (bcrypt). Wrong password → hit → `INVALID_CREDENTIALS`. Right password: inactive →
   `INACTIVE`; outside the contract window → `CONTRACT_NOT_STARTED` / `CONTRACT_ENDED` (no hit).
   Success → `kind: "contractor"`, `role: "user"`, `mustChangePassword`.
6. No local account matched → hit → `INVALID_CREDENTIALS`.

## Invariants (do not break; each has tests)

1. **`state` is single-use and compared in constant time**; the callback never calls token.php without a
   matching sealed state cookie. The cookie is cleared once its state matched (any outcome) or when it is
   unreadable; a callback with another state leaves it for the tab that owns it.
2. **The client secret and the authorization code never reach the browser, logs or error messages.**
3. **SSO sessions end at r6auth's `expires_at`** as well as `SESSION_MAX_LIFETIME` (absolute, from
   `loginAt`). No remember-me, no sliding expiry, no idle timeout. An `sso` session without `expiresAt`
   is invalid.
4. **The fake r6auth works only when `NODE_ENV` is `development` or `test`** (`isFakeActive`); `/dev/sso`
   404s otherwise.
5. **The BA allow-list runs before any row is written.**
6. **Cost center sync touches only roles that have a `cost_center_roles` row**, exact code match, active
   roles only. It never changes `users.role`, `is_active` or `approval_status`.
7. **Local admin is break-glass**: separate table, checked first, works when r6auth is down.
8. **The throttle counts failed password attempts only** (password path). Outages, inactive accounts and
   contract window failures do not count.
9. **`email` is not unique.** Identity is `username` = lowercased employee code.
10. **Post-login redirects go through `safeRedirectPath`** (no open redirect).

Also:

- **Never import `src/lib/r6auth` (or `node:fs`/DB code) from `proxy.ts` or any edge code.** `proxy.ts`
  may import only `session-core.ts` (cookie name and password via `sessionConfigFromEnv`); a test asserts this.
- **Never disable TLS verification** (`rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED=0`).
  r6auth uses a public certificate; an internal CA would go in `NODE_EXTRA_CA_CERTS`.
- `users.role` (enum admin/user) gates admin pages and is set only by an admin. Admin pages and
  `/api/admin/*` re-check the principal in the DB (`loadCurrentPrincipal`). `/profile` and
  `GET /api/user` re-check via `requireActiveUser`. The root nav and `proxy.ts` stay cookie-only.
- `IRON_SESSION_PASSWORD` equal to the `.env.example` placeholder is refused when `NODE_ENV=production`.
- Never log passwords. Never put real employee data (names, codes, emails) in code, tests, docs or
  fixtures; use the fake users (10001 / สมชาย ใจดี). Tests use invented cost centers (`9000xx`), not the CSV.
- `TRUST_PROXY` defaults to false: `X-Forwarded-For` is spoofable, so without it the throttle key uses a constant IP.

## Conventions

- Strict TypeScript, 2-space indent, double quotes, `@/` alias for `src/`. UI text is Thai; code, comments and logs are English.
- Keep login logic in pure functions with injected dependencies (`db`, `client`, `now`) so tests need no network.
- Routes that use r6auth or the DB set `export const runtime = "nodejs"`.
- r6auth times are epoch **seconds**; session `loginAt` / `expiresAt` are epoch **milliseconds**.
- Drizzle schema changes: edit `src/db/schema.ts`, run `pnpm exec drizzle-kit generate`, commit the SQL.
  Tests apply `drizzle/` to PGlite, so a stale migration fails tests.

## Testing

- vitest, `tests/**/*.test.ts`, globals on. DB tests use `createTestDb()` (`tests/helpers/pglite.ts`).
- **Tests never reach r6auth or a real Postgres.** Inject `FakeR6AuthClient` or a stub `R6AuthClient`
  into `attemptSsoLogin`, or pass a fake `fetch` to `HttpR6AuthClient`.
- Add a regression test with every change to SSO, login, throttle, sync, cost center roles or session;
  assert both success and failure branches.
- CI (`.github/workflows/ci.yml`): lint, `tsc --noEmit`, test, build (dummy env), `build:scripts`. No secrets, no r6auth.
- Commits follow Conventional Commits (`feat(auth): ...`).
