---
name: blue-glass-ui
description: >
  Design or refactor UI for the WHUSU Smart Workspace mini program in the mature scoring/admin
  "blue luxury glass" style. Use this whenever the user asks for 蓝色玻璃风,
  轻奢玻璃风, 和WHUSU智慧工作台/人事信息/管理端风格一致, or asks to beautify pages in
  this project.
---

# Blue Glass UI for WHUSU Smart Workspace Mini Program

> UI Kit 事实来源（2026-08）：`docs/ui-kit.md`、`docs/ui-components.md`、`docs/ui-page-templates.md`。
> `miniprogram/app.wxss` 的手机、Pad 竖屏和 Pad 横屏令牌必须分别保留；本技能中的示例只说明结构，若尺寸冲突，以 UI Kit 和运行时令牌为准。
> WXML 的静态间距、字号、颜色和圆角必须进入语义类；仅运行时坐标、进度、拖拽、时间表和动画允许动态行内样式。`.ui-overlay` 物理视口几何只能在 `app.wxss` 定义一次。

This project already has a mature visual language in the scoring admin pages and
portal/home pages. Follow those pages first. Do not invent a new unrelated
palette, and do not make the UI look like a generic white SaaS dashboard.

Primary references:
- `miniprogram/subpackages/scoring/pages/admin/admin.wxss`
- `miniprogram/pages/portal/portal.wxss`
- `miniprogram/pages/home/home.wxss`

## Core Direction

The style is blue glass, but restrained:
- pale blue gradient page background with subtle radial light
- compact dark-blue or blue-gradient hero for management pages
- translucent white content cards with blur, light border, and inner highlight
- blue gradient active states and primary actions
- small, dense, readable management UI, not oversized marketing UI

Avoid these failures:
- giant empty decorative areas
- flat white cards with no project personality
- heavy blue blocks everywhere
- huge buttons, huge titles inside cards, or fat input rows
- nested cards inside cards unless the inner item is a repeated list row
- long explanatory paragraphs where a short label or helper line is enough

## Colors

Use these values unless an existing local component already defines a close match:

```css
--blue-900: #1e3a8a;
--blue-800: #1d4ed8;
--blue-700: #2563eb;
--blue-500: #3b82f6;
--blue-400: #60a5fa;
--text-main: #0f172a;
--text-body: #1e293b;
--text-muted: #64748b;
--line-blue: rgba(147, 197, 253, 0.64);
--line-soft: rgba(226, 237, 247, 0.96);
--danger: #ef4444;
```

Status chip variants:
- Blue: `rgba(219,234,254,0.76)`, text `#1d4ed8`, border `rgba(147,197,253,0.64)`
- Green: `rgba(209,250,229,0.78)`, text `#15803d`, border `rgba(110,231,183,0.58)`
- Orange: `rgba(255,237,213,0.78)`, text `#c2410c`, border `rgba(253,186,116,0.58)`
- Sky: `rgba(224,242,254,0.76)`, text `#0369a1`, border `rgba(56,189,248,0.56)`
- Red is for destructive controls only.

## Page Base

Use the project background, copied from portal/home:

```css
page {
  min-height: 100%;
  background:
    radial-gradient(circle at 12% 10%, rgba(96, 165, 250, 0.16) 0%, transparent 26%),
    radial-gradient(circle at 86% 18%, rgba(191, 219, 254, 0.22) 0%, transparent 24%),
    radial-gradient(circle at 18% 88%, rgba(125, 211, 252, 0.10) 0%, transparent 22%),
    linear-gradient(135deg, #f8fbff 0%, #f1f6fc 48%, #edf3fa 100%);
}

.page {
  position: relative;
  min-height: 100vh;
  padding: 30rpx 24rpx 42rpx;
  box-sizing: border-box;
}
```

Optional page light orbs are allowed, but keep them subtle and fixed behind
content. Never use purple/pink/orange blobs.

## Hero

For management pages, prefer the scoring admin hero: compact, dark blue, premium,
not a huge marketing banner.

