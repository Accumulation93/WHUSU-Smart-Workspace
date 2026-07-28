---
name: blue-glass-ui
description: >
  Design or refactor UI for the WHUSU Smart Workspace mini program in the mature scoring/admin
  "blue luxury glass" style. Use this whenever the user asks for 蓝色玻璃风,
  轻奢玻璃风, 和WHUSU智慧工作台/人事信息/管理端风格一致, or asks to beautify pages in
  this project.
---

# Blue Glass UI for WHUSU Smart Workspace Mini Program

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
values < section titles < page titles. At the 520px Pad breakpoint every token is
the phone ladder multiplied by the same factor and converted to controlled `px`;
screen rotation may change layout, but must not change semantic rank. Never let a
content value become larger than its containing section title on Pad when it is
smaller on phone.

Wrapped headings use about `1.4–1.5` line height; body, descriptions, organization
names, and detail values use about `1.55–1.7`. A visually single-line label still
needs a readable line height because device width or accessibility text can make it
wrap.

Compact summary pairs such as name/identity use a two-column
`repeat(2, minmax(0, 1fr))` grid. Keep the cards on the same row across comparable
phone widths; allow text to wrap inside its own card instead of forcing the entire
card to a new row. Full-width rows explicitly span both columns.

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

- A centered dialog has exactly one geometry owner: the overlay uses flexbox with `align-items: center` and `justify-content: center`; the dialog shell stays `position: relative`, participates in that flex layout, and uses `margin-left/right: auto`.
- Never put `position: absolute`, `left/right`, `top: 50%`, or `translateY(-50%)` on a centered dialog shell. Combining fixed side anchors with a Pad `max-width` cap makes the capped shell remain attached to one side instead of remaining centered.
- Bottom sheets are the only normal exception. They may anchor to the bottom, but their Pad rule must explicitly center the bounded width with `left: 50%` and `translateX(-50%)`; do not mix symmetric phone insets with a capped Pad width.
- Centered content dialogs use `height: auto` with a viewport `max-height`. Their vertical `scroll-view` also uses `height: auto` and a controlled `max-height`, so short content does not leave a large blank tail and long content still scrolls.
- Fixed-height dialog viewports are reserved for professional canvases and two-dimensional data surfaces such as timetables, signature placement, or comparable tools. Ordinary details, confirmations, forms, pickers, and lists must not use `height: 56vh`, `78vh`, `80vh`, or `calc(100vh - ...)`.
- The overlay owns safe-area clearance for centered dialogs. Do not add `env(safe-area-inset-bottom)` again to a centered dialog footer. Bottom sheets and fixed bottom keyboards may handle the safe area once at their outermost bottom boundary.
- One visual gap has one owner. Do not stack shell bottom padding, footer padding, and footer margins for the same separation. Keep a visible but restrained `14–20rpx` phone gap (`10–14px` on Pad) between body and actions.
- Wrapped titles, descriptions, organization names, detail values, and button labels need explicit readable line height. Use about `1.4–1.5` for headings and `1.55–1.7` for body/detail text; never let a visually single-line label wrap with `line-height: 1`.
- After changing a wrapper, inspect short content, long content, and two-line text on phone, Pad portrait, and Pad landscape. Script output is a regression gate, not a substitute for rendered visual review.

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
