# Taiseel Design System

## Design direction

**Map-first land intelligence for Rwanda:** clean geography, visible parcel divisions, restrained green accents, clear typography, and evidence-aware property details. The map is the product surface; interface chrome supports it rather than competing with it.

Avoid generic purple gradients, decorative metric tiles, unnecessary nested cards, emoji icons, invented statistics, and decorative overlays that reduce boundary contrast. Use the existing icon and component patterns unless a real usability problem requires a new one.

## Token architecture

The existing implementation is the source of truth in src/app/globals.css. Tokens follow three layers:

1. **Primitive palette**: raw values named by color role, such as palette-forest or palette-border.
2. **Semantic tokens**: intent-based aliases such as brand, ink, border, surface, and focus.
3. **Component tokens**: shared choices for controls, panels, header sizing, touch targets, and elevation.

Do not introduce a new raw color into a component if an existing semantic token expresses the same intent.

| Token | Current purpose |
|---|---|
| --canvas | Main application canvas |
| --surface / --surface-muted | Primary and muted surfaces |
| --ink / --ink-secondary / --ink-muted | Text hierarchy |
| --border / --border-strong | Surface and control separation |
| --brand / --brand-hover / --brand-tint | Taiseel green interaction states |
| --focus | Visible keyboard focus |
| --warning / --success | Meaningful status feedback |
| --space-1 through --space-6 | Shared 4px spacing scale |
| --radius-control / --radius-panel | Control and panel shape |
| --tap-target-min | Minimum target size goal for new interactive controls |
| --shadow-floating | Shared elevation for floating map controls |

## Typography and layout

- Use the existing UI font stack from --font-ui.
- The dense map workspace uses a 14px default UI size. Meaning-bearing supporting text should normally remain at least 12px; tiny overlines are decoration, not the place for important information.
- Use clear heading, label, value, and source-note hierarchy. Parcel prices must not overpower the availability and evidence status around them.
- Keep important values readable and avoid truncating UPI, source, or location data without a way to inspect the full value.
- Use the common spacing scale before adding bespoke gaps.

## Map and parcel interaction

- The geographic hierarchy is District → Sector → Cell → Village. Individual land parcels are a separate cadastral layer, not an administrative level.
- Parcel fills remain transparent enough to preserve imagery. Boundary contrast must be strong on both the regular basemap and satellite imagery; the selected parcel should be unambiguous.
- Keep map controls and panels from obscuring the selected parcel or one another at narrow widths.
- A route estimate must be labelled as a road-route estimate, not live traffic. If routing fails, withhold distance/time instead of substituting straight-line distance.
- A price or area estimate must state its basis. Missing evidence is unknown, not a zero or a bad score.

## Accessibility and motion

- New interactive controls should aim for at least 44×44px hit areas where layout permits, with adequate space between adjacent targets.
- Preserve visible keyboard focus, semantic buttons/links, accessible names for icon-only actions, meaningful form labels, and logical focus restoration after dismiss/reopen actions.
- Do not use color alone to communicate availability, loading, error, or data quality.
- Respect prefers-reduced-motion. Animation must explain a transition or state change rather than decorate the screen.

## Visual acceptance pass

For a UI change, check:

1. Desktop around 1440px: map remains dominant and panels have clear hierarchy.
2. Tablet around 768px: controls do not collide with panels and long labels remain legible.
3. Mobile around 375px: no horizontal overflow, clipped controls, or inaccessible close/reopen actions.
4. Selected parcel: price basis, UPI, area basis, zoning state, and source caveats are readable.
5. Map states: boundaries are visible in both basemaps; selected styling does not hide adjacent boundaries.
6. Interaction: keyboard navigation, focus visibility, loading/error/empty states, compare flows, and reduced motion.
7. Truth: no decorative UI implies unsupported listing status, ownership, completeness, or valuation confidence.

The app is not ready for a visual sign-off until actual browser screenshots or an equivalent rendered check have been reviewed. Static source inspection alone is not screenshot QA.
