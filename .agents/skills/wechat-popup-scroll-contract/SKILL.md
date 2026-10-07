---
name: wechat-popup-scroll-contract
description: Audit and repair WeChat Mini Program popup positioning, internal and nested scrolling, touch isolation, or background scroll-through. Use for any WXML/WXSS modal, dialog, sheet, picker, overlay, or long-form popup that moves with the page, cannot scroll internally, scrolls the page behind it, misroutes nested gestures, or fails to cover the physical viewport.
---

# WeChat Popup Scroll Contract

Apply one ownership rule: the overlay owns the physical viewport, the blocker owns background touch interception, the shell owns positioning, and explicit `scroll-view` elements own scrolling.

## Inspect before editing

1. Read `AGENTS.md`, `.claude/rules/miniprogram.md`, and the module-specific rule file.
2. Inspect the affected WXML hierarchy and every matching WXSS rule, including late global overrides in `miniprogram/app.wxss`.
3. Reproduce the issue in WeChat DevTools. Test a drag inside the body, inside a nested pane, on the header/footer, and outside the dialog.
4. Compare against the shared selectors and `scripts/ui-audit.js`; do not create another page-local popup system.

## Build the required hierarchy

Use this structure for ordinary dialogs:

```xml
<root-portal wx:if="{{visible}}">
  <view class="popup-mask ui-overlay">
    <view class="ui-overlay-blocker" catchtouchmove="noop"></view>
    <view class="popup-card ui-dialog-shell ui-dialog-shell--complex" catchtap="noop">
      <view class="ui-dialog-header">...</view>
      <scroll-view
        class="ui-dialog-body ui-dialog-scroll--fill"
        enhanced="{{true}}"
        show-scrollbar="{{true}}"
        bounces="{{true}}"
        nested-scroll-enabled="{{true}}"
        scroll-y>
        ...
      </scroll-view>
      <view class="ui-dialog-footer">...</view>
    </view>
  </view>
</root-portal>
```

Keep the blocker and shell as siblings, with the blocker first. Put `catchtouchmove="noop"` only on the blocker. Never put it on an ordinary overlay, shell, body, or ancestor of a scrollable region.

## Enforce viewport positioning

- Render every overlay through `root-portal`, outside page `scroll-view` and transformed layout containers.
- Keep `.ui-overlay` and `.ui-overlay-blocker` fixed at `top/right/bottom/left: 0` with `100vw × 100vh`.
- Follow the single geometry owner in `miniprogram/app.wxss`: keep the shell fixed and centred in the *available* area with `left: 50vw; transform: translate(-50%, -50%)` and `top: calc(50vh + (var(--ui-dialog-top-reserve) - var(--ui-dialog-bottom-reserve)) / 2)`, `max-height: var(--ui-dialog-available)`. Never fall back to a bare `top: 50vh` (a long dialog then reaches up under the WeChat capsule and its close button stops responding), and never stretch a variant with `top` + `bottom`. Do not replace the shared rule with a page-local flex-centering or relative shell. `--wide` and bottom sheets are explicit variants.
- The top reserve covers the custom navbar: every page that hosts a centred dialog publishes `--ui-navbar-height` through `page-meta page-style`, and the shared token takes the larger of that value and `env(safe-area-inset-top) + 44px`, because Android/HarmonyOS report a zero safe-area inset while still having a tall status bar.
- Assign blocker `z-index: 0` and shell `z-index: 1`; background controls must remain below the overlay.
- Preserve the same transform for shell `:active`, `:focus`, and `:focus-within` states so tapping does not make it jump.
- Never anchor a dialog to page scroll position, a content column, or a local absolute-positioned parent.

## Assign scrolling ownership

