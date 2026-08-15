---
name: wechat-miniprogram-drag-sort
description: WeChat mini program drag-and-drop list reordering with auto-scroll, ghost card, and scroll conflict handling. Use when building long-press drag-to-reorder for scroll-view card lists.
---

# WeChat Mini Program Drag-and-Drop List Reordering

Complete production-tested pattern for long-press drag-to-reorder in a scroll-view. Covers WXML structure, JS event handlers, WXSS styling, auto-scroll with middle dead zone, ghost card following finger, and the critical scroll conflict resolution.

## When to Use

- Dragging list items vertically to reorder inside a `scroll-view`
- Long list where items exceed visible area (needs auto-scroll during drag)
- Fixed-position ghost card that follows the finger
- Blue insertion line indicator showing drop position

## WXML Structure

Three key elements: **ghost card** (outside scroll-view, `position: fixed`), **scroll-view** with always-on `scroll-y`, **catchtouchmove wrapper** that blocks natural scrolling during drag.

```xml
<!-- Ghost card: position=fixed, outside scroll-view, follows finger -->
<view class="drag-ghost-card" wx:if="{{dragGhostVisible}}"
      style="top: {{dragGhostTop}}px; left: {{dragGhostLeft}}px; width: {{dragGhostWidth}}px;">
  <!-- Mirror content of the dragged card, using draggingIndex -->
  <view class="drag-handle">≡</view>
  <text>{{items[draggingIndex].label}}</text>
</view>

<!-- Scroll container -->
<scroll-view class="inner-scroll large-scroll"
             scroll-y
             scroll-top="{{listScrollTop}}">
  <!-- CRITICAL: catchtouchmove wrapper blocks natural scroll during drag -->
  <view catchtouchmove="{{draggingIndex >= 0 ? 'noop' : ''}}">
    <view wx:for="{{items}}" wx:key="id" id="item-{{index}}"
          class="sortable-card {{draggingIndex === index ? 'dragging-ghost' : ''}}
                 {{dragInsertIndex === index ? 'drag-insert-target' : ''}}"
          data-index="{{index}}"
          bindlongpress="startDrag"
          bindtouchmove="onDragMove"
          bindtouchend="endDrag"
          bindtouchcancel="endDrag">
      <!-- Card content -->
      <view class="drag-handle">≡</view>
    </view>
    <!-- Insert line shown after last item -->
    <view class="drag-insert-line-end"
          wx:if="{{dragInsertIndex === items.length}}"></view>
  </view>
</scroll-view>
```

### Critical WXML rules

1. **`scroll-y` must always be `true`** (or just bare `scroll-y` attribute). Never toggle it — `scroll-top` (programmatic) is ignored when `scroll-y` is falsy in WeChat.

2. **`catchtouchmove="{{draggingIndex >= 0 ? 'noop' : ''}}"` wrapper** — This is the scroll conflict resolution. During drag (`draggingIndex >= 0`), it catches all touchmove events at the bubble phase, preventing the scroll-view's natural handler from seeing them. The card's `bindtouchmove` still fires because it's at the target phase (before bubbling). When not dragging, it's an empty string (no handler), so normal scrolling works.

3. **Ghost card is `position: fixed`** — viewport-relative positioning. Uses `wx:if` (not `hidden`) to avoid layout cost when hidden.

4. **`drag-insert-line-end`** — Shows a blue line after the last item when inserting at the end.

## JS Data Properties

```javascript
data: {
  items: [],               // the array being sorted
  draggingIndex: -1,        // index of the card being dragged (-1 = not dragging)
  dragInsertIndex: -1,      // where the card would be inserted
  dragGhostTop: 0,          // ghost card viewport top (px)
  dragGhostLeft: 0,         // ghost card viewport left (px)
  dragGhostWidth: 0,        // ghost card width (px)
  dragGhostVisible: false,  // show/hide ghost
  listScrollTop: 0          // scroll-view scroll-top binding
}
```