```css
.hero-admin {
  position: relative;
  overflow: hidden;
  margin-bottom: 22rpx;
  padding: 38rpx 34rpx 34rpx;
  border-radius: 34rpx;
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.96) 0%, rgba(30, 41, 59, 0.96) 42%, rgba(37, 99, 235, 0.92) 100%);
  border: 1rpx solid rgba(255, 255, 255, 0.18);
  box-shadow:
    0 26rpx 54rpx rgba(15, 23, 42, 0.20),
    0 0 28rpx rgba(37, 99, 235, 0.08),
    inset 0 1rpx 0 rgba(255, 255, 255, 0.14);
}

.hero-title {
  color: #ffffff;
  font-size: 44rpx;
  font-weight: 800;
  line-height: 1.22;
}

.hero-subtitle {
  margin-top: 12rpx;
  color: rgba(241, 245, 249, 0.90);
  font-size: 25rpx;
  font-weight: 600;
  line-height: 1.58;
}
```

Use the lighter blue-gradient hero from `home.wxss` for portal/home/product
entry pages. Use the dark admin hero for management workbenches.

Authentication, redirect, and other low-information utility pages stay in one
centered column on Pad portrait and landscape. Do not invent a split-screen
composition merely to fill horizontal space. A decorative Hero is always
content-driven: it must not use a large fixed or minimum height, vertically pin
copy to an edge, or consume more space than the primary task below it. At the
900px breakpoint a simple Hero should remain a compact heading surface.

## Cards

Cards should feel like glass surfaces, but content must remain readable:

```css
.card {
  position: relative;
  margin-bottom: 24rpx;
  padding: 28rpx 26rpx;
  border-radius: 30rpx;
  background: linear-gradient(135deg, rgba(255,255,255,0.82) 0%, rgba(248,251,255,0.72) 100%);
  border: 1rpx solid rgba(255,255,255,0.66);
  box-shadow:
    0 18rpx 36rpx rgba(15,23,42,0.06),
    inset 0 1rpx 0 rgba(255,255,255,0.78);
  backdrop-filter: blur(24rpx);
  -webkit-backdrop-filter: blur(24rpx);
  box-sizing: border-box;
}
```

For repeated rows inside cards:

```css
.list-item {
  margin-bottom: 14rpx;
  padding: 22rpx 20rpx;
  border-radius: 22rpx;
  background: linear-gradient(135deg, rgba(255,255,255,0.92), rgba(249,251,255,0.82));
  border: 1rpx solid rgba(226,237,247,0.96);
  box-shadow:
    0 12rpx 24rpx rgba(15,23,42,0.04),
    inset 0 1rpx 0 rgba(255,255,255,0.78);
}
```

## Typography And Device Scale

Use the semantic type ladder from `miniprogram/app.wxss`. Do not create a page-local
font scale or make Pad typography by independently guessing each class:

- `--ui-type-micro` / `caption` / `meta` — counts, timestamps, metadata
- `--ui-type-label` / `control` / `body` — labels, tabs, buttons, body copy
- `--ui-type-emphasis` / `value` — emphasized values and repeated item titles
- `--ui-type-section` / `dialog` / `page` — section, dialog, and page headings

The role order is invariant on every device: metadata < labels/body < emphasized
values < section titles < page titles. Typography uses controlled logical `px`
instead of `rpx`, so a wide phone cannot mechanically magnify every line of text.
Use four ordered bands: compact phone below 390px, standard phone from 390px to
519px, Pad from 520px, and large landscape Pad from 900px. Every Pad role must be
larger than the corresponding phone role, while every role within a band keeps the
same semantic rank. Screen rotation may change layout but must not reverse that
rank.

Dialogs use a separate compact semantic scale because their content is concentrated
inside a smaller surface. On phones, dialog titles and body copy sit about one role
below page card titles and body copy. Pad values increase in logical `px`, but remain
compact relative to the surrounding page. Apply `--ui-dialog-title-size`,
`--ui-dialog-body-size`, `--ui-dialog-meta-size`, `--ui-dialog-label-size`, and
`--ui-dialog-control-size` to both `ui-overlay` and the login page's
`ui-sheet-overlay`, including content rendered through `viewport-portal`. Never
reuse a hero or page-title size inside a dialog, and never let a page business-title
selector raise text after it enters `.ui-dialog-shell`.