- Overlay and shell never scroll; both clip overflow.
- `ui-dialog-shell--complex` describes a header/body/footer structure, not a full-height window. It must stay content-driven so short and collapsed forms do not leave blank space.
- Give the body a viewport-safe dynamic maximum and let its `scroll-view` take over only after the content overflows. Expanding or collapsing conditional fields must therefore grow or shrink the centred shell naturally.
- A direct `scroll-view.ui-dialog-body` still needs a *definite* height or WeChat never builds an internal scroll amount (the dialog looks stuck however far you drag). The shared rule derives it from the same reserves — `calc(var(--ui-dialog-available) - var(--ui-dialog-body-reserve))` with `flex: 1 1 auto` — so the body grows or shrinks to exactly fill the shell. Never reintroduce a second `calc(100vh - …)` in a page, a component or a variant.
- `.ui-dialog-shell--grid` / `--viewport` / `--wide` take `height: var(--ui-dialog-available)`; every other variant stays content-driven.
- Only data workspaces that genuinely require a stable full-screen working area may add `ui-dialog-shell--viewport`; wide timetables continue to use `ui-dialog-shell--wide`. Never add a viewport height merely because a dialog is a long form.
- Header and footer are non-scrolling flex items. The direct body is the only outer scrolling region.
- Every vertical dialog `scroll-view` enables `enhanced`, `scroll-y`, and `nested-scroll-enabled`.
- Give nested lists `ui-dialog-scroll--pane` and `nested-scroll-enabled`; a gesture beginning inside that pane scrolls the pane first. The body handles gestures only outside the pane or after the pane reaches its boundary.
- Use `touch-action: pan-y` for vertical regions, `pan-x` for horizontal regions, and both axes only for specialized grids.
- Reserve `ui-dialog-touch-lock` and local `catchtouchmove` for signature canvases, drag handles, and similar gestures that must not scroll.

## Verify the complete contract

In phone portrait, Pad portrait, and Pad landscape:

1. Scroll the page, open the dialog, and confirm the mask still covers the physical screen and the shell is centered.
2. Scroll long body content from multiple points; header, footer, mask, and shell must not move.
3. Scroll each nested pane; the pane moves before the outer body.
4. Drag on header, footer, dialog edge, and mask; the background page must remain fixed.
5. Close and reopen after changing page scroll position; dialog geometry must be identical.
6. Check compact, complex, wide, nested-list, and signature/canvas variants.
7. Focus an input inside the dialog, open the keyboard, and confirm the page itself does not shift, the shell stays above the keyboard (it shrinks via `--kb-height`), and the focused field plus the footer buttons remain reachable.
8. Close the dialog and scroll the page immediately; the whole page must be scrollable again (no leaked `overflow: hidden`).

## Inputs and keyboard inside dialogs

- Every `input`/`textarea` inside a dialog shell must carry `adjust-position="{{false}}"` and `cursor-spacing`. With the default `adjust-position`, WeChat scrolls the page while a `position: fixed` shell stays put, which is what produced the "dialog misaligned with keyboard / bottom buttons unreachable" reports.
- The page must publish the keyboard height so the shell can shrink: keep `dialogKeyboardHeight` in page data (see `miniprogram/utils/dialogKeyboard.js`), append `' --kb-height: ' + dialogKeyboardHeight + 'px;'` to the page's `page-meta page-style`, and let the global rule in `app.wxss` shrink and lift the shell. The dialog body's own scroll carries any remaining occlusion.
- Every dialog flag used by `page-meta page-style` must have a written reset path, and pages with dialog inputs must declare `dialogLockKeys` so `releaseDialogScrollLock()` can clear them on unload.

Run at minimum when the user has not explicitly requested a script-free manual audit:

```powershell
node scripts/ui-audit.js --strict
node scripts/miniprogram-compat-audit.js
node scripts/dialog-scroll-contract-audit.js
node scripts/dialog-keyboard-audit.js
git diff --check
```

Do not treat audit output as visual proof. Compile the project and complete the DevTools gesture checks before delivery.

If the user explicitly asks for a natural-language/manual audit or says not to use scripts, read the affected documents and code line by line and perform only targeted runtime checks. Do not claim that a scanner replaces that review; run the commands later only if the user permits regression gates.
