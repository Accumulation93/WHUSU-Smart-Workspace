# Feature Development With a Project Foundation

Use this workflow when a project already has maintenance docs, when the user asks to add a feature after the foundation pass, or when an in-progress project needs a concrete continuation task.

## Read First

Before implementation:

1. Check Git status before edits when inside Git.
2. Read `AGENTS.md`, `CLAUDE.md`, or the local agent adapter if present.
3. Read `docs/00-目录索引.md` if present.
4. Read the relevant architecture, startup, data/API, feature, and UI docs if present.
5. Inspect similar existing routes, pages, modules, services, and components.

If these docs are missing and the user asked for planning/standardization, return to the foundation workflow before coding. If the user asked for a specific implementation task, continue from code and config facts instead of blocking on a documentation foundation.

## In-Progress Project Continuation

Use this path when the project is already partly built and the user asks to continue, finish, fix, or add a concrete feature.

1. Identify the smallest project area that owns the requested behavior.
2. Read nearby examples before inventing new structure.
3. Preserve the current stack, routing, state management, styling, naming, and build tools unless the user explicitly asks to change them.
4. Use existing commands and scripts when present; if commands are missing, infer cautiously from package/build files and report uncertainty.
5. Make the requested change directly when it is within the user's approval.
6. Do not create a full docs foundation as a prerequisite for small, local, or clear work.
7. Suggest a separate foundation/takeover pass when the project lacks docs and the next work would cross multiple modules, data/API contracts, deployment, auth, billing, or shared UI rules.

## Map the Feature

Translate the requested feature into existing project boundaries:

- User role.
- Workflow or page.
- Data objects.
- API or external integration.
- Permission/auth impact.
- UI template or component family.
- Startup/deployment/config impact.
- Tests or verification path.

State assumptions in plain language before implementation when the business behavior is unclear.

## Reuse Order

Prefer:

1. Existing feature-level module.
2. Existing project service/data/API pattern.
3. Existing project UI wrapper or page template.
4. Existing provider component.
5. New reusable module/component.
6. One-off code only when the behavior is truly unique.

Update docs when a new reusable pattern, data contract, external integration, command, or module boundary is added. If no maintenance docs exist, mention the missing documentation as follow-up instead of creating a new doc tree unless the user asked for it.

## UI Kit Checks

For frontend work, preserve:

- Provider and primitive stack.
- Palette and semantic tokens.
- Typography hierarchy.
- Density and spacing.
- Radius, borders, shadows.
- Icon/media style.
- Motion boundaries and any recorded animation reference.
- Loading, empty, error, permission, and destructive-action states.
- Desktop and mobile behavior.

Read `provider-selection.md` only if a provider decision, UI stack conflict, or motion/animation reference request appears. React Bits can be suggested for React animation inspiration, but do not install dependencies or copy components without separate approval.

## Approval Boundaries

If the current task started as planning, documentation, or takeover, do not slide into code changes. Ask for explicit approval before editing source code or configs.

Always ask before:

- Installing dependencies.
- Changing package files.
- Editing environment files.
- Running migrations.
- Changing deployment/CI/Docker settings.
- Changing auth, billing, retry, or persistent data behavior.

## Verification

Use the commands documented in startup docs. If commands are absent or stale, report that and update docs after approval.

For UI-heavy work, inspect at least one desktop and one mobile viewport when a browser is available.
