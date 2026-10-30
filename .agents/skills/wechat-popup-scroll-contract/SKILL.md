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
        class="ui-dialog-body ui-dialog-content ui-dialog-scroll--natural"
        enhanced="{{true}}"
        show-scrollbar="{{true}}"
        bounces="{{true}}"
        nested-scroll-enabled="{{true}}"
        scroll-y>
        <view class="ui-dialog-scroll-content">...</view>
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
- The top reserve must clear the WeChat capsule, which is a native control painted above the whole page. Every page that hosts a centred dialog publishes `--ui-navbar-height` through `page-meta page-style`, and the shared token takes the largest of that value, `env(safe-area-inset-top) + 44px`, and the hard floor `--ui-dialog-capsule-floor` (108px). The floor is not optional: Android/HarmonyOS report a zero safe-area inset, and the page-level value does not always reach the RootPortal layer, so the first two signals alone can leave the dialog top under the capsule.
- Assign blocker `z-index: 0` and shell `z-index: 1`; background controls must remain below the overlay.
- Preserve the same transform for shell `:active`, `:focus`, and `:focus-within` states so tapping does not make it jump.
- Never anchor a dialog to page scroll position, a content column, or a local absolute-positioned parent.

## Assign scrolling ownership

- Overlay and shell never scroll; both clip overflow.
- `ui-dialog-shell--complex` describes a header/body/footer structure, not a full-height window. It must stay content-driven so short and collapsed forms do not leave blank space.
- Give the body a viewport-safe dynamic maximum and let its `scroll-view` take over only after the content overflows. Expanding or collapsing conditional fields must therefore grow or shrink the centred shell naturally.
- 普通 `--complex` 与 `--grid` 的外壳和正文均使用 `height:auto`，正文上限由共享的可用高度与留白令牌推导。Grid 只分配标题、正文、底栏三段，不要求全高；不要把旧实现的滚动失败泛化为“auto 必定不能滚动”。页面或组件不得另写第二套 `calc(100vh - …)`。
- 普通正文使用 `scroll-view.ui-dialog-body.ui-dialog-scroll--natural`，宿主上下 padding 为 0；全部正文必须位于唯一直接 `.ui-dialog-scroll-content` 内，由该内层的上下 padding 使用 `--ui-dialog-body-padding`。末字段和尾部留白必须属于实际滚动内容，不能在宿主或末字段重复占位。
- 禁止先写 `height:0` 等待异步测量恢复。首帧、未测量、节点查询缺失或失败时都必须保留正常可见内容；测量只能辅助定位，不能成为显示表单的前提。
- 只有显式专业工作区 `--viewport` / `--wide` 使用 `height: var(--ui-dialog-available)`，其正文尺寸独立维护；不要机械套用普通自然正文或压缩专业工作区。
- Only data workspaces that genuinely require a stable full-screen working area may add `ui-dialog-shell--viewport`; wide timetables continue to use `ui-dialog-shell--wide`. Never add a viewport height merely because a dialog is a long form.
- 普通原生滚动正文禁止通过Flex收缩：已实测内部viewport与外部正文错配，末按钮滚不到。严格标题/正文/底栏三段用共享 `--grid`；标题/正文两段用 `--grid-body`；正文/底栏两段用 `--grid-actions`，complex和compact均适用。第四段按业务归入实际标题区等语义段，不插空控件凑行数。标题和底栏不滚动，直接正文是唯一外层滚动区；wide/viewport专业工作区独立保留。
- 验收必须真正滚到底，比较最后字段或按钮完整矩形与原生可见正文边界，并实际操作底栏；嵌套列表另查内层末项、手势归属及底栏。仅量外框或浏览器测试不够，手机尺寸模拟器也不等于实体手机、Pad竖屏、Pad横屏均通过。保留自然height:auto及动态max-height，禁止置零等待测量或固定普通正文高度。
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
9. 检查短内容无固定空白，展开条件后自然增高、收起后恢复；比较宿主外框与原生内部滚动视口，实际滚出最后字段及其底部留白，再点击底栏。浏览器解释 WXSS 只能验证 CSS 几何，不能代替微信原生视口和现场手势；未覆盖的手机、Pad 竖屏或横屏明确记录为未完成现场验证。

历史观察：2026-09-30 的旧版人事导出窗口曾在 1024×700 Pad 横屏出现非 Grid 正文外框 480px、内容 2869px、拖动位移 0，改为 Grid 后记录位移 -245。保留该观察供排查旧问题，但不能据此要求所有 Grid 全高，不能断言所有自然高度都无法滚动，也不能将旧窗口的通过记录用于证明新样式或其他设备已通过。

## Inputs and keyboard inside dialogs

- Every `input`/`textarea` inside a dialog shell must carry `adjust-position="{{false}}"` and `cursor-spacing`. With the default `adjust-position`, WeChat scrolls the page while a `position: fixed` shell stays put, which is what produced the "dialog misaligned with keyboard / bottom buttons unreachable" reports.
- `viewport-portal` must publish `--kb-height` on its own `view.ui-portal-surface` inside `root-portal`. Page-level `page-meta` variables do not reliably cross the native RootPortal boundary: writing `dialogKeyboardHeight` on the page alone does not prove the dialog can shrink. Keep the page keyboard behavior for page state and scroll-lock cleanup, but do not use it as a substitute for the Portal-layer variable.
- The shared component listens directly to `wx.onKeyboardHeightChange`. Attach/show binds once; hide unregisters only its own listener and resets the height; detach unregisters without writing rendering data. A late callback from a previous binding must be ignored, including after the component is shown again. Multiple visible Portals must not remove one another's listeners. Do not inspect a parent Page's private data or overwrite navigation and body geometry.
- Verify the actual Portal-layer variable, native scrolling viewport, last field and footer together. A 240px injected keyboard-height event can test layout propagation, but cannot be reported as a real phone keyboard test. Real input focus, native keyboard show/hide and rotation still require device verification.
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
