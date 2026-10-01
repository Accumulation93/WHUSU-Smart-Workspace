'use strict';

/*
 * 模板编辑器组件：拖动排序的落位计算。
 * 这里只验证“长按进拖动 → 手指移动算插入位置 → 松手上报起止位置”，
 * 自动翻页与真机手感仍以手机/Pad 现场验收为准。
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const componentFile = path.resolve(__dirname, '../components/hrTemplateEditor/hrTemplateEditor.js');

function loadComponent() {
  let definition = null;
  const sandboxWx = {
    getSystemInfoSync: () => ({ windowHeight: 700 }),
    pageScrollTo: () => {}
  };
  vm.runInNewContext(fs.readFileSync(componentFile, 'utf8'), {
    module: { exports: {} },
    Component: (value) => { definition = value; return value; },
    wx: sandboxWx,
    Date,
    Object,
    Number,
    String
  }, { filename: componentFile });
  return { definition, wx: sandboxWx };
}

function createInstance(definition, rects, overrides) {
  const events = [];
  const settings = overrides || {};
  const instance = {
    data: {
      dragIndex: -1,
      dragInsertIndex: -1,
      optionDragFieldIndex: -1,
      optionDragIndex: -1,
      ghostVisible: false,
      ghostTop: 0,
      ghostLeft: 0,
      ghostWidth: 0,
      ghostLabel: '',
      form: settings.form || {
        fields: [
          { id: 'f1', label: '第一个' },
          { id: 'f2', label: '第二个' },
          { id: 'f3', label: '第三个' },
          { id: 'f4', label: '第四个' }
        ]
      }
    },
    setData(patch) {
      Object.assign(this.data, patch);
    },
    triggerEvent(name, detail) {
      events.push({ name, detail });
    },
    createSelectorQuery() {
      return {
        selectAll() {
          return {
            boundingClientRect(callback) {
              callback(rects);
              return { exec() {} };
            }
          };
        },
        selectViewport() {
          return {
            scrollOffset(callback) {
              callback({ scrollTop: 0 });
              return { exec() {} };
            }
          };
        }
      };
    }
  };
  Object.assign(instance, definition.methods);
  return { instance, events };
}

const RECTS = [
  { top: 100, height: 80, left: 20, width: 300 },
  { top: 190, height: 80, left: 20, width: 300 },
  { top: 280, height: 80, left: 20, width: 300 },
  { top: 370, height: 80, left: 20, width: 300 }
];

test('长按手柄进入拖动，松手按手指位置上报落位', () => {
  const { definition } = loadComponent();
  const { instance, events } = createInstance(definition, RECTS);
  instance.onHandleLongPress({ currentTarget: { dataset: { index: 0 } }, touches: [{ clientY: 120 }] });
  assert.equal(instance.data.dragIndex, 0);
  assert.equal(instance.data.ghostVisible, true);
  assert.equal(instance.data.ghostTop, 100);
  assert.equal(instance.data.ghostWidth, 300);

  instance.onDragMove({ touches: [{ clientY: 330 }] });
  assert.equal(instance.data.dragInsertIndex, 3, '越过第三项中线后插入位置应落在其后');

  instance.onDragEnd();
  assert.equal(instance.data.dragIndex, -1);
  assert.equal(instance.data.ghostVisible, false);
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'action');
  assert.deepEqual(JSON.parse(JSON.stringify(events[0].detail)),
    { action: 'field-drop', fromIndex: 0, toIndex: 2, fieldId: 'f1' });
});

test('拖动中手指移到上边缘时自动向上翻页', () => {
  const { definition, wx: sandboxWx } = loadComponent();
  const { instance } = createInstance(definition, RECTS);
  const scrolls = [];
  instance.createSelectorQuery = () => ({
    selectAll() {
      return { boundingClientRect(callback) { callback(RECTS); return { exec() {} }; } };
    },
    selectViewport() {
      return {
        scrollOffset(callback) {
          callback({ scrollTop: 400 });
          return { exec() {} };
        }
      };
    }
  });
  sandboxWx.pageScrollTo = (options) => { scrolls.push(options); };
  instance.onHandleLongPress({ currentTarget: { dataset: { index: 3 } }, touches: [{ clientY: 380 }] });
  instance.onDragMove({ touches: [{ clientY: 10 }] });
  assert.equal(scrolls.length, 1, '手指到上边缘要触发一次自动翻页');
  assert(scrolls[0].scrollTop < 400, '自动翻页方向必须向上');
  assert.equal(scrolls[0].duration, 0);
});

test('没有长按就不会产生拖动状态', () => {
  const { definition } = loadComponent();
  const { instance, events } = createInstance(definition, RECTS);
  instance.onDragMove({ touches: [{ clientY: 300 }] });
  instance.onDragEnd();
  assert.equal(instance.data.dragIndex, -1);
  assert.equal(events.length, 0);
});

test('选项行长按拖动后按真实下标上报落位', () => {
  const { definition } = loadComponent();
  const optionRects = [
    { top: 100, height: 40, left: 20, width: 300, dataset: { fieldIndex: '0', optionIndex: '0' } },
    { top: 150, height: 40, left: 20, width: 300, dataset: { fieldIndex: '0', optionIndex: '1' } },
    { top: 200, height: 40, left: 20, width: 300, dataset: { fieldIndex: '0', optionIndex: '2' } }
  ];
  const { instance, events } = createInstance(definition, optionRects, {
    form: { fields: [{ id: 's1', label: '序列项', optionsViewList: [
      { index: 0, text: '甲' }, { index: 1, text: '乙' }, { index: 2, text: '丙' }
    ] }] }
  });
  instance.onOptionHandleLongPress({
    currentTarget: { dataset: { index: 0, optionIndex: 0 } },
    touches: [{ clientY: 110 }]
  });
  assert.equal(instance.data.optionDragIndex, 0);
  assert.equal(instance.data.optionDragFieldIndex, 0);
  assert.equal(instance.data.dragIndex, -1, '拖选项时不能把资料项行当作被拖动项');
  assert.equal(instance.data.ghostLabel, '甲');

  instance.onDragMove({ touches: [{ clientY: 230 }] });
  assert.equal(instance.data.dragInsertIndex, 3);

  instance.onDragEnd();
  assert.equal(instance.data.optionDragIndex, -1);
  assert.deepEqual(JSON.parse(JSON.stringify(events[0].detail)),
    { action: 'option-drop', index: 0, fromIndex: 0, toIndex: 2 });
});

test('选项拖动只按本字段的行计算插入位置', () => {
  const { definition } = loadComponent();
  const mixedRects = [
    { top: 100, height: 40, left: 20, width: 300, dataset: { fieldIndex: '0', optionIndex: '0' } },
    { top: 150, height: 40, left: 20, width: 300, dataset: { fieldIndex: '1', optionIndex: '0' } },
    { top: 200, height: 40, left: 20, width: 300, dataset: { fieldIndex: '0', optionIndex: '1' } }
  ];
  const { instance, events } = createInstance(definition, mixedRects, {
    form: { fields: [
      { id: 's1', optionsViewList: [{ index: 0, text: '甲' }, { index: 1, text: '乙' }] },
      { id: 's2', optionsViewList: [{ index: 0, text: '丙' }] }
    ] }
  });
  instance.onOptionHandleLongPress({
    currentTarget: { dataset: { index: 0, optionIndex: 0 } },
    touches: [{ clientY: 110 }]
  });
  instance.onDragMove({ touches: [{ clientY: 230 }] });
  instance.onDragEnd();
  assert.deepEqual(JSON.parse(JSON.stringify(events[0].detail)),
    { action: 'option-drop', index: 0, fromIndex: 0, toIndex: 1 }, '别的字段的选项行不参与比较');
});
