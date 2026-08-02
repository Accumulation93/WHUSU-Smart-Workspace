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
- Keep the shell fixed at `top: 50vh; left: 50vw; transform: translate(-50%, -50%)`.
- Assign blocker `z-index: 0` and shell `z-index: 1`; background controls must remain below the overlay.
- Preserve the same transform for shell `:active`, `:focus`, and `:focus-within` states so tapping does not make it jump.
- Never anchor a dialog to page scroll position, a content column, or a local absolute-positioned parent.

## Assign scrolling ownership

- Overlay and shell never scroll; both clip overflow.
- `ui-dialog-shell--complex` describes a header/body/footer structure, not a full-height window. It must stay content-driven so short and collapsed forms do not leave blank space.
- Give the body an explicit maximum available height and let its `scroll-view` take over only after the content overflows. Expanding or collapsing conditional fields must therefore grow or shrink the centred shell naturally.
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

Run at minimum:

```powershell
node scripts/ui-audit.js --strict
node scripts/miniprogram-compat-audit.js
git diff --check
```

Do not treat audit output as visual proof. Compile the project and complete the DevTools gesture checks before delivery.
