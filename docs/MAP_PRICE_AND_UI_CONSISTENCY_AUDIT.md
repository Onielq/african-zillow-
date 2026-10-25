# Map price-label and interface consistency audit

**Scope:** Rwanda Land Intelligence map workspace and the supporting application screens.  
**Reference used:** the supplied parcel-price and area-price screenshots, plus the Taste Skill app-screen rules in `Leonxlnx/taste-skill/skills/taste-skill/references/app-screens.md`.

## Decision

The map's job is to help people locate an area or parcel and read its currently available indicator without obscuring the land boundaries. Price labels are data marks, not navigation controls.

## Implemented in this change

- One shared compact-number formatter is used by map price labels and the transaction-volume endpoint. It uses uppercase suffixes: `10K`, `100K`, `500K`, `1M`, `100M`. The map label does not append “RWF”; units and calculation basis remain in explanatory detail.
- Area labels use a compact red capsule with white text, matching the supplied area-level reference. Parcels use a smaller muted slate capsule so the label sits inside a tight parcel footprint.
- Labels use normal symbol-placement collision rules. When labels would collide, MapLibre skips the pill and retains a small point at the feature, so dense sectors/cells remain readable without pretending their labels have more room than they do.
- The app's existing geography thresholds remain intact: sectors, then cells, villages, and parcels as the user zooms further in. One geographic level's boundaries are visible at a time.
- At parcel zoom with the average transaction-price metric selected, each parcel can show an **indicative estimated value** calculated from parcel area × the available matching cell transaction-price snapshot, with the existing district snapshot fallback when needed. The label is withheld when parcel area or a usable price is missing. It is not represented as an actual sale price or formal valuation.
- Transaction-volume labels keep their existing provenance markers and “modelled / unverified” caveats; only compact formatting is shared. Unavailable metrics keep neutral dots rather than invented amounts.

## Taste Skill review — broader screen audit

The skill's working-screen guidance favours real data, compact but readable labels, flat surfaces, repeated controls kept consistent, explicit loading/error/missing states, tabular numbers and mobile checks. The code-level audit found these follow-up items outside the map-label change:

1. `src/app/data-sources/data-sources.module.css` and `src/components/directories/directory-landing-page.module.css` duplicate parts of the header palette and navigation styling. A shared shell/tokens pass would reduce drift between Data Sources, Developers and the other directory screens.
2. Some small metadata and status styles in the directory and Data Sources screens are 9–10px. The skill's working-screen guidance sets 11px as the floor; review these in the browser and raise them where the text carries meaning.
3. The directory and Data Sources headers use `backdrop-filter: blur(...)`. The skill recommends opaque, flat surfaces for working screens; remove the blur if screenshot review confirms it provides no functional benefit.
4. Keep unavailable market metrics explicit. The map currently has no verified live inventory, future-supply pipeline, rental-yield dataset, or comparable historical price series; unavailable metrics should remain neutral/missing rather than generating decorative values.
5. The final visual pass should inspect the same route at 1440px, 768px and 390px: pill collisions around dense cells, label text clarity on map and satellite basemaps, controls covering parcel edges, and the directory header/label consistency.

## Validation and limitation

- Source assertions were added for the formatter, zoom hierarchy, parcel estimate path and collision-to-dot behavior.
- GitHub Actions and the Vercel preview build are the executable regression gate for this branch.
- The Taste Skill's browser screenshot inspector (`scripts/inspect.mjs --app`) was not run in this environment, so this document records a source audit and the remaining visual checks—not a claim of a screenshot-measured pass. No broad restyling of unrelated screens is included in this map-focused change.
