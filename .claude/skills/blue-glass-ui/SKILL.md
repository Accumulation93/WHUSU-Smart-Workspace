---
name: blue-glass-ui
description: >
  Design UI for the REDSU scoring mini program using the "Blue Luxury Glass" design system.
  Use this skill whenever the user asks to design, redesign, or style any page, component, card,
  button, or layout in this project. Also use it when the user asks for "轻奢玻璃风", "蓝色玻璃风",
  "和现有风格一致", or similar requests. This skill encodes the exact CSS values, color palette,
  spacing, and composition patterns found across portal, home, and admin pages.
---

# Blue Luxury Glass — REDSU 考核评分 Design System

## When to use this skill

Invoke this skill before writing any WXML or WXSS for this project. It ensures every new UI element matches the
existing design language exactly — no invented styles, no approximate values.

Call it with: `/blue-glass-ui` or describe the task and mention "blue glass" / "轻奢玻璃风".

---

## 1. Color Palette

### Primary Blues
| Role | Value | Usage |
|---|---|---|
| Deep blue | `#1d4ed8` / `#2563eb` | Active tabs, primary buttons, chip text |
| Mid blue | `#3b82f6` | Gradients, borders, focus rings |
| Light blue | `#60a5fa` | Gradient ends, section-title glow |
| Pale blue bg | `rgba(219,234,254,0.76)` | Chip backgrounds (blue variant) |
| Pale blue border | `rgba(147,197,253,0.64)` | Chip borders |

### Accent Colors (for chips, badges, tags)
| Color | Background | Text | Border |
|---|---|---|---|
| Green | `rgba(209,250,229,0.78)` | `#15803d` | `rgba(110,231,183,0.58)` |
| Orange/Warm | `rgba(255,237,213,0.78)` | `#c2410c` | `rgba(253,186,116,0.58)` |
| Sky blue | `rgba(224,242,254,0.76)` | `#0369a1` | `rgba(56,189,248,0.56)` |

### Text & Surface
| Role | Value |
|---|---|
| Primary text | `#0f172a` (headings), `#1e293b` (body) |
| Secondary text | `#64748b` |
| Muted text | `#94a3b8` |
| Card bg | `linear-gradient(135deg, rgba(255,255,255,0.80), rgba(248,251,255,0.72))` |
| Page bg | `linear-gradient(135deg, #f8fbff, #f1f6fc, #edf3fa)` + radial orbs |

### Red (danger only)
| Role | Value |
|---|---|
| Danger bg | `linear-gradient(135deg, #ef4444, #f87171)` |
| Danger text | `#ffffff` |
| Danger shadow | `rgba(239,68,68,0.16)` |

---

## 2. Page Background

**Always use this exact pattern for full-page backgrounds:**

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

/* Decorative orbs */
.page::before {
  content: "";
  position: fixed;
  top: -120rpx; right: -90rpx;
  width: 320rpx; height: 320rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(96, 165, 250, 0.18) 0%, rgba(96, 165, 250, 0) 72%);
  pointer-events: none;
}

.page::after {
  content: "";
  position: fixed;
  left: -120rpx; bottom: 150rpx;
  width: 280rpx; height: 280rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(147, 197, 253, 0.16) 0%, rgba(147, 197, 253, 0) 72%);
  pointer-events: none;
}
```

**Do NOT use:** solid white backgrounds, dark backgrounds, flat colors without gradient, or any non-blue color for the page base.

---

## 3. Hero Card (Blue Gradient)

**Only for top-of-page identity/hero sections. Not for content cards.**

```css
.hero {
  position: relative;
  overflow: hidden;
  margin-bottom: 28rpx;
  padding: 44rpx 34rpx 40rpx;
  border-radius: 38rpx;
  background:
    linear-gradient(135deg, rgba(37, 99, 235, 0.98) 0%, rgba(59, 130, 246, 0.95) 42%, rgba(96, 165, 250, 0.90) 100%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.10), rgba(255, 255, 255, 0));
  border: 1rpx solid rgba(255, 255, 255, 0.24);
  box-shadow:
    0 24rpx 54rpx rgba(37, 99, 235, 0.22),
    inset 0 1rpx 0 rgba(255, 255, 255, 0.24);
}

