'use strict';

/**
 * 人事模板编辑器。
 *
 * 只负责呈现与交互：表单数据、语言资源由页面传下来，每一次改动都用
 * 一个 action 事件交回页面处理，避免把保存、校验、排序逻辑复制到组件里。
 * 拖动排序在组件内部完成（虚影与插入位置都在组件里），松手时只上报起止位置。
 */
Component({
  options: {
    styleIsolation: 'apply-shared',
    multipleSlots: false
  },

  properties: {
    form: { type: Object, value: null },
    localeCopy: { type: Object, value: {} },
    hrTemplateCopy: { type: Object, value: {} },
    editModeOptions: { type: Array, value: [] },
    fieldTypeOptions: { type: Array, value: [] },
    numberRuleOptions: { type: Array, value: [] },
    dirty: { type: Boolean, value: false },
    formError: { type: String, value: '' },
    saving: { type: Boolean, value: false },
    importing: { type: Boolean, value: false }
  },

  data: {
    dragIndex: -1,
    dragInsertIndex: -1,
    ghostVisible: false,
    ghostTop: 0,
    ghostLeft: 0,
    ghostWidth: 0
  },

  methods: {
    emit(action, detail) {
      this.triggerEvent('action', Object.assign({ action }, detail || {}));
    },

    onTemplateInput(e) {
      this.emit('template-input', { field: String(e.currentTarget.dataset.field || ''), value: e.detail.value });
    },

    onEditModeChange(e) {
      this.emit('edit-mode-change', { value: Number(e.detail.value) });
    },

    onFieldInput(e) {
      this.emit('field-input', {
        index: Number(e.currentTarget.dataset.index),
        field: String(e.currentTarget.dataset.field || ''),
        value: e.detail.value
      });
    },

    onFieldTypeChange(e) {
      this.emit('field-type-change', { index: Number(e.currentTarget.dataset.index), value: Number(e.detail.value) });
    },

    onFieldRequiredChange(e) {
      this.emit('field-required-change', {
        index: Number(e.currentTarget.dataset.index),
        value: e.detail.value
      });
    },

    onNumberRuleChange(e) {
      this.emit('number-rule-change', { index: Number(e.currentTarget.dataset.index), value: Number(e.detail.value) });
    },

    onFieldAllowDecimalChange(e) {
      this.emit('field-decimal-change', {
        index: Number(e.currentTarget.dataset.index),
        value: e.detail.value
      });
    },

    onToggleField(e) {
      this.emit('toggle-field', { fieldId: String(e.currentTarget.dataset.fieldId || '') });
    },

    onMoveField(e) {
      this.emit('move-field', {
        index: Number(e.currentTarget.dataset.index),
        dir: Number(e.currentTarget.dataset.dir)
      });
    },

    onRemoveField(e) {
      this.emit('remove-field', { index: Number(e.currentTarget.dataset.index) });
    },

    onRemoveOption(e) {
      this.emit('remove-option', {
        index: Number(e.currentTarget.dataset.index),
        optionIndex: Number(e.currentTarget.dataset.optionIndex)
      });
    },

    onDedupeOptions(e) {
      this.emit('dedupe-options', { index: Number(e.currentTarget.dataset.index) });
    },

    onAddField() {
      this.emit('add-field');
    },

    onImportFields() {
      this.emit('import-fields');
    },

    onSave() {
      this.emit('save');
    },

    onCancel() {
      this.emit('cancel');
    },

    /** 长按拖动手柄进入排序：拖动期间页面不跟手滚动，到边缘才自动翻页。 */
    onHandleLongPress(e) {
      const index = Number(e.currentTarget.dataset.index);
      const fields = (this.data.form && this.data.form.fields) || [];
      if (Number.isNaN(index) || !fields[index] || this.data.dragIndex >= 0) return;
      const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      const touchY = touch ? (touch.clientY != null ? touch.clientY : touch.pageY) : null;
      this._drag = { index, fieldId: String(fields[index].id) };
      this._dragLastY = touchY;
      this._dragLastFrame = 0;
      this._dragViewport = { top: 0, bottom: wx.getSystemInfoSync().windowHeight };
      this.setData({ dragIndex: index, dragInsertIndex: index, ghostVisible: false });
      this.createSelectorQuery().selectAll('.hr-template-field-item').boundingClientRect((rects) => {
        if (!rects || !rects.length || !this._drag) return;
        const rect = rects[index];
        if (!rect) return;
        this._dragFingerOffset = (touchY == null ? rect.top : touchY) - rect.top;
        this.setData({
          ghostVisible: true,
          ghostTop: rect.top,
          ghostLeft: rect.left,
          ghostWidth: rect.width
        });
      }).exec();
    },

    onDragMove(e) {
      const state = this._drag;
      if (!state || this.data.dragIndex < 0) return;
      const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      if (!touch) return;
      const touchY = touch.clientY != null ? touch.clientY : touch.pageY;
      this._dragLastY = touchY;
      const now = Date.now();
      if (this._dragLastFrame && now - this._dragLastFrame < 33) return;
      this._dragLastFrame = now;

      const viewport = this._dragViewport;
      if (viewport) {
        const edge = Math.min(70, (viewport.bottom - viewport.top) * 0.22);
        let delta = 0;
        if (touchY < viewport.top + edge) {
          delta = -Math.round(6 * Math.min((viewport.top + edge - touchY) / edge, 3));
        } else if (touchY > viewport.bottom - edge) {
          delta = Math.round(6 * Math.min((touchY - viewport.bottom + edge) / edge, 3));
        }
        if (delta) {
          this.createSelectorQuery().selectViewport().scrollOffset((scroll) => {
            if (!this._drag) return;
            const nextTop = Math.max(0, Number(scroll && scroll.scrollTop || 0) + delta);
            if (typeof wx.pageScrollTo === 'function') wx.pageScrollTo({ scrollTop: nextTop, duration: 0 });
          }).exec();
        }
      }

      this.createSelectorQuery().selectAll('.hr-template-field-item').boundingClientRect((rects) => {
        if (!rects || !rects.length || !this._drag) return;
        let insertIndex = rects.length;
        for (let i = 0; i < rects.length; i += 1) {
          if (touchY < rects[i].top + rects[i].height / 2) {
            insertIndex = i;
            break;
          }
        }
        const offset = this._dragFingerOffset || 0;
        const draggedHeight = rects[state.index] ? rects[state.index].height : 0;
        let ghostTop = touchY - offset;
        if (viewport) ghostTop = Math.max(viewport.top, Math.min(viewport.bottom - draggedHeight, ghostTop));
        const update = {};
        if (insertIndex !== this.data.dragInsertIndex) update.dragInsertIndex = insertIndex;
        if (ghostTop !== this.data.ghostTop) update.ghostTop = ghostTop;
        if (Object.keys(update).length) this.setData(update);
      }).exec();
    },

    onDragEnd() {
      const state = this._drag;
      this._drag = null;
      if (!state) return;
      const insertIndex = this.data.dragInsertIndex;
      const toIndex = insertIndex > state.index ? insertIndex - 1 : insertIndex;
      this.setData({ dragIndex: -1, dragInsertIndex: -1, ghostVisible: false });
      this.emit('field-drop', { fromIndex: state.index, toIndex, fieldId: state.fieldId });
    }
  }
});
