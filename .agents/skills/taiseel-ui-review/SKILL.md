---
name: taiseel-ui-review
description: Use when designing, restyling, reviewing, or fixing any Taiseel map UI, parcel panel, comparison flow, developer directory, form, or public-facing product screen.
---

# Taiseel UI Review

## Before changing code

1. Read docs/DESIGN_SYSTEM.md and inspect the existing rendered screen and source.
2. Identify the user's primary task on that screen and the exact states affected.
3. Use the product's geographic specificity and real data as the visual concept. Avoid generic gradients, decorative cards, fabricated statistics, and stock imagery that does not add information.
4. Preserve the existing semantic color system and component patterns.

## Build and refine

1. Make one focused improvement.
2. Render at approximately 375px, 768px, and 1440px.
3. Capture screenshots of the changed states and look at the screenshots themselves.
4. Review readability, map visibility, boundary contrast, source caveats, hit targets, focus, and responsive collisions.
5. Rank the top three issues by user impact; fix them, regenerate screenshots, and review again.
6. Repeat only while each pass produces a clear improvement.

## Taiseel-specific review questions

- Can a buyer distinguish a cadastral record from a verified listing?
- Are asking price and transaction reference price clearly different?
- Is a calculated price labeled with its area and calculation basis?
- Can the buyer see parcel edges clearly on both Map and Satellite modes?
- Are area, zoning, nearby-access, and date/source gaps explained honestly?
- Can all important controls be operated by keyboard, with visible focus and useful accessible names?
- Does the small viewport clip the price, location, UPI, close control, or comparison action?

Do not claim visual QA is complete without evidence from an actual rendered browser view. Use upstream guidance from [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), [Taste Skill](https://github.com/Leonxlnx/taste-skill), and [Impeccable](https://github.com/pbakaus/impeccable) when those tools are installed in the active agent environment.
