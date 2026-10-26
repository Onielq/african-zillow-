# Free-first architecture and deployment guide

## Default principle

Prefer open source and free tiers while traffic and feature requirements are small. Keep the repository as the source of truth, test changes before merge, package a portable runtime, and enable paid services only when the product has a concrete need and an approved budget.

## What this repository contains

| Layer | Implementation | Status |
| --- | --- | --- |
| Source control | GitHub | Active |
| Automated checks | GitHub Actions: lint, types, tests, Next.js build, Docker image build | Configured |
| Portable runtime | Multi-stage Docker image using Next.js standalone output | Configured |
| Local container run | Docker Compose | Configured |
| Database | Neon PostgreSQL via `DATABASE_URL` | Placeholder only; no database adapter/schema is wired yet |
| Email | Resend via `RESEND_API_KEY` and `RESEND_FROM_EMAIL` | Placeholder only; no email workflow is wired yet |
| File storage | Cloudflare R2 | Placeholder only; no upload/storage feature is wired yet |
| Cloud deployment | Cloudflare Workers after compatibility validation | Planned; production cutover has not occurred |

An empty environment variable does not enable a service. Add an integration only alongside the product feature, validation, and tests that use it.

## Important: Pages versus Workers for this app

This project uses Next.js route handlers under `src/app/api/` to query and process GIS data. A static-only Pages export does not run those server-side route handlers, so switching this app directly to a static Pages build would break live API-backed features.

For a full-stack Next.js app, Cloudflare currently recommends **vinext on Workers**. vinext can be added alongside an existing Next.js 16 setup, but it is in beta and must pass a compatibility scan and end-to-end tests before it replaces a production deployment.

Safe migration sequence:

1. In a dedicated branch, run `npx vinext check` and review the reported compatibility gaps.
2. Run `npx vinext init --platform=cloudflare`; inspect all generated dependency, script, Vite and Cloudflare configuration changes.
3. Preserve the existing `next dev`, `next build`, and Docker path while testing the new Worker path independently.
4. Build and preview in the Cloudflare runtime, then test the map, MapLibre worker assets, parcel lookup, official zoning lookup, and every `/api/geography/*` endpoint that the UI calls.
5. Deploy to a temporary `workers.dev` address first. Keep the existing production deployment until the Worker preview is verified. Only then switch the production domain.

Reference: [Cloudflare's Next.js / vinext guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) and [vinext migration documentation](https://vinext.dev/docs).

Cloudflare Pages remains a good choice for genuinely static sites. It is not the selected runtime for this project's current full-stack architecture.

## Runtime portability

Build and run locally:

```bash
cp .env.example .env
docker compose up --build
```

Open http://localhost:3000. Stop with `docker compose down`.

The Docker image targets the standard Node.js runtime and is independent from the Cloudflare Worker runtime. A built image is portable across compatible Docker hosts; the Worker deployment must be separately built and tested in Cloudflare's `workerd` environment.

## Environment and secrets

- Keep server credentials in local `.env` files or provider-managed secrets. Do not commit real secrets.
- Never prefix credentials with `NEXT_PUBLIC_`; Next.js exposes those values to browser code.
- `NEXT_PUBLIC_MAP_STYLE_URL` is intentionally public and is provided as a Docker build argument because browser-side values are embedded during the build.
- Keep `.env.example` limited to blank placeholders and non-secret defaults.
- Do not connect Neon, Resend, or R2 just to match a stack diagram. Add them only when schema migrations, mail templates, access controls, and integration tests are ready.

## Cost and custom domain

The target is zero monthly infrastructure cost where current free-tier limits permit it—not a guarantee of unlimited service. Re-check usage, data retention, bandwidth, request, email and storage quotas before a project launches. A provider subdomain such as `workers.dev` or `pages.dev` can avoid buying a domain at the beginning; registering a custom domain generally has a separate cost.
