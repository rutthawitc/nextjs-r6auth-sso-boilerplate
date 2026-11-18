# Deployment checklist

Details for each item are in the README.

## Before first deploy

- [ ] Serve over HTTPS (the session cookie is `secure` in production).
- [ ] `IRON_SESSION_PASSWORD` is a real secret (`openssl rand -base64 48`). The app refuses to start
      in production with the `.env.example` placeholder.
- [ ] `IRON_SESSION_COOKIE_NAME` is unique among apps on the same host name (and differs from r6auth's).
- [ ] `DATABASE_URL` points at the production PostgreSQL 17; change the default `pwapass` password.
- [ ] App registered at `https://reg6apps.pwa.co.th/r6auth/apps.php` and approved:
      `redirect_uris` = `R6AUTH_REDIRECT_URI` (`https://<host>/api/auth/sso/callback`),
      `post_logout_redirect_uris` = `R6AUTH_POST_LOGOUT_REDIRECT_URI` (`https://<host>/login`), exact match.
- [ ] Users open the app by the host name in `R6AUTH_REDIRECT_URI`. The login button already sends
      them there, but a bookmark by IP or short name keeps a separate session cookie; publish and
      bookmark the registered name, or redirect other names to it at the reverse proxy.
- [ ] `R6AUTH_CLIENT_ID` / `R6AUTH_CLIENT_SECRET` set in `.env.docker` only (never in git).
- [ ] `R6AUTH_FAKE=false` (it is ignored in production anyway).
- [ ] `R6AUTH_ALLOWED_BA` matches policy (e.g. `1059`).
- [ ] The server can reach `https://reg6apps.pwa.co.th` (firewall / proxy).
- [ ] `TRUST_PROXY=true` only if a reverse proxy you control overwrites `X-Forwarded-For`.
- [ ] `SESSION_MAX_LIFETIME` set to the policy value (default 480 minutes; SSO sessions also end at r6auth's `expires_at`).

## First start

- [ ] Migrations ran (Docker: automatic in the entrypoint; otherwise `pnpm db:migrate`).
- [ ] `pnpm create-local-admin` (strong password), `pnpm seed-roles`, `pnpm seed-cost-centers`.
- [ ] `docker compose exec app node dist-scripts/r6auth-check.mjs` passes every step.
- [ ] Sign in with SSO and as the local admin; open `/admin/users`.
- [ ] Choose the registration mode in `/admin/settings`; map cost centers to roles in `/admin/cost-center-roles`.

## Ongoing

- [ ] Back up the PostgreSQL volume.
- [ ] Re-run `pnpm seed-cost-centers --file <new csv>` when the cost center list changes.
- [ ] A lost or leaked client secret: create a new one on the r6auth app page (the old one stops working at once).
- [ ] Rotating `IRON_SESSION_PASSWORD` signs everyone out (acceptable).
