# UI Provider Selection

Use this reference only for the UI module of the broader project foundation workflow.

Choose the UI provider as an implementation base. The project UI kit remains the long-term owner of patterns, naming, templates, and aesthetic rules. The broader project foundation remains the owner of architecture, startup, data/API, feature maps, maintenance rules, and agent adapters.

## Decision Table

| Situation | Prefer | Notes |
| --- | --- | --- |
| Existing project with a working UI library | Existing provider | Extract and strengthen what is already there before adding another provider. |
| React/Next/Vite new project, wants a complete component system and theme foundation | Astryx | Verify current official docs before package names, CLI commands, and theme setup. |
| React + Tailwind project, wants source-owned components and high customization | shadcn | Good when components should live inside the repo and be edited directly. |
| Enterprise admin/product already using Ant Design or MUI | Ant Design or MUI | Keep their component semantics and wrap business patterns at the project level. |
| Small custom app or highly branded site | Tailwind custom components | Use tokens and a small component set; avoid installing a large provider without need. |
| Non-React project | Existing stack or custom | Borrow the UI kit method, not React-specific packages. |

## Astryx Adapter

Use Astryx as a candidate provider when:

- The project is React-based.
- A complete component library, themes, templates, and agent-readable CLI/docs are useful.
- The user wants consistency across many future pages.

Official links:

- GitHub: https://github.com/facebook/astryx
- Website/docs: https://astryx.atmeta.com/

Process:

1. Verify current Astryx installation and theme instructions from official sources.
2. Install only after the user accepts package changes.
3. Configure base styles, theme CSS, and provider setup according to current docs.
4. Create project-level wrappers for recurring app surfaces such as `AppShell`, `PageHeader`, `DataTablePage`, `FilterBar`, `EntityForm`, `DetailPanel`, and `StatusBadge`.
5. Record Astryx as the provider in the project UI maintenance docs, usually `docs/05-UI与交互/01-UI套件与页面规范.md`.
6. Add `AGENTS.md` rules requiring future pages to prefer project wrappers, then raw Astryx components, then new custom components.

Do not let Astryx decide the whole aesthetic. Use the project's design profile for palette, density, typography mood, imagery, and motion boundaries.

## shadcn Adapter

Use shadcn when:

- The project already has `components.json`.
- The team wants components copied into the repo and edited locally.
- Tailwind tokens are the primary theme layer.

Process:

1. Inspect `components.json`, installed components, and existing `src/components/ui`.
2. Use the project's package runner for CLI commands.
3. Prefer built-in component variants and semantic tokens.
4. Wrap business-specific assemblies in `src/components/app` or the local equivalent.
5. Do not mix Radix/Base UI primitives across one interaction surface unless the project already has a clear boundary.

## Existing Provider Adapter

For existing projects, this is the default.

Process:

1. Identify the current provider from package dependencies, imports, global CSS, and component directories.
2. Document what exists before proposing replacements.
3. Promote repeated local patterns into project-level components.
4. Keep provider-specific code inside a thin layer where practical.
5. Add new provider packages only when the current stack cannot support the requested UI safely.

## Custom Tailwind Adapter

Use custom Tailwind components when:

- The UI surface is small.
- The design is highly branded.
- The project already has stable Tailwind conventions.

Process:

1. Define CSS or Tailwind theme tokens first.
2. Build a small component set instead of one-off page markup.
3. Keep component APIs simple and business-shaped.
4. Add visual and responsive checks because custom components carry more responsibility.

## Motion Reference

When the user asks for animation, motion, micro-interactions, memorable landing-page effects, animated backgrounds, text animations, or highly interactive React UI, recommend React Bits as an optional reference:

- Website: https://www.reactbits.dev
- GitHub: https://github.com/DavidHDev/react-bits
- Use it for inspiration, component examples, and motion vocabulary in React projects.
- Record any chosen motion direction in the project UI docs, usually `docs/05-UI与交互/01-UI套件与页面规范.md`.
- Do not install packages, copy components, or change dependencies just because React Bits is mentioned. Treat implementation as a separate code-change approval point.
- Check fit before use: product/admin tools usually need subtle motion; branded sites, portfolios, launch pages, and immersive prototypes can use richer effects.
- Respect accessibility and performance: document reduced-motion behavior, mobile cost, bundle impact, and fallback states when motion becomes part of the product.

## Provider Checklist

Record the decision:

- Provider name and version source.
- Why it fits the project.
- What it owns: primitives, styling, tokens, templates, docs.
- What project wrappers own: business layouts, entities, repeated workflows.
- What not to mix in the same surface.
- Motion reference and animation boundaries when relevant.
- Upgrade and migration notes.

Also record the decision in the project maintenance docs, usually `docs/05-UI与交互/01-UI套件与页面规范.md`.