All user-visible text and font-based glyphs must use these semantic tokens. A
page-local raw `font-size` in `rpx` is not responsive on Pad merely because
`app.wxss` contains a media query; it continues to grow with the viewport and can
reverse the hierarchy. Raw `rpx`/`px` font sizes are therefore forbidden in page
and shared WXSS. `scripts/ui-audit.js --strict` must report both
`rawFontSizes=0` and `oversizedDecorativeHero=0`.

Ordinary cards, panels, sections, and wrappers are content-driven as well. Do not
give them large fixed/minimum heights or use oversized one-sided padding to create
visual balance. Reserve viewport-sized geometry for explicitly specialized
surfaces such as timetables, signature canvases, and bidirectional data grids.
The strict audit must also keep `forcedContentViewport=0` and
`oversizedContentPadding=0`.

Wrapped headings use about `1.4–1.5` line height; body, descriptions, organization
names, and detail values use about `1.55–1.7`. A visually single-line label still
needs a readable line height because device width or accessibility text can make it
wrap.

Compact summary pairs such as name/identity use a two-column
`repeat(2, minmax(0, 1fr))` grid. Keep the cards on the same row across comparable
phone widths; allow text to wrap inside its own card instead of forcing the entire
card to a new row. Full-width rows explicitly span both columns.

Personnel list cards represent the person, not one arbitrarily selected position.
Keep them compact: show name, student number, binding/audit status, and an optional
position count only. Never place department, identity, work assignment, or a
"primary position" on the summary card. Show position details only in the person
editor, where every position owns its own department, identity, and
`工作分工（职能组）`; omit an unset work-assignment row instead of rendering a
placeholder. Long person editors must use a content-driven shell with a capped,
independently scrollable body. Adding or editing a position should scroll that
editor into view, and supplemental profile fields must remain reachable below it.

## Titles And Panel Heads

Use a compact panel header. Put action buttons in the header when there is one
primary action, such as "新增".

```xml
<view class="panel-head">
  <view class="panel-title-group">
    <view class="section-title">场地列表</view>
    <view class="panel-note">配置规则、查看排期、维护场地资料</view>
  </view>
  <button class="primary-btn panel-add-btn">新增</button>
</view>
```

```css
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  margin-bottom: 20rpx;
}

.section-title {
  position: relative;
  margin: 0;
  padding-left: 20rpx;
  color: #0f172a;
  font-size: 30rpx;
  font-weight: 800;
  line-height: 1.4;
}

.section-title::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 7rpx;
  height: 28rpx;
  border-radius: 999rpx;
  background: linear-gradient(180deg, #2563eb 0%, #60a5fa 100%);
}

.panel-note {
  margin-top: 6rpx;
  color: #64748b;
  font-size: 23rpx;
  line-height: 1.55;
}
```

## Admin Tabs

For management pages, use a glass segmented control. Do not use ordinary user
tabs or large separated pills.

```css
.tabs {
  display: flex;
  gap: 10rpx;
  margin: 0 0 20rpx;
  padding: 8rpx;
  border-radius: 26rpx;
  background: linear-gradient(135deg, rgba(255,255,255,0.72), rgba(248,251,255,0.56));
  border: 1rpx solid rgba(255,255,255,0.62);
  box-shadow:
    0 14rpx 28rpx rgba(15,23,42,0.045),
    inset 0 1rpx 0 rgba(255,255,255,0.78);
}

.tab {
  flex: 1;
  min-height: var(--ui-tab-min-height);
  padding: var(--ui-tab-padding-y) var(--ui-tab-padding-x);
  border-radius: var(--ui-tab-radius);
  color: #49627f;
  font-size: var(--ui-tab-font-size);
  font-weight: 700;
  line-height: var(--ui-leading-control);
  text-align: center;
}

.tab-active {
  color: #ffffff;
  background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 58%, #3b82f6 100%);
  box-shadow: 0 16rpx 30rpx rgba(29,78,216,0.22);
}
```