/* Decorative circles inside hero */
.hero::before {
  content: "";
  position: absolute;
  top: -90rpx; right: -35rpx;
  width: 240rpx; height: 240rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
}

.hero::after {
  content: "";
  position: absolute;
  left: -90rpx; bottom: -120rpx;
  width: 280rpx; height: 280rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
}
```

**Hero child elements (all `position: relative; z-index: 1`):**

```css
.hero-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 18rpx;
  padding: 10rpx 24rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.14));
  border: 1rpx solid rgba(255,255,255,0.28);
  color: #f8fbff;
  font-size: 22rpx;
  font-weight: 600;
  letter-spacing: 1rpx;
  backdrop-filter: blur(14rpx);
}

.hero-title {
  color: #ffffff;
  font-size: 50rpx;
  font-weight: 700;
  line-height: 1.24;
  letter-spacing: 1rpx;
  text-shadow: 0 6rpx 16rpx rgba(0,0,0,0.08);
}

.hero-subtitle {
  margin-top: 12rpx;
  color: rgba(255,255,255,0.92);
  font-size: 26rpx;
  line-height: 1.72;
}
```

---

## 4. Glass Card (Content Container)

**The primary content container. Use for ALL content sections.**

```css
.card {
  position: relative;
  margin-bottom: 24rpx;
  padding: 28rpx 26rpx;
  border-radius: 30rpx;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.80) 0%, rgba(248, 251, 255, 0.72) 100%);
  border: 1rpx solid rgba(255, 255, 255, 0.62);
  box-shadow:
    0 18rpx 36rpx rgba(15, 23, 42, 0.06),
    inset 0 1rpx 0 rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(24rpx);
  -webkit-backdrop-filter: blur(24rpx);
  box-sizing: border-box;
}
```

**Never** change the border-radius, shadow pattern, or background gradient of `.card` — it is the unifying element across all pages.

---

## 5. Section Title (with Blue Accent Bar)

**Use for all section headings inside cards.**

```css
.section-title {
  position: relative;
  padding-left: 20rpx;
  color: #0f172a;
  font-size: 30rpx;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: 0.2rpx;
}

.section-title::before {
  content: "";
  position: absolute;
  left: 0; top: 8rpx;
  width: 8rpx; height: 28rpx;
  border-radius: 999rpx;
  background: linear-gradient(180deg, #2563eb 0%, #60a5fa 100%);
  box-shadow: 0 0 14rpx rgba(59, 130, 246, 0.24);
}
```

WXML pattern:
```xml
<view class="info-head">
  <view class="section-title">标题文字</view>
</view>
```

---

## 6. Info Grid / Info Blocks

**For displaying labeled data fields inside cards (e.g., profile info, scorer info).**

```css
.info-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 20rpx;
}

/* 50% width blocks (side by side) */
.info-block {
  width: calc(50% - 10rpx);
  padding: 24rpx 22rpx;
  border-radius: 24rpx;
  background: linear-gradient(135deg, rgba(255,255,255,0.92), rgba(248,251,255,0.80));
  border: 1rpx solid rgba(255,255,255,0.68);
  box-shadow:
    0 10rpx 24rpx rgba(15,23,42,0.035),
    inset 0 1rpx 0 rgba(255,255,255,0.78);
  box-sizing: border-box;
}

/* Full-width blocks (for longer content like department) */
.info-block-full {
  width: 100%;
  background: linear-gradient(135deg, rgba(239,246,255,0.6), rgba(219,234,254,0.4));
  border: 1rpx solid rgba(191,219,254,0.6);
}

.info-label {
  margin-bottom: 10rpx;
  color: #64748b;
  font-size: 23rpx;
  line-height: 1.5;
}

.info-value {
  color: #0f172a;
  font-size: 28rpx;
  font-weight: 700;
  line-height: 1.5;
  word-break: break-all;
}
```

WXML pattern:
```xml
<view class="info-grid">
  <view class="info-block">
    <view class="info-label">标签</view>
    <view class="info-value">值</view>
  </view>
  <view class="info-block info-block-full" wx:if="{{...}}">
    <view class="info-label">标签</view>
    <view class="info-value">值</view>
  </view>