## Utility: `moveItem`

```javascript
function moveItem(list, fromIndex, toIndex) {
  const nextList = [...list];
  const [moved] = nextList.splice(fromIndex, 1);
  nextList.splice(toIndex, 0, moved);
  return nextList;
}
```

## JS Event Handlers

### `startDrag(e)` — longpress handler

```javascript
startDrag(e) {
  const index = Number(e.currentTarget.dataset.index);
  const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
  if (!touch || Number.isNaN(index)) return;

  const touchY = touch.clientY;
  if (touchY == null) return;
  // Always use clientY — it's viewport-relative like position:fixed
  this._dragStartY = touchY;
  this._dragState = { currentIndex: index };
  this._dragEffectiveScrollTop = this.data.listScrollTop || 0;

  this.setData({
    draggingIndex: index,
    dragInsertIndex: index,
    dragGhostVisible: false
  });

  const self = this;
  // Measure card rects for ghost positioning + insert detection
  wx.createSelectorQuery()
    .selectAll('.sortable-card')
    .boundingClientRect(function(rects) {
      if (rects && rects.length) {
        self._cardRects = rects;
        const cardRect = rects[index];
        if (cardRect) {
          self._dragCardOriginalTop = cardRect.top;
          self._dragCardLeft = cardRect.left;
          self._dragCardWidth = cardRect.width;
          // Where inside the card the finger touched (for pinning ghost)
          self._fingerOffsetInCard = touchY - cardRect.top;
          self.setData({
            dragGhostTop: cardRect.top,
            dragGhostLeft: cardRect.left,
            dragGhostWidth: cardRect.width,
            dragGhostVisible: true
          });
        }
      }
    }).exec();

  // Measure scroll view bounds (for auto-scroll zone + ghost clamping)
  wx.createSelectorQuery()
    .select('.large-scroll')
    .boundingClientRect(function(rect) {
      if (rect) self._dragScrollRect = rect;
    }).exec();
},
```

### `onDragMove(e)` — touchmove handler

This is the core function. Two parts: scroll accumulation (every frame) and UI update (throttled to ~30fps).

