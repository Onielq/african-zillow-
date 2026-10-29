# Agent Tooling Map

These tools are development-time workflows, not JavaScript dependencies shipped to visitors. This repository now contains project-specific instructions and skills under AGENTS.md and .agents/skills/. The original projects remain the authoritative implementations of their own commands and runtimes.

| Upstream project | Taiseel use | Project integration |
|---|---|---|
| [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Design-system choices, usability rules, accessibility, responsive UI | docs/DESIGN_SYSTEM.md and the Taiseel UI-review skill |
| [Taste Skill](https://github.com/Leonxlnx/taste-skill) | Deliberate art direction, real-browser screenshots, iteration on app screens | Taiseel UI-review skill and the visual acceptance pass |
| [Impeccable](https://github.com/pbakaus/impeccable) | Critique, accessibility/responsive audit, polish and hardening | Engineering workflow and CI checks; use its detector when the approved agent environment supports it |
| [Diagram Design](https://github.com/cathrynlavery/diagram-design) | Branded architecture and data-flow diagrams | docs/ARCHITECTURE.md and the architecture-diagram skill |
| [gstack](https://github.com/garrytan/gstack) | Product planning, engineering review, browser QA, ship checklist | docs/ENGINEERING_WORKFLOW.md |
| [PPT Master](https://github.com/hugohe3/ppt-master) | Editable investor and market presentations | docs/PRESENTATION_WORKFLOW.md |

## Installation notes for an agent-capable local workspace

The connectors available for this task can change GitHub source and inspect provider deployments, but do not expose a shared local checkout where these third-party agent packages can be installed and browser-interactive commands executed. The project guidance above is committed; the upstream packages themselves have not been vendored into the production app.

When a local Codex-compatible environment is available, the upstream instructions currently include:

- UI UX Pro Max: install the official CLI with npm and run uipro init --ai universal from the project root.
- Taste Skill: npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend".
- Impeccable: npx impeccable install --providers=codex --scope=project.
- Diagram Design: npx skills add cathrynlavery/diagram-design.
- gstack: follow the upstream setup guide; it requires Claude Code and Bun and installs its own browser/workflow tooling.
- PPT Master: install and run the official skill only when creating or editing a presentation.

Run each upstream installer only in the agent environment that will execute its skills, follow its own integrity/security gates, and review the files/hooks it writes. Do not install these packages as application runtime dependencies.
