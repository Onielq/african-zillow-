---
name: taiseel-release-review
description: Use before merging or deploying Taiseel changes, especially changes to maps, parcel records, APIs, data-source labels, pricing, or infrastructure.
---

# Taiseel Release Review

## Review gates

- Confirm the intended branch, head commit, base commit, and files changed.
- Review product truth and data-source caveats; never replace unknown values with guessed data.
- Run lint, type-check, tests, Next production build, Docker build, Vinext compatibility check, and Cloudflare Worker build.
- Review responsive browser screenshots and relevant parcel-outline/map interaction checks for UI changes.
- Resolve lint/type/test/build failures before reporting success. Do not silence checks globally to get a green result.
- Confirm secrets are not in the diff and no optional service is presented as active without a runtime binding.

## Release verification

After merge, verify the Vercel production deployment SHA and READY state. Separately verify the latest active Cloudflare Worker deployment and version traffic allocation. Check the deployed site, not only provider build logs.

Record stale or optional failed checks separately from the canonical deployment pipeline, and explain why they are unrelated only when verified. Preserve the previous production commit or deployment as a rollback point.

Use the role-separated product/review/QA/ship process documented in docs/ENGINEERING_WORKFLOW.md. The original workflow reference is [gstack](https://github.com/garrytan/gstack); it is an optional local development tool, not an application dependency.