## Controls

### Text buttons must never become fat capsules

Native text/action buttons must be compact rounded rectangles, never capsules or circles.

- Use `border-radius: 16rpx` to `24rpx` on phones and `10px` to `14px` on Pad. The rendered radius must remain visibly below half of the button height.
- Never use `999rpx`, `999px`, or `50%` on a native `<button>` or full-size text action such as `.primary-btn`, `.secondary-btn`, `.danger-btn`, `.approve-btn`, or `.dialog-btn`.
- Reserve capsule/circle geometry for status tags, filter chips, compact inline links, avatars, and genuinely icon-only controls.
- Never combine wrapped button text with a fixed `line-height` equal to the button height. Use `height: auto`, a controlled `min-height`, `line-height: 1.3` to `1.4`, and balanced vertical padding.
- A full-size text button must not declare an absolute `line-height` close to its `min-height`; inherited vertical padding will stack on top and create an abnormally tall control. `scripts/ui-audit.js --strict` must reject this pattern.
- On narrow phones, show at most two text buttons per row. Long labels should use a two-column or full-width layout, never three cramped columns that force vertical word wrapping.
- Pad controls must become denser rather than scaling up with the viewport: full text buttons use about `44px` minimum height, compact actions about `32px`, and tabs about `40px`, all with balanced vertical padding. Do not retain a 48px-plus desktop-style control merely because more space is available.
- Management navigation keeps the same top segmented-control language on phone, Pad portrait, and Pad landscape. Do not turn the same tabs into a wide left sidebar on landscape; it changes the product language and wastes horizontal space between navigation text and content.
- Status labels such as “使用中” use a small rounded rectangle (`7px` to `9px` radius on Pad) with `3px` to `4px` vertical padding. They must not become inflated oval bubbles.

Baseline:

```css
.button-row > button {
  flex: 1 1 calc(50% - 7rpx);
  min-width: calc(50% - 7rpx);
  max-width: 100%;
  min-height: 76rpx;
  height: auto;
  padding: 14rpx 20rpx;
  border-radius: 20rpx;
  line-height: 1.35;
  white-space: normal;
  overflow-wrap: anywhere;
}
```

Primary button:
```css
.primary-btn {
  color: #ffffff;
  background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 58%, #3b82f6 100%);
  box-shadow:
    0 16rpx 32rpx rgba(29,78,216,0.20),
    inset 0 1rpx 0 rgba(255,255,255,0.20);
}
```

Secondary button:
```css
.secondary-btn {
  color: #1e40af;
  background: linear-gradient(135deg, rgba(255,255,255,0.96), rgba(246,249,255,0.88));
  border: 1rpx solid rgba(147,197,253,0.88);
  box-shadow:
    0 12rpx 24rpx rgba(29,78,216,0.09),
    inset 0 1rpx 0 rgba(255,255,255,0.84);
}
```

Danger button:
```css
.danger-btn {
  color: #ffffff;
  background: linear-gradient(135deg, #ef4444 0%, #f87171 100%);
  box-shadow:
    0 16rpx 30rpx rgba(239,68,68,0.16),
    inset 0 1rpx 0 rgba(255,255,255,0.18);
}
```

Do not make small inline actions full-size buttons. Use compact pill links:

```css
.link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42rpx;
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  color: #1d4ed8;
  font-size: 22rpx;
  font-weight: 800;
  background: rgba(219,234,254,0.76);
  border: 1rpx solid rgba(147,197,253,0.64);
}
```

## Forms And Filters

Inputs should be readable, not oversized:

```css
.field-input,
.field-textarea,
.picker-display,
.picker-value {
  min-height: 78rpx;
  padding: 18rpx 20rpx;
  border-radius: 20rpx;
  color: #10233d;
  font-size: 25rpx;
  line-height: 1.55;
  background: linear-gradient(135deg, rgba(255,255,255,0.96), rgba(246,249,255,0.88));
  border: 1rpx solid rgba(219,229,241,0.96);
  box-shadow:
    0 8rpx 18rpx rgba(15,23,42,0.035),
    inset 0 1rpx 0 rgba(255,255,255,0.84);
}
```