```javascript
onDragMove(e) {
  if (!this._dragState || this.data.draggingIndex < 0) return;
  const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
  if (!touch) return;

  const touchY = touch.clientY;
  if (touchY == null) return;
  this._dragLastY = touchY;
  const self = this;
  const now = Date.now();

  // === Part 1: Auto-scroll accumulation (runs every frame) ===
  // Important: this runs even when UI update is throttled.
  // Scroll delta accumulates in _dragEffectiveScrollTop so no momentum is lost.
  const sr = this._dragScrollRect;
  if (sr) {
    const viewHeight = sr.bottom - sr.top;
    // Edge zone: top/bottom 22% of view height, capped at 70px
    const edgeSize = Math.min(70, viewHeight * 0.22);
    const middleTop = sr.top + edgeSize;
    const middleBottom = sr.bottom - edgeSize;
    let scrollDelta = 0;

    if (touchY < middleTop) {
      // Finger in upper edge zone or above → scroll up
      const distIntoEdge = middleTop - touchY;
      const factor = Math.min(distIntoEdge / edgeSize, 3);
      scrollDelta = -Math.round(5 * factor);
    } else if (touchY > middleBottom) {
      // Finger in lower edge zone or below → scroll down
      const distIntoEdge = touchY - middleBottom;
      const factor = Math.min(distIntoEdge / edgeSize, 3);
      scrollDelta = Math.round(5 * factor);
    }
    // touchY between middleTop and middleBottom → scrollDelta = 0 (dead zone)

    if (scrollDelta !== 0) {
      self._dragEffectiveScrollTop = Math.max(0,
        (self._dragEffectiveScrollTop || 0) + scrollDelta);
    }
  }

  // === Part 2: Throttled UI update (DOM query + setData) ===
  // Throttle to ~30fps to prevent callback pile-up and jank
  if (self._lastUpdateTime && now - self._lastUpdateTime < 33) return;
  self._lastUpdateTime = now;

  wx.createSelectorQuery()
    .selectAll('.sortable-card')
    .boundingClientRect(function(rects) {
      if (!rects || !rects.length || !self._dragState) return;
      self._cardRects = rects;

      const y = self._dragLastY;
      if (y == null) return;

      // Find insert index: above card center → insert before it
      let newInsertIndex = rects.length;
      for (let i = 0; i < rects.length; i++) {
        if (y < rects[i].top + rects[i].height / 2) {
          newInsertIndex = i;
          break;
        }
      }

      // Ghost card: pin to finger at initial touch offset
      const sr = self._dragScrollRect;
      let ghostTop;
      if (self._fingerOffsetInCard != null) {
        ghostTop = y - self._fingerOffsetInCard;
      } else if (self._dragCardOriginalTop != null && self._dragStartY != null) {
        // Fallback: delta-based
        ghostTop = self._dragCardOriginalTop + (y - self._dragStartY);
      }
      // Clamp ghost to scroll view bounds
      if (sr) {
        const draggedRect = rects[self._dragState.currentIndex];
        const ghostHeight = draggedRect ? draggedRect.height : 80;
        ghostTop = Math.max(sr.top, Math.min(sr.bottom - ghostHeight, ghostTop));
      }

      // Single batched setData — all three visual updates in one call
      const update = {};
      if (newInsertIndex !== self.data.dragInsertIndex)
        update.dragInsertIndex = newInsertIndex;
      if (ghostTop !== self.data.dragGhostTop)
        update.dragGhostTop = ghostTop;
      if (self._dragEffectiveScrollTop != null)
        update.listScrollTop = self._dragEffectiveScrollTop;
      if (Object.keys(update).length) self.setData(update);
    }).exec();
},
```

### `endDrag()` — touchend handler

```javascript
endDrag() {
  const state = this._dragState;
  if (!state) return;
  const fromIndex = state.currentIndex;
  const insertIndex = this.data.dragInsertIndex;

  // Adjust: if inserting after the dragged item, account for its removal
  const toIndex = insertIndex > fromIndex ? insertIndex - 1 : insertIndex;

  if (toIndex !== fromIndex && toIndex >= 0 && toIndex < this.data.items.length) {
    const items = moveItem(this.data.items, fromIndex, toIndex);
    this.setData({ items: items });
  }

  // Clean up ALL internal state
  this._dragState = null;
  this._cardRects = null;
  this._dragScrollRect = null;
  this._dragLastY = null;
  this._dragCardOriginalTop = null;
  this._dragStartY = null;
  this._dragCardLeft = null;
  this._dragCardWidth = null;
  this._dragEffectiveScrollTop = null;
  this._fingerOffsetInCard = null;
  this._lastUpdateTime = null;

  this.setData({
    draggingIndex: -1,
    dragInsertIndex: -1,
    dragGhostVisible: false
  });
},
```

## WXSS

```css
/* Source card: faded out and slightly shrunken while being dragged */
.dragging-ghost {
  opacity: 0.4;
  transform: scale(0.96);
  box-shadow: none;
}

/* Insert target indicator: blue line at top of card, no layout shift */
.drag-insert-target {
  box-shadow: inset 0 4rpx 0 0 #3b82f6,
              0 8rpx 20rpx rgba(59, 130, 246, 0.12);
}

/* Ghost card: fixed positioning, follows finger, no pointer events */
.drag-ghost-card {
  position: fixed;
  z-index: 1000;
  pointer-events: none;        /* critical: passes touches through */
  /* mirror card styling */
  padding: 20rpx 18rpx;
  border-radius: 22rpx;
  background: linear-gradient(135deg, rgba(255,255,255,0.72), rgba(249,251,255,0.58));
  border: 1rpx solid rgba(226,237,247,0.50);
  box-shadow: 0 16rpx 32rpx rgba(15,23,42,0.10);
  box-sizing: border-box;
}

/* Insert line at end of list */
.drag-insert-line-end {
  height: 4rpx;
  background: #3b82f6;
  border-radius: 2rpx;
  margin: 8rpx 0;
}

/* Drag handle icon */
.drag-handle {
  width: 52rpx;
  height: 52rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 32rpx;
  font-weight: 700;
}
```