</view>
```

---

## 7. Buttons (Three Variants)

```css
/* Shared base for all action buttons */
.actions button {
  position: relative;
  overflow: hidden;
  height: 94rpx;
  line-height: 94rpx;
  margin-bottom: 20rpx;
  border: none;
  border-radius: 24rpx;
  font-size: 28rpx;
  font-weight: 700;
  letter-spacing: 0.5rpx;
  box-shadow:
    0 16rpx 30rpx rgba(15,23,42,0.06),
    inset 0 1rpx 0 rgba(255,255,255,0.24);
}

.actions button::after { border: none; }

/* Primary — Blue gradient, white text */
.primary-btn {
  background: linear-gradient(135deg, #2563eb 0%, #3b82f6 45%, #60a5fa 100%);
  color: #ffffff;
  box-shadow:
    0 20rpx 34rpx rgba(37,99,235,0.20),
    inset 0 1rpx 0 rgba(255,255,255,0.24);
}

/* Secondary — White glass, dark text */
.secondary-btn {
  background: linear-gradient(135deg, rgba(255,255,255,0.96), rgba(246,249,255,0.88));
  color: #1e293b;
  border: 1rpx solid rgba(219,229,241,0.96);
  box-shadow:
    0 10rpx 22rpx rgba(15,23,42,0.05),
    inset 0 1rpx 0 rgba(255,255,255,0.84);
}

/* Danger — Red gradient, white text */
.danger-btn {
  background: linear-gradient(135deg, #ef4444 0%, #f87171 100%);
  color: #ffffff;
  box-shadow:
    0 16rpx 30rpx rgba(239,68,68,0.16),
    inset 0 1rpx 0 rgba(255,255,255,0.18);
}
```

**Rules:**
- Primary = blue gradient + white text. Use for main CTAs.
- Secondary = white glass + dark text. Use for back/cancel/secondary actions.
- Danger = red gradient + white text. Use ONLY for destructive actions (unbind, delete).
- Never invent new button colors. Never use flat colors without gradient.

---

## 8. Preview Chips & Colorful Badges

**For inline tags, score chips, status badges:**

```css
.preview-chip, .merit-chip, .merit-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36-38rpx;
  padding: 5-6rpx 14rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
  font-weight: 700;
  line-height: 1.35;
  border: 1rpx solid transparent;
}
```

**Approved chip color variants (use these exact values):**
| Variant | Background | Text | Border |
|---|---|---|---|
| Blue | `rgba(219,234,254,0.76)` | `#1d4ed8` | `rgba(147,197,253,0.64)` |
| Green | `rgba(209,250,229,0.78)` | `#15803d` | `rgba(110,231,183,0.58)` |
| Orange | `rgba(255,237,213,0.78)` | `#c2410c` | `rgba(253,186,116,0.58)` |
| Sky | `rgba(224,242,254,0.76)` | `#0369a1` | `rgba(56,189,248,0.56)` |

**Never use:** purple, pink, red (for chips), yellow, or any color not listed above.

---

## 9. List Items (Inside Cards)

**For rows within a card (e.g., navigation rows, item lists):**

```css
.list-item, .nav-row {
  margin-bottom: 14rpx;       /* gap between rows */
  padding: 20rpx 18rpx;
  border-radius: 22rpx;
  background: linear-gradient(135deg, rgba(255,255,255,0.92), rgba(249,251,255,0.82));
  border: 1rpx solid rgba(226,237,247,0.96);
  box-shadow:
    0 12rpx 24rpx rgba(15,23,42,0.04),
    inset 0 1rpx 0 rgba(255,255,255,0.78);
  transition: transform 0.18s ease, box-shadow 0.24s ease;
}

.list-item:last-child { margin-bottom: 0; }
```

**Press/active state:**
```css
.list-item:active, .nav-row:active {
  transform: translateY(1rpx) scale(0.992);
}
```

---

## 10. Animations

**Use ONLY this keyframe. Do not create custom animations.**

```css
@keyframes glassFadeUp {
  from { opacity: 0; transform: translateY(18rpx); }
  to   { opacity: 1; transform: translateY(0); }
}
```

**Apply to cards/list items with staggered delay:**
```xml
style="animation: glassFadeUp 0.42s {{0.06 * index}}s ease both;"
```

---

## 11. Dialog / Popup

```css
.dialog-layer { position: fixed; inset: 0; z-index: 99; }

.dialog-mask {
  position: absolute; inset: 0;
  background: rgba(15,23,42,0.34);
  backdrop-filter: blur(6rpx);
}

.dialog-panel {
  position: absolute;
  left: 56rpx; right: 56rpx; top: 50%;
  transform: translateY(-50%);
  padding: 28rpx 26rpx 24rpx;
  border-radius: 28rpx;
  background: linear-gradient(135deg, rgba(255,255,255,0.95), rgba(248,251,255,0.9));
  border: 1rpx solid rgba(255,255,255,0.82);
  box-shadow: 0 22rpx 44rpx rgba(15,23,42,0.14);
}

.dialog-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10rpx 20rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, rgba(219,234,254,0.94), rgba(191,219,254,0.86));
  color: #2563eb;
  font-size: 22rpx;
  font-weight: 700;
}

.dialog-title  { margin-top: 18rpx; color: #0f172a; font-size: 32rpx; font-weight: 700; }
.dialog-desc   { margin-top: 12rpx; color: #64748b; font-size: 24rpx; line-height: 1.72; }
.dialog-actions { display: flex; gap: 14rpx; margin-top: 24rpx; }
.dialog-btn {
  flex: 1; height: 82rpx; line-height: 82rpx;
  margin-bottom: 0; border-radius: 18rpx; font-size: 26rpx;
}
```

---

## 12. Tab Bar (Admin-style)

```css
.tab {
  color: #49627f;
  /* base tab: muted blue-gray text, no background */
}

.tab-active {
  color: #ffffff;
  background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 58%, #3b82f6 100%);
  box-shadow: 0 16rpx 30rpx rgba(29,78,216,0.22);
  /* active tab: blue gradient fill, white text, blue glow */
}
```

---

## 13. Composition Rules

1. **Page structure (top to bottom):**
   - Hero (blue gradient card with badge + title + subtitle)
   - Content cards (`.card` with `.section-title` + content)
   - Actions (`.actions` with `.secondary-btn` and `.danger-btn`)
   - Footer (centered, muted text)

2. **Card hierarchy:**
   - `.card` is the outermost container
   - Inside: `.info-head` > `.section-title` (heading)
   - Below heading: `.info-grid` > `.info-block` (for key-value data) OR `.nav-list` > `.nav-row` (for navigation items)

3. **Spacing:**
   - Card margin-bottom: `24rpx`
   - Card padding: `28rpx 26rpx`
   - Gap between info-blocks: `20rpx`
   - Gap between list rows: `14rpx`
   - Page horizontal padding: `24-32rpx`

4. **Border radius hierarchy:**
   - Hero: `38rpx`
   - Cards: `30rpx`
   - Info blocks: `24rpx`
   - List rows: `22rpx`
   - Buttons: `24rpx`
   - Chips: `999rpx` (full round)

5. **Font weight hierarchy:**
   - Hero title: `700`
   - Section titles: `700`
   - Card headings: `700`
   - Info values: `700`
   - Button text: `700`
   - Labels: `400-500`
   - Descriptions: `400-500`

6. **Glass effect** — Every container uses:
   - `linear-gradient` with `rgba(255,255,255,0.80-0.96)` range
   - `border: 1rpx solid rgba(255,255,255,0.62-0.96)`
   - `box-shadow` with BOTH outer shadow AND `inset 0 1rpx 0 rgba(255,255,255,0.78)` (top inner highlight)
   - `backdrop-filter: blur(24rpx)` (on cards, not on inner blocks)

---

## Checklist — Before writing any WXSS

- [ ] Page background: `#f8fbff → #f1f6fc → #edf3fa` gradient + radial orbs
- [ ] Cards: exact `.card` style from section 4
- [ ] Section titles: blue accent bar `::before` pseudo-element
- [ ] Buttons: primary/secondary/danger only, no custom colors
- [ ] Chips: only the 4 approved color variants
- [ ] Animation: only `glassFadeUp`
- [ ] No purple, pink, flat white, flat black, or dark backgrounds
- [ ] All containers have `inset 0 1rpx 0 rgba(255,255,255,...)` top highlight
- [ ] All containers use `linear-gradient` backgrounds, never solid colors