Filter blocks can be inner glass panels, but keep them compact:

```css
.filter-section {
  margin-bottom: 16rpx;
  padding: 16rpx;
  border-radius: 24rpx;
  background: linear-gradient(135deg, rgba(255,255,255,0.78), rgba(248,251,255,0.62));
  border: 1rpx solid rgba(226,237,247,0.82);
  box-shadow: inset 0 1rpx 0 rgba(255,255,255,0.76);
}
```

## Dialogs, Sheets, And Wrapped Text

Wrapper controls must follow the content instead of reserving an arbitrary viewport:

- Every ordinary dialog body uses `ui-dialog-content` as its visible inner glass surface. Specialized timetable or placement workspaces add `ui-dialog-content--workspace`; compact dialogs without a body wrap their message in `ui-dialog-compact-content`.
- Divide content only by real function with `ui-dialog-section`, `ui-dialog-summary`, `ui-dialog-toolbar`, and `ui-dialog-list-panel`. Do not wrap every field, but never flatten the complete dialog body with zero padding, no background, and no border.
- Keep the device-specific breathing room: phone `36rpx / 20rpx / 26rpx`, Pad portrait `26px / 16px / 18px`, and Pad landscape `24px / 14px / 16px` for shell/body/section padding.
- `viewport-portal` renders dialogs under a native `RootPortal` host. Declare dialog tokens directly on `ui-overlay` and `ui-sheet-overlay` as well as `page`; never assume page custom properties will inherit across that boundary. Every critical dialog dimension must also have a safe fallback.
- Give forms and lists a useful working width: phone dialogs use the available width with safe screen insets, Pad portrait uses up to `760px`, Pad landscape up to `1024px`, and specialized wide workspaces up to `1120px`. Do not let a missing token collapse a dialog to its contents.

- A centered dialog has exactly one geometry owner: the overlay uses flexbox with `align-items: center` and `justify-content: center`; the dialog shell stays `position: relative`, participates in that flex layout, and uses `margin-left/right: auto`.
- Never put `position: absolute`, `left/right`, `top: 50%`, or `translateY(-50%)` on a centered dialog shell. Combining fixed side anchors with a Pad `max-width` cap makes the capped shell remain attached to one side instead of remaining centered.
- Bottom sheets are the only normal exception. They may anchor to the bottom, but their Pad rule must explicitly center the bounded width with `left: 50%` and `translateX(-50%)`; do not mix symmetric phone insets with a capped Pad width.
- Centered content dialogs use `height: auto` with a viewport `max-height`. Their vertical `scroll-view` also uses `height: auto` and a controlled `max-height`, so short content does not leave a large blank tail and long content still scrolls.
- Fixed-height dialog viewports are reserved for professional canvases and two-dimensional data surfaces such as timetables, signature placement, or comparable tools. Ordinary details, confirmations, forms, pickers, and lists must not use `height: 56vh`, `78vh`, `80vh`, or `calc(100vh - ...)`.
- The overlay owns safe-area clearance for centered dialogs. Do not add `env(safe-area-inset-bottom)` again to a centered dialog footer. Bottom sheets and fixed bottom keyboards may handle the safe area once at their outermost bottom boundary.
- One visual gap has one owner. Do not stack shell bottom padding, footer padding, and footer margins for the same separation. Keep a visible but restrained `14–20rpx` phone gap (`10–14px` on Pad) between body and actions.
- Wrapped titles, descriptions, organization names, detail values, and button labels need explicit readable line height. Use about `1.4–1.5` for headings and `1.55–1.7` for body/detail text; never let a visually single-line label wrap with `line-height: 1`.
- After changing a wrapper, inspect short content, long content, and two-line text on phone, Pad portrait, and Pad landscape. Script output is a regression gate, not a substitute for rendered visual review.

