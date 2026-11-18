# Repository Guidelines

The authoritative guide for coding agents is [`CLAUDE.md`](CLAUDE.md): architecture, login order,
invariants (r6auth SSO state handling, throttle rules, session lifetime), commands and test conventions.
User documentation (Thai) is in [`README.md`](README.md). Do not duplicate or contradict them here.

Quick reference:

- Source in `src/` (alias `@/`), ops scripts in `scripts/`, tests in `tests/` (vitest, PGlite, no network).
- Before finishing: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`.
- Conventional Commits; never commit secrets, `.env*`, or real employee data.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
