# Engineering Workflow

This workflow combines product planning, design critique, engineering review, browser QA, and controlled release. It uses the same role separation suggested by gstack without making gstack a runtime dependency.

## 1. Define the change

Write down the user-visible problem, the affected UI state, and what must not change. For map work, explicitly state whether the change affects geometry, data retrieval, rendering, pricing, or only presentation.

## 2. Design review before implementation

Read docs/DESIGN_SYSTEM.md and inspect the existing screen. Select one or two primary improvements rather than restyling every surface at once. Keep data semantics and legal/source caveats visible.

## 3. Implement narrowly

Reuse existing tokens and components. Keep API data, source labels, loading/error handling, and map-layer behavior intact unless they are part of the requested change. Do not add a new dependency when CSS, React, MapLibre, or existing project tooling already covers the requirement.

## 4. Review the code

Review for:
- correctness of data and source attribution;
- state lifecycle, asynchronous cancellation, and stale results;
- semantic interactive controls, keyboard handling, focus states, and accessible names;
- responsive overflow and map-control collisions;
- performance, map-layer ordering, boundary visibility, and reduced-motion behavior.

## 5. Run checks

At minimum, run the repository CI checks:
- npm run lint
- npm run typecheck
- npm test
- npm run build
- Docker image build
- npm run check:vinext
- npm run build:vinext

Do not hide failures with broad lint suppressions. If a check fails, fix the underlying issue or report the exact blocker. If a check is skipped, do not describe it as passed.

## 6. Browser QA

Check the deployed preview or local app at about 375px, 768px, and 1440px. Review the actual rendered screen, not only the DOM or a successful build. Include:
- map and satellite basemaps;
- administrative boundaries and village-level parcel outlines;
- a selected parcel and its evidence states;
- comparison add/remove and search;
- loading, no-results, and service-failure states;
- keyboard navigation and reduced-motion preferences.

Fix the three most consequential visual or functional defects, take fresh screenshots, and re-review.

## 7. Ship and verify

Use a focused branch and pull request when feasible. After merging, verify:
- the exact GitHub commit in the Vercel production deployment;
- the active Cloudflare Worker deployment and traffic allocation;
- the deployed homepage and critical parcel interactions;
- workflow results, including any failed optional or stale duplicate checks.

Report the precise state: built, deployed, and browser-verified are different claims. Keep a rollback reference for production promotion or a force-updated branch.
