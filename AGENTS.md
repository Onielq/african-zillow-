# Taiseel Development Agent Rules

Read this file before changing the application. Read the linked project guidance when the task touches that area.

## Product identity

Taiseel is a Rwanda-first land-intelligence product. The map is the main workspace; the interface should feel precise, calm, geographically grounded, and trustworthy. Do not turn it into a generic SaaS dashboard or a decorative real-estate landing page.

## Non-negotiable product truth

- Keep cadastral parcel geometry separate from administrative boundaries, price references, listings, and zoning.
- Do not imply that a mapped polygon proves ownership, legal title, availability, access, or current market value.
- Label published asking prices, calculated amounts, transaction-price references, estimated parcel areas, and missing data separately.
- Do not invent listings, developers, prices, project status, payment plans, source dates, or verified coverage.
- Preserve source attribution and disclose data-quality, licensing, completeness, and freshness limitations.

## Design system

Before styling, read [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md). Reuse CSS custom properties in src/app/globals.css. Prefer a small number of deliberate, consistent patterns over new one-off colors, shadows, borders, and radii.

The map remains the visual focus. Keep controls compact but operable, keep parcel boundaries visible over both basemaps, preserve focus states, and support keyboard input and reduced motion. Never remove accessibility cues to make a screenshot look cleaner.

## Working method

1. Establish the user-visible outcome and the exact screens/states affected.
2. Inspect existing implementation, source data, and current styles before writing code.
3. Make the smallest change that satisfies the outcome; do not rewrite unrelated map behavior.
4. Review the implementation with the relevant project skill under .agents/skills.
5. Verify the actual browser result at approximately 375px, 768px, and 1440px when UI changes are involved. Include loading, empty, error, selected-parcel, comparison, and keyboard states where relevant.
6. Run lint, type-check, tests, production build, and the Cloudflare Worker compatibility/build checks before release. Do not report a skipped check as passed.
7. Deploy through the repository's existing GitHub-to-Vercel and GitHub-to-Cloudflare paths. Verify the deployed commit and active production version; a successful build alone is not deployment evidence.

## Project references

- [Design system](docs/DESIGN_SYSTEM.md)
- [System architecture and data flow](docs/ARCHITECTURE.md)
- [Engineering and release workflow](docs/ENGINEERING_WORKFLOW.md)
- [Agent tooling map](docs/AGENT_TOOLING.md)
- [Presentation workflow](docs/PRESENTATION_WORKFLOW.md)
