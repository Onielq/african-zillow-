---
name: taiseel-architecture-diagrams
description: Use when documenting or changing Taiseel runtime architecture, parcel data provenance, APIs, map layers, source integrations, deployment paths, or data trust boundaries.
---

# Taiseel Architecture Diagrams

1. Read docs/ARCHITECTURE.md and inspect the relevant API, map component, and deployment workflow.
2. Pick the diagram type that clarifies the question: architecture, sequence, data flow, or state lifecycle.
3. Keep one diagram focused. Split diagrams that need more than about nine meaningful nodes.
4. Use a consistent visual hierarchy and label direction, source, and trust boundaries.
5. Distinguish implemented services from proposed services. Do not draw Neon, R2, Resend, or other optional services as active unless the code and runtime configuration confirm them.
6. Distinguish official geometry, zoning, observed price snapshots, derived estimates, nearby-place search, and routing.
7. Add the diagram to the docs closest to the system it describes; include source and licensing caveats in accompanying text.

Use [Diagram Design](https://github.com/cathrynlavery/diagram-design) in an agent environment that has it installed. Do not treat a diagram as proof that an integration works; verify with code and runtime evidence.