## Shared Workspace Shell And Space Distribution

Authenticated WHUSU Smart Workspace pages use one shared workspace shell:

- Every navigation title follows `子应用名称 - WHUSU智慧工作台`.
- Use WeChat's native navigation bar and native back control for registered pages. Set the global `navigationStyle` explicitly to `default`; merely deleting a former `custom` value can leave an incremental DevTools session using the stale custom-navigation runtime. Do not replace it with a project-wide custom status-bar/navigation shell; native navigation preserves the platform's device-specific spacing, capsule avoidance, gesture behavior, and expected return affordance.
- Successful authentication opens the portal with `navigateTo`, preserving the login page beneath it so the portal receives WeChat's native back control. Returning from the portal to that login page is a logout action and clears the complete authentication state; explicit logout reuses the existing login page instead of stacking another copy.
- Every portal, business sub-application, and administration page uses the shared workspace hero. It shows the workspace brand, the current sub-application or page name, the person's name, active identity, active organization, and the organization-and-identity switch entry.
- Use the established portal hierarchy inside the shared hero: the person's full name is the primary heading directly on the hero surface; identity and optional department/work-group details sit beneath it; the organization switch remains a compact inner glass row. The current page name is secondary metadata, never the largest heading.
- Do not generate initials, avatar monograms, enlarged first-character decorations, or a separate decorative brand tile in the shared hero. These elements compete with the person's full name and make the page feel like an account directory rather than a workspace.
- Do not recreate a local hero that merely resembles the shared one. A shared shell keeps identity changes, long organization names, phone spacing, and Pad spacing consistent.
- Application-service grids fill their usable row with CSS Grid: three columns on phones, four on Pad portrait, and five on Pad landscape. Do not calculate item widths with percentages minus fixed gaps; rounding can push the last item onto a new row and leave a false empty column.
- A wrapper grows from its content. One visual gap has one owner, so do not combine outer bottom padding, inner last-child margins, and footer spacing for the same separation.
- Buttons, tabs, choice tiles, and grid items use flex centering and symmetric vertical padding. Never stack a fixed height, equal line-height, and vertical padding. Wrapped labels use readable line-height and natural height.
- Primary tabs must not look like compressed text strips: use the shared tab height and padding tokens on every implementation, including local tab components. A blue title accent bar is centered against the complete title line with `top: 50%` and `translateY(-50%)`; fixed top offsets are forbidden because wrapped or device-scaled titles will drift.
- Inspect short and long states on phone, Pad portrait, and Pad landscape, including nested cards, empty states, dialogs, and grid remainders. Strict audit must keep `workspaceShellIssues`, `stackedButtonMetrics`, `forcedDialogViewport`, and `oversizedContentPadding` at zero.

## Composition Checklist

Before finishing:
- Compare against scoring/admin pages, not a generic SaaS template.
- Hero is compact and premium, not huge.
- Top tabs are admin segmented tabs.
- Fonts and tabs use the global semantic tokens; phone/Pad scaling never reverses text hierarchy.
- Comparable phone widths keep name/identity summary cards in the same two-column row.
- Every major content group is a glass card.
- Repeated rows use inner list-item cards with lighter shadows.
- Buttons are sized for work, not marketing.
- Native text buttons are compact rounded rectangles; no `999rpx`/`50%` fat capsules and no three-column wrapping on phones.
- Strict UI audit reports zero `pillButtonRadius` and zero `stackedButtonMetrics` findings.
- Ordinary dialogs grow with content, centered footers do not duplicate safe-area padding, and strict UI audit reports zero `forcedDialogViewport` findings.
- Centered dialogs are positioned only by their overlay, left and right visual gutters remain equal, and strict UI audit reports zero `miscenteredDialogShell` findings.
- Wrapped headings and body text retain deliberate line spacing on phone and Pad.
- Text is not dense: use short titles and one helper line.
- No giant empty summary cards unless the numbers directly drive decisions.
- Red is used only for clear/danger/destructive actions.
- Run at least `node --check` for touched JS and `git diff --check`.