## Design Decisions and Pitfalls

### Scroll conflict (most critical)

**Problem**: `scroll-view` has built-in touch-to-scroll behavior. During drag, both the programmatic `scroll-top` and the natural touch scroll try to control scroll position → oscillation/jitter.

**Solution**: The `catchtouchmove` wrapper. In WeChat mini programs, `catch` fires at the bubble phase and prevents the event from reaching the scroll-view's internal handler. The card's own `bindtouchmove` fires at the target phase (before bubbling), so it still receives the event.

- **Drag mode** (`draggingIndex >= 0`): `catchtouchmove="noop"` → blocks natural scrolling
- **Normal mode**: `catchtouchmove=""` (empty → no handler) → normal scrolling

### Why `scroll-y` must stay on

`scroll-y="{{false}}"` makes the scroll-view ignore `scroll-top` programmatic updates entirely. Must always be truthy. The catchtouchmove wrapper handles blocking natural scroll during drag.

### Why throttle DOM queries

`wx.createSelectorQuery().exec()` is async. Firing it on every touchmove (~60/sec) creates a backlog of callbacks, each calling `setData`. This causes:
- Multiple re-renders per frame
- Stale rect data (callback fires when touch has already moved)
- Visible jank

Throttling to ~33ms (30fps) eliminates this. Scroll delta still accumulates every frame so no momentum is lost.

### Why `clientY` not `pageY`

`pageY` includes scroll offsets inside scroll-view. `clientY` is viewport-relative, matching `position: fixed` ghost card positioning. Use `clientY` only; if it is unavailable, abort that event instead of falling back to `pageY`.

### Finger offset in card

Pinning the ghost to the finger at the exact relative position where the touch started (`_fingerOffsetInCard = touchY - cardRect.top`) feels natural — like the card is stuck to the finger. Delta-based positioning (`originalTop + (y - startY)`) is a fallback.

### Insert index adjustment

When dropping: `toIndex = insertIndex > fromIndex ? insertIndex - 1 : insertIndex`. This accounts for the fact that after removing the dragged item, all subsequent indices shift down by 1. If inserting at position 5 and removing from position 2, the effective insert is at 4 (because position 2 was removed, shifting 3→2, 4→3, 5→4).

### setData batching

Always batch `dragInsertIndex`, `dragGhostTop`, and `listScrollTop` into a single `setData` call. Multiple calls per frame cause double re-render.

## Tuning Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `edgeSize` | `Math.min(70, viewHeight * 0.22)` | Edge zone width for auto-scroll trigger |
| `maxScrollSpeed` | `5` | Base px/frame scroll speed |
| `factor cap` | `3` | Max speed multiplier when finger is outside view |
| `throttle interval` | `33ms` | DOM query + setData throttle (~30fps) |

Adjust these if scrolling feels too fast/slow or edge zones are too large/small.

## Quick Reference: Complete File Checklist

Modifying these files for drag-to-reorder:

1. **WXML**: Ghost card (outside scroll-view), `scroll-y`, `catchtouchmove` wrapper, `drag-insert-target` class, `drag-insert-line-end`
2. **JS**: `data` properties, `moveItem` utility, `startDrag`/`onDragMove`/`endDrag` handlers, `noop() {}` empty handler
3. **WXSS**: `.dragging-ghost`, `.drag-insert-target`, `.drag-ghost-card`, `.drag-insert-line-end`, `.drag-handle`
