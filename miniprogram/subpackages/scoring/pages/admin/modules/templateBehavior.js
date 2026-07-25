// Behavior: template tab — auto-extracted from admin.js
// Zero functional changes. All methods preserved exactly.
const utils = require('./adminUtils');
const { TEMPLATE_CSV_FIELDS, emptyTemplateForm, createEmptyQuestion, normalizeTemplateQuestionForForm, moveItem, refreshTemplateConfigSortOrder } = utils;
const { chooseTableFile, buildCsv, saveAndShareFile } = require('../../../../../utils/tableFile');
const orgSession = require('../../../../../utils/orgSession');

module.exports = Behavior({
  methods: {
    async loadTemplateList() {
      const request = orgSession.beginRequest(this, 'templateList');
      this.setLoading('templates', true);
      try {
        const result = await this.callCloud('listScoreTemplates');
        if (!orgSession.isRequestCurrent(this, request)) return;
        this.setData({
          templateList: result.list || []
        });
      } catch (error) {
        if (!orgSession.isRequestCurrent(this, request) || (error && error.silent)) return;
        wx.showToast({
          title: '加载评分问题失败',
          icon: 'none'
        });
      } finally {
        if (orgSession.isRequestCurrent(this, request)) this.setLoading('templates', false);
      }
    },

    onTemplateFieldInput(e) {
      const { field } = e.currentTarget.dataset;
      const rawValue = e.detail.value;
      const value = field === 'description' ? rawValue : rawValue.trim();
      this.setData({
        templateForm: {
          ...this.data.templateForm,
          [field]: value
        }
      });
    },

    onTemplateQuestionInput(e) {
      const { index, field } = e.currentTarget.dataset;
      const questionIndex = Number(index);
      const questions = this.data.templateForm.questions;
      if (!questions[questionIndex]) {
        return;
      }
  
      const rawValue = e.detail.value;
      const value = field === 'scoreLabel' ? rawValue : rawValue.trim();
  
      // Write to a separate data object to avoid re-rendering the wx:for list,
      // which would destroy the input element and dismiss the keyboard.
      this.setData({
        [`questionInputValues.${questionIndex}.${field}`]: value
      });
    },

    onTemplateQuestionBlur(e) {
      const { index, field } = e.currentTarget.dataset;
      const questionIndex = Number(index);
      let inputValues = this.data.questionInputValues;
      if (!inputValues[questionIndex] || inputValues[questionIndex][field] === undefined) return;
      let value = inputValues[questionIndex][field];
      // Sync the cached value back to the real question data on blur
      this.setData({
        [`templateForm.questions[${questionIndex}].${field}`]: value
      });
    },

    addTemplateQuestion() {
      let questions = [...this.data.templateForm.questions, createEmptyQuestion()];
      let newIndex = questions.length - 1;
      this.setData({
        templateForm: { ...this.data.templateForm, questions: questions },
        expandedQuestionIndex: newIndex,
        questionFocusIndex: newIndex,
        templateQuestionScrollInto: 'question-' + newIndex,
        questionValidationErrors: {}
      });
    },

    _flushQuestionInputs() {
      let inputCache = this.data.questionInputValues;
      if (!inputCache || !Object.keys(inputCache).length) return;
      let updates = {};
      for (let qi in inputCache) {
        for (let f in inputCache[qi]) {
          updates['templateForm.questions[' + qi + '].' + f] = inputCache[qi][f];
        }
      }
      this.setData(updates);
    },

    removeTemplateQuestion(e) {
      const index = Number(e.currentTarget.dataset.index);
      this._flushQuestionInputs();
      const questions = this.data.templateForm.questions.filter((_, questionIndex) => questionIndex !== index);
      let expandedIndex = this.data.expandedQuestionIndex;
      if (expandedIndex === index) {
        expandedIndex = -1;
      } else if (expandedIndex > index) {
        expandedIndex -= 1;
      }
      this.setData({
        templateForm: {
          ...this.data.templateForm,
          questions: questions
        },
        expandedQuestionIndex: expandedIndex,
        questionInputValues: {},
        questionValidationErrors: {}
      });
    },

    resetTemplateForm() {
      this.setData({
        templateForm: emptyTemplateForm(),
        questionInputValues: {},
        questionValidationErrors: {},
        expandedQuestionIndex: -1,
        questionFocusIndex: -1,
        templateQuestionScrollInto: '',
        draggingQuestionIndex: -1
      });
    },

    moveQuestionUp(e) {
      let index = Number(e.currentTarget.dataset.index);
      if (Number.isNaN(index) || index <= 0) return;
      this._flushQuestionInputs();
      let questions = moveItem(this.data.templateForm.questions, index, index - 1);
      let expandedIndex = this.data.expandedQuestionIndex;
      if (expandedIndex === index) expandedIndex = index - 1;
      else if (expandedIndex === index - 1) expandedIndex = index;
      this.setData({
        templateForm: { ...this.data.templateForm, questions: questions },
        templateQuestionScrollInto: 'question-' + (index - 1),
        expandedQuestionIndex: expandedIndex,
        questionInputValues: {},
        questionValidationErrors: {}
      });
    },

    moveQuestionDown(e) {
      let index = Number(e.currentTarget.dataset.index);
      let questions = this.data.templateForm.questions;
      if (Number.isNaN(index) || index >= questions.length - 1) return;
      this._flushQuestionInputs();
      questions = moveItem(questions, index, index + 1);
      let expandedIndex = this.data.expandedQuestionIndex;
      if (expandedIndex === index) expandedIndex = index + 1;
      else if (expandedIndex === index + 1) expandedIndex = index;
      this.setData({
        templateForm: { ...this.data.templateForm, questions: questions },
        templateQuestionScrollInto: 'question-' + (index + 1),
        expandedQuestionIndex: expandedIndex,
        questionInputValues: {},
        questionValidationErrors: {}
      });
    },

    startQuestionDrag(e) {
      const index = Number(e.currentTarget.dataset.index);
      const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      if (!touch || Number.isNaN(index)) return;
      let touchY = touch.clientY != null ? touch.clientY : touch.pageY;
      this._dragStartY = touchY;
      this._questionDragState = { currentIndex: index };
      this._dragLastScrollTime = 0;
      this._dragEffectiveScrollTop = this.data.templateQuestionScrollTop || 0;
      this.setData({ dragActive: true, draggingQuestionIndex: index, dragInsertIndex: index, questionValidationErrors: {} });
      let self = this;
      wx.createSelectorQuery().selectAll('.question-card').boundingClientRect(function(rects) {
        if (rects && rects.length) {
          self._questionCardRects = rects;
          let cardRect = rects[index];
          if (cardRect) {
            self._dragCardOriginalTop = cardRect.top;
            self._dragCardLeft = cardRect.left;
            self._dragCardWidth = cardRect.width;
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
      wx.createSelectorQuery().select('.large-scroll').boundingClientRect(function(rect) {
        if (rect) self._questionDragScrollRect = rect;
      }).exec();
    },

    onQuestionDragMove(e) {
      if (!this._questionDragState || this.data.draggingQuestionIndex < 0) return;
      let touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      if (!touch) return;
  
      let touchY = touch.clientY != null ? touch.clientY : touch.pageY;
      this._dragLastY = touchY;
      let self = this;
      let now = Date.now();
  
      // Accumulate scroll delta every frame based on finger position relative to scroll view edges.
      // Middle zone (between middleTop and middleBottom) = no scroll at all.
      let sr = this._questionDragScrollRect;
      if (sr) {
        let viewHeight = sr.bottom - sr.top;
        let edgeSize = Math.min(70, viewHeight * 0.22);
        let middleTop = sr.top + edgeSize;
        let middleBottom = sr.bottom - edgeSize;
        let scrollDelta = 0;
  
        if (touchY < middleTop) {
          let distIntoEdge = middleTop - touchY;
          let factor = Math.min(distIntoEdge / edgeSize, 3);
          scrollDelta = -Math.round(5 * factor);
        } else if (touchY > middleBottom) {
          let distIntoEdge = touchY - middleBottom;
          let factor = Math.min(distIntoEdge / edgeSize, 3);
          scrollDelta = Math.round(5 * factor);
        }
  
        if (scrollDelta !== 0) {
          self._dragEffectiveScrollTop = Math.max(0, (self._dragEffectiveScrollTop || 0) + scrollDelta);
        }
      }
  
      // Throttle expensive DOM queries + setData to ~30fps.
      // Scroll delta still accumulates every frame — setData applies the latest.
      if (self._lastUpdateTime && now - self._lastUpdateTime < 33) return;
      self._lastUpdateTime = now;
  
      wx.createSelectorQuery().selectAll('.question-card').boundingClientRect(function(rects) {
        if (!rects || !rects.length || !self._questionDragState) return;
        self._questionCardRects = rects;
  
        let y = self._dragLastY;
        if (y == null) return;
  
        let newInsertIndex = rects.length;
        for (let i = 0; i < rects.length; i++) {
          if (y < rects[i].top + rects[i].height / 2) {
            newInsertIndex = i;
            break;
          }
        }
  
        let sr = self._questionDragScrollRect;
        let ghostTop;
        if (self._fingerOffsetInCard != null) {
          ghostTop = y - self._fingerOffsetInCard;
        } else if (self._dragCardOriginalTop != null && self._dragStartY != null) {
          ghostTop = self._dragCardOriginalTop + (y - self._dragStartY);
        }
        if (sr) {
          let draggedRect = rects[self._questionDragState.currentIndex];
          let ghostHeight = draggedRect ? draggedRect.height : 80;
          ghostTop = Math.max(sr.top, Math.min(sr.bottom - ghostHeight, ghostTop));
        }
  
        // Single batched setData for all visual updates
        let update = {};
        if (newInsertIndex !== self.data.dragInsertIndex) update.dragInsertIndex = newInsertIndex;
        if (ghostTop !== self.data.dragGhostTop) update.dragGhostTop = ghostTop;
        if (self._dragEffectiveScrollTop != null) update.templateQuestionScrollTop = self._dragEffectiveScrollTop;
        if (Object.keys(update).length) self.setData(update);
      }).exec();
    },

    endQuestionDrag() {
      let state = this._questionDragState;
      if (!state) return;
      let fromIndex = state.currentIndex;
      let insertIndex = this.data.dragInsertIndex;
      // Adjust: if inserting after dragged item, account for its removal
      let toIndex = insertIndex > fromIndex ? insertIndex - 1 : insertIndex;
      if (toIndex !== fromIndex && toIndex >= 0 && toIndex < this.data.templateForm.questions.length) {
        let questions = moveItem(this.data.templateForm.questions, fromIndex, toIndex);
        let expandedIndex = this.data.expandedQuestionIndex;
        if (expandedIndex === fromIndex) {
          expandedIndex = toIndex;
        } else if (fromIndex < toIndex) {
          if (expandedIndex > fromIndex && expandedIndex <= toIndex) expandedIndex -= 1;
        } else {
          if (expandedIndex >= toIndex && expandedIndex < fromIndex) expandedIndex += 1;
        }
        this.setData({
          templateForm: { ...this.data.templateForm, questions: questions },
          expandedQuestionIndex: expandedIndex
        });
      }
      this._questionDragState = null;
      this._questionCardRects = null;
      this._questionDragScrollRect = null;
      this._dragLastY = null;
      this._dragCardOriginalTop = null;
      this._dragStartY = null;
      this._dragCardLeft = null;
      this._dragCardWidth = null;
      this._dragLastScrollTime = 0;
      this._dragEffectiveScrollTop = null;
      this._fingerOffsetInCard = null;
      this._lastUpdateTime = null;
      this.setData({ dragActive: false, draggingQuestionIndex: -1, dragInsertIndex: -1, dragGhostVisible: false, questionInputValues: {} });
    },

    onQuestionDragCancel() {
      this.endQuestionDrag();
    },

    toggleQuestionExpand(e) {
      const index = Number(e.currentTarget.dataset.index);
      if (Number.isNaN(index)) return;
      let isExpanded = this.data.expandedQuestionIndex === index;
      let updates = {
        expandedQuestionIndex: isExpanded ? -1 : index,
        questionFocusIndex: -1
      };
      // When collapsing, flush any pending input values to the question data
      if (isExpanded) {
        let inputCache = this.data.questionInputValues;
        if (inputCache[index]) {
          for (let f in inputCache[index]) {
            updates['templateForm.questions[' + index + '].' + f] = inputCache[index][f];
          }
        }
      }
      this.setData(updates);
    },

    onQuestionContentFocus() {
      if (this.data.questionFocusIndex >= 0) {
        this.setData({ questionFocusIndex: -1 });
      }
    },

    startCreateTemplate() {
      this.resetTemplateForm();
      this.setData({ activeTab: 'templates' });
    },

    async saveTemplate() {
      // Flush any pending question input values before saving
      this._flushQuestionInputs();
  
      let form = this.data.templateForm || emptyTemplateForm();
      let name = String(form.name || '').trim();
      let description = String(form.description || '');
  
      if (!name) {
        wx.showToast({ title: '请填写评分问题名称', icon: 'none' });
        return;
      }
  
      // Validate each question
      let validationErrors = {};
      let firstInvalidIndex = -1;
      let rawQuestions = form.questions || [];
      let questions = [];
      for (let qi = 0; qi < rawQuestions.length; qi++) {
        let question = rawQuestions[qi];
        let q = {
          question: String(question.question || '').trim(),
          scoreLabel: String(question.scoreLabel || ''),
          minValue: String(question.minValue == null ? '0' : question.minValue).trim(),
          startValue: String(question.startValue == null || question.startValue === '' ? '0' : question.startValue).trim(),
          maxValue: String(question.maxValue == null ? '' : question.maxValue).trim(),
          stepValue: String(question.stepValue == null || question.stepValue === '' ? '0.5' : question.stepValue).trim()
        };
  
        if (!q.question) {
          validationErrors[qi] = { field: 'question', msg: '问题内容不能为空' };
          if (firstInvalidIndex === -1) firstInvalidIndex = qi;
        }
        let min = parseFloat(q.minValue);
        let max = parseFloat(q.maxValue);
        let step = parseFloat(q.stepValue);
        if (isNaN(max) || max <= 0) {
          if (!validationErrors[qi]) {
            validationErrors[qi] = { field: 'maxValue', msg: '最高分必须为正数' };
            if (firstInvalidIndex === -1) firstInvalidIndex = qi;
          }
        } else if (isNaN(min) || min >= max) {
          if (!validationErrors[qi]) {
            validationErrors[qi] = { field: 'minValue', msg: '最低分必须小于最高分' };
            if (firstInvalidIndex === -1) firstInvalidIndex = qi;
          }
        }
        if (isNaN(step) || step <= 0) {
          if (!validationErrors[qi]) {
            validationErrors[qi] = { field: 'stepValue', msg: '步进值必须为正数' };
            if (firstInvalidIndex === -1) firstInvalidIndex = qi;
          }
        }
        if (q.question) questions.push(q);
      }
  
      if (!questions.length) {
        wx.showToast({ title: '请至少填写一道题目', icon: 'none' });
        return;
      }
  
      if (firstInvalidIndex >= 0) {
        let err = validationErrors[firstInvalidIndex];
        wx.showToast({ title: '第' + (firstInvalidIndex + 1) + '题：' + err.msg, icon: 'none', duration: 2500 });
        this.setData({
          questionValidationErrors: validationErrors,
          expandedQuestionIndex: firstInvalidIndex,
          templateQuestionScrollInto: 'question-' + firstInvalidIndex
        });
        return;
      }
  
      this.setLoading('saveTemplate', true);
      try {
        const result = await this.callCloud('saveScoreTemplate', {
          id: form.id,
          name,
          description,
          questions
        });
  
        if (result.status !== 'success') {
          wx.showToast({ title: result.message || '保存评分问题失败', icon: 'none' });
          return;
        }
  
        this.resetTemplateForm();
        await this.loadTemplateList();
        wx.showToast({ title: '评分问题已保存', icon: 'success' });
      } catch (error) {
        wx.showToast({ title: '保存评分问题失败', icon: 'none' });
      } finally {
        this.setLoading('saveTemplate', false);
      }
    },

    editTemplate(e) {
      const index = Number(e.currentTarget.dataset.index);
      const item = this.data.templateList[index];
      if (!item) {
        return;
      }
  
      const questions = (item.questions || []).length
        ? (item.questions || []).map((question) => normalizeTemplateQuestionForForm(question))
        : [createEmptyQuestion()];
  
      this.setData({
        templateForm: {
          id: item.id,
          name: item.name,
          description: item.description || '',
          questions
        },
        expandedQuestionIndex: -1,
        questionFocusIndex: -1,
        activeTab: 'templates'
      });
    },

    async duplicateTemplate(e) {
      const { id } = e.currentTarget.dataset;
      if (!id) {
        return;
      }
  
      this.setLoading('duplicateTemplate', true);
      try {
        const result = await this.callCloud('duplicateScoreTemplate', { id });
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || '复制评分问题失败',
            icon: 'none'
          });
          return;
        }
  
        await this.loadTemplateList();
        wx.showToast({
          title: '评分问题副本已创建',
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: '复制评分问题失败',
          icon: 'none'
        });
      } finally {
        this.setLoading('duplicateTemplate', false);
      }
    },
  
    // ========== Template Table Import / Export ==========,

    importTableTemplate() {
      const _this = this;
      chooseTableFile(_this.callCloud.bind(_this)).then(function (tableData) {
        if (!tableData) return;
  
        const headers = tableData.headers;
        const dataRows = tableData.rows;
        if (dataRows.length === 0 && headers.length <= 1) {
          wx.showToast({ title: '表格文件为空', icon: 'none' });
          return;
        }
        // Auto-fill empty template name/description from file name
        const baseName = (tableData.fileName || '').replace(/\.(xlsx?|xls|csv)$/i, '');
        if (baseName) {
          const form = _this.data.templateForm;
          const updates = {};
          if (!(form.name || '').trim()) updates['templateForm.name'] = baseName;
          if (!(form.description || '').trim()) updates['templateForm.description'] = baseName;
          if (Object.keys(updates).length) _this.setData(updates);
        }
        // Build samples (first 5 data rows)
        const sampleRows = dataRows.slice(0, 5);
        // Auto-map columns
        const mapping = _this._buildTemplateCsvMapping(headers);
        // Build mapping rows for dialog
        const csvImportRows = headers.map((header, idx) => {
          const mapped = mapping[idx] || '';
          const fieldDef = TEMPLATE_CSV_FIELDS.find(f => f.key === mapped);
          const samples = sampleRows.map(r => (r[idx] || '').substring(0, 30)).filter(s => s);
          return {
            header: header,
            fieldTypeLabel: fieldDef ? fieldDef.label : '—',
            sampleValue: samples.slice(0, 3).join(', ') || '—',
            optionIndex: mapped ? TEMPLATE_CSV_FIELDS.findIndex(f => f.key === mapped) + 1 : 0,
            optionLabel: fieldDef ? fieldDef.label : '-- 忽略 --'
          };
        });
        // Build picker labels
        const mappingLabels = ['-- 忽略 --'].concat(TEMPLATE_CSV_FIELDS.map(f => f.label));
        _this.setData({
          showTemplateCsvDialog: true,
          templateCsvHeaders: headers,
          templateCsvSamples: sampleRows,
          templateCsvMapping: mapping,
          templateCsvFullRows: dataRows,
          templateCsvReplaceMode: true,
          templateCsvImportRows: csvImportRows,
          templateCsvImportMappingLabels: mappingLabels
        });
      }).catch(function (err) {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '选择文件失败', icon: 'none' });
        }
      });
    },

    _parseTemplateCsvLine(line) {
      if (!line && line !== '') return [];
      const s = String(line);
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (inQuotes) {
          if (ch === '"') {
            if (i + 1 < s.length && s[i + 1] === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = false;
            }
          } else {
            current += ch;
          }
        } else {
          if (ch === '"') {
            inQuotes = true;
          } else if (ch === ',') {
            result.push(current);
            current = '';
          } else {
            current += ch;
          }
        }
      }
      result.push(current);
      // Filter out completely empty rows
      if (result.length === 1 && result[0].trim() === '') return [];
      if (result.every(c => c.trim() === '')) return [];
      return result;
    },

    _buildTemplateCsvMapping(headers) {
      const mapping = {};
      const usedFields = new Set();
      // First pass: exact / substring matches
      for (let ci = 0; ci < headers.length; ci++) {
        const hdr = headers[ci].toLowerCase().trim();
        for (const field of TEMPLATE_CSV_FIELDS) {
          if (usedFields.has(field.key)) continue;
          for (const alias of field.aliases) {
            if (hdr === alias.toLowerCase()) {
              mapping[ci] = field.key;
              usedFields.add(field.key);
              break;
            }
          }
          if (mapping[ci]) break;
        }
        if (!mapping[ci]) {
          // Substring match
          for (const field of TEMPLATE_CSV_FIELDS) {
            if (usedFields.has(field.key)) continue;
            for (const alias of field.aliases) {
              if (hdr.indexOf(alias.toLowerCase()) !== -1) {
                mapping[ci] = field.key;
                usedFields.add(field.key);
                break;
              }
            }
            if (mapping[ci]) break;
          }
        }
      }
      // Second pass: Jaccard similarity for unmapped columns
      for (let ci = 0; ci < headers.length; ci++) {
        if (mapping[ci]) continue;
        const hdr = headers[ci].toLowerCase().trim();
        if (!hdr) continue;
        let bestScore = 0;
        let bestField = null;
        for (const field of TEMPLATE_CSV_FIELDS) {
          if (usedFields.has(field.key)) continue;
          for (const alias of field.aliases) {
            const score = _jaccardSimilarity(hdr, alias.toLowerCase());
            if (score > bestScore && score >= 0.3) {
              bestScore = score;
              bestField = field.key;
            }
          }
        }
        if (bestField) {
          mapping[ci] = bestField;
          usedFields.add(bestField);
        }
      }
      return mapping;
  
      function _jaccardSimilarity(a, b) {
        if (!a || !b) return 0;
        const setA = new Set(a.split(''));
        const setB = new Set(b.split(''));
        const union = new Set([...setA, ...setB]);
        let intersection = 0;
        for (const ch of setA) { if (setB.has(ch)) intersection++; }
        return intersection / union.size;
      }
    },

    onTemplateCsvMappingChange(e) {
      const idx = Number(e.currentTarget.dataset.index);
      const selectedIndex = Number(e.detail.value);
      const rows = this.data.templateCsvImportRows.slice();
      const mapping = Object.assign({}, this.data.templateCsvMapping);
      if (selectedIndex === 0) {
        // "忽略"
        delete mapping[idx];
        rows[idx].optionIndex = 0;
        rows[idx].optionLabel = '-- 忽略 --';
        rows[idx].fieldTypeLabel = '—';
      } else {
        const field = TEMPLATE_CSV_FIELDS[selectedIndex - 1];
        mapping[idx] = field.key;
        rows[idx].optionIndex = selectedIndex;
        rows[idx].optionLabel = field.label;
        rows[idx].fieldTypeLabel = field.label;
      }
      this.setData({
        templateCsvMapping: mapping,
        templateCsvImportRows: rows
      });
    },

    confirmTemplateCsvImport() {
      const mapping = this.data.templateCsvMapping;
      const rows = this.data.templateCsvFullRows;
      const replaceMode = this.data.templateCsvReplaceMode;
  
      // Resolve which CSV column maps to which field
      const fieldToCol = {};
      for (const ci in mapping) {
        fieldToCol[mapping[ci]] = Number(ci);
      }
  
      const questionCol = fieldToCol['question'];
      if (questionCol == null) {
        wx.showToast({ title: '请先将一个 CSV 列映射到"问题内容"', icon: 'none' });
        return;
      }
  
      const DEFAULT_VALUES = {
        scoreLabel: '',
        minValue: '0',
        startValue: '0',
        maxValue: '10',
        stepValue: '1'
      };
  
      const newQuestions = [];
      for (const row of rows) {
        const questionText = (row[questionCol] || '').trim();
        if (!questionText) continue; // Skip empty questions
        const q = createEmptyQuestion();
        q.question = questionText;
        for (const fk of ['scoreLabel', 'minValue', 'startValue', 'maxValue', 'stepValue']) {
          const col = fieldToCol[fk];
          if (col != null) {
            const rawVal = (row[col] || '').trim();
            if (rawVal) {
              q[fk] = rawVal;
            } else {
              q[fk] = DEFAULT_VALUES[fk];
            }
          } else {
            q[fk] = DEFAULT_VALUES[fk];
          }
        }
        newQuestions.push(q);
      }
  
      if (!newQuestions.length) {
        wx.showToast({ title: '没有有效问题', icon: 'none' });
        return;
      }
  
      // Flush any pending question inputs
      this._flushQuestionInputs();
  
      let finalQuestions;
      if (replaceMode) {
        finalQuestions = newQuestions;
      } else {
        finalQuestions = (this.data.templateForm.questions || []).concat(newQuestions);
      }
  
      this.setData({
        showTemplateCsvDialog: false,
        templateCsvHeaders: [],
        templateCsvSamples: [],
        templateCsvMapping: {},
        templateCsvFullRows: [],
        templateCsvImportRows: [],
        templateForm: Object.assign({}, this.data.templateForm, { questions: finalQuestions }),
        expandedQuestionIndex: -1,
        questionInputValues: {},
        questionValidationErrors: {}
      });
  
      wx.showToast({ title: '已导入 ' + newQuestions.length + ' 个问题', icon: 'success' });
    },

    cancelTemplateCsvImport() {
      this.setData({
        showTemplateCsvDialog: false,
        templateCsvHeaders: [],
        templateCsvSamples: [],
        templateCsvMapping: {},
        templateCsvFullRows: [],
        templateCsvImportRows: []
      });
    },

    toggleTemplateCsvReplaceMode() {
      this.setData({ templateCsvReplaceMode: !this.data.templateCsvReplaceMode });
    },

    exportTemplate() {
      const questions = this.data.templateForm.questions || [];
      if (!questions.length) {
        wx.showToast({ title: '当前没有问题条目可导出', icon: 'none' });
        return;
      }
      const _this = this;
      wx.showActionSheet({
        itemList: ['CSV 格式 (.csv)', 'Excel 格式 (.xlsx)'],
        success: (res) => {
          const format = res.tapIndex === 0 ? 'csv' : 'excel';
          const headers = [
            { key: 'question', label: '问题内容' },
            { key: 'scoreLabel', label: '分值说明' },
            { key: 'minValue', label: '最低分' },
            { key: 'startValue', label: '起评分' },
            { key: 'maxValue', label: '最高分' },
            { key: 'stepValue', label: '步进值' }
          ];
          const rows = questions.map(function (q) {
            return {
              question: q.question || '',
              scoreLabel: q.scoreLabel || '',
              minValue: q.minValue || '0',
              startValue: q.startValue || '0',
              maxValue: q.maxValue || '10',
              stepValue: q.stepValue || '1'
            };
          });
          if (format === 'excel') {
            _this.callCloud('buildTableFile', { headers: headers, rows: rows, sheetName: '评分问题' }).then(function (result) {
              if (result && result.status === 'success' && result.fileBase64) {
                saveAndShareFile(result.fileBase64, '评分问题模板', 'xlsx');
              } else {
                wx.showToast({ title: '生成Excel失败', icon: 'none' });
              }
            }).catch(function () {
              wx.showToast({ title: '生成Excel失败', icon: 'none' });
            });
          } else {
            saveAndShareFile(buildCsv(headers, rows), '评分问题模板', 'csv');
          }
        }
      });
    },

    startTemplateConfigDrag(e) {
      const index = Number(e.currentTarget.dataset.index);
      const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      if (!touch || Number.isNaN(index)) return;
      let touchY = touch.clientY != null ? touch.clientY : touch.pageY;
      this._templateConfigDragStartY = touchY;
      this._templateConfigDragState = { currentIndex: index };
      this._templateConfigEffectiveScrollTop = this.data.templateConfigScrollTop || 0;
      this.setData({ dragActive: true, draggingClauseTemplateIndex: index, dragTemplateInsertIndex: index, dragTemplateGhostVisible: false });
      let self = this;
      wx.createSelectorQuery().selectAll('.template-config-card').boundingClientRect(function(rects) {
        if (rects && rects.length) {
          self._templateConfigCardRects = rects;
          let cardRect = rects[index];
          if (cardRect) {
            self._templateConfigCardOriginalTop = cardRect.top;
            self._templateConfigCardLeft = cardRect.left;
            self._templateConfigCardWidth = cardRect.width;
            self._templateConfigFingerOffsetInCard = touchY - cardRect.top;
            self.setData({
              dragTemplateGhostTop: cardRect.top,
              dragTemplateGhostLeft: cardRect.left,
              dragTemplateGhostWidth: cardRect.width,
              dragTemplateGhostVisible: true
            });
          }
        }
      }).exec();
      wx.createSelectorQuery().select('.template-config-scroll').boundingClientRect(function(rect) {
        if (rect) self._templateConfigDragScrollRect = rect;
      }).exec();
    },

    onTemplateConfigDragMove(e) {
      if (!this._templateConfigDragState || this.data.draggingClauseTemplateIndex < 0) return;
      let touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      if (!touch) return;
      let touchY = touch.clientY != null ? touch.clientY : touch.pageY;
      this._templateConfigDragLastY = touchY;
      let self = this;
      let now = Date.now();
  
      let sr = this._templateConfigDragScrollRect;
      if (sr) {
        let viewHeight = sr.bottom - sr.top;
        let edgeSize = Math.min(70, viewHeight * 0.22);
        let middleTop = sr.top + edgeSize;
        let middleBottom = sr.bottom - edgeSize;
        let scrollDelta = 0;
        if (touchY < middleTop) {
          let distIntoEdge = middleTop - touchY;
          let factor = Math.min(distIntoEdge / edgeSize, 3);
          scrollDelta = -Math.round(5 * factor);
        } else if (touchY > middleBottom) {
          let distIntoEdge = touchY - middleBottom;
          let factor = Math.min(distIntoEdge / edgeSize, 3);
          scrollDelta = Math.round(5 * factor);
        }
        if (scrollDelta !== 0) {
          self._templateConfigEffectiveScrollTop = Math.max(0, (self._templateConfigEffectiveScrollTop || 0) + scrollDelta);
        }
      }
  
      if (self._templateConfigLastUpdateTime && now - self._templateConfigLastUpdateTime < 33) return;
      self._templateConfigLastUpdateTime = now;
  
      wx.createSelectorQuery().selectAll('.template-config-card').boundingClientRect(function(rects) {
        if (!rects || !rects.length || !self._templateConfigDragState) return;
        self._templateConfigCardRects = rects;
        let y = self._templateConfigDragLastY;
        if (y == null) return;
  
        let newInsertIndex = rects.length;
        for (let i = 0; i < rects.length; i++) {
          if (y < rects[i].top + rects[i].height / 2) {
            newInsertIndex = i;
            break;
          }
        }
  
        let sr = self._templateConfigDragScrollRect;
        let ghostTop;
        if (self._templateConfigFingerOffsetInCard != null) {
          ghostTop = y - self._templateConfigFingerOffsetInCard;
        } else if (self._templateConfigCardOriginalTop != null && self._templateConfigDragStartY != null) {
          ghostTop = self._templateConfigCardOriginalTop + (y - self._templateConfigDragStartY);
        }
        if (sr) {
          let draggedRect = rects[self._templateConfigDragState.currentIndex];
          let ghostHeight = draggedRect ? draggedRect.height : 60;
          ghostTop = Math.max(sr.top, Math.min(sr.bottom - ghostHeight, ghostTop));
        }
  
        let update = {};
        if (newInsertIndex !== self.data.dragTemplateInsertIndex) update.dragTemplateInsertIndex = newInsertIndex;
        if (ghostTop !== self.data.dragTemplateGhostTop) update.dragTemplateGhostTop = ghostTop;
        if (self._templateConfigEffectiveScrollTop != null) update.templateConfigScrollTop = self._templateConfigEffectiveScrollTop;
        if (Object.keys(update).length) self.setData(update);
      }).exec();
    },

    endTemplateConfigDrag() {
      let state = this._templateConfigDragState;
      if (!state) return;
      let fromIndex = state.currentIndex;
      let insertIndex = this.data.dragTemplateInsertIndex;
      let toIndex = insertIndex > fromIndex ? insertIndex - 1 : insertIndex;
      if (toIndex !== fromIndex && toIndex >= 0 && toIndex <= this.data.ruleForm.clauseTemplateConfigs.length - 1) {
        let configs = refreshTemplateConfigSortOrder(moveItem(this.data.ruleForm.clauseTemplateConfigs, fromIndex, toIndex));
        this.setData({
          ruleForm: { ...this.data.ruleForm, clauseTemplateConfigs: configs }
        });
      }
      this._templateConfigDragState = null;
      this._templateConfigCardRects = null;
      this._templateConfigDragScrollRect = null;
      this._templateConfigDragLastY = null;
      this._templateConfigCardOriginalTop = null;
      this._templateConfigDragStartY = null;
      this._templateConfigCardLeft = null;
      this._templateConfigCardWidth = null;
      this._templateConfigEffectiveScrollTop = null;
      this._templateConfigFingerOffsetInCard = null;
      this._templateConfigLastUpdateTime = null;
      this.setData({ dragActive: false, draggingClauseTemplateIndex: -1, dragTemplateInsertIndex: -1, dragTemplateGhostVisible: false });
    },

    onTemplateConfigDragCancel() {
      this.endTemplateConfigDrag();
    },

    deleteTemplate(e) {
      const { id } = e.currentTarget.dataset;
      wx.showModal({
        title: '删除评分问题',
        content: '确认删除这份评分问题吗？',
        success: async (res) => {
          if (!res.confirm) {
            return;
          }
  
          try {
            const result = await this.callCloud('deleteScoreTemplate', { id });
            if (result.status !== 'success') {
              wx.showToast({
                title: result.message || '删除失败',
                icon: 'none'
              });
              return;
            }
  
            await this.loadTemplateList();
            wx.showToast({
              title: '评分问题已删除',
              icon: 'success'
            });
          } catch (error) {
            wx.showToast({
              title: '删除评分问题失败',
              icon: 'none'
            });
          }
        }
      });
    }
  }
});
