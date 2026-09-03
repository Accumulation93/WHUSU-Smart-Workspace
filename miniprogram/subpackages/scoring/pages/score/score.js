const localeCopy = require('../../../../locales/zh-CN/generated/subpackages/scoring/pages/score/score');
const { callFunction, showShortToast } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');
const authContext = require('../../../../utils/authContext');
const { navigateToTrustedRoute } = require('../../../../utils/trustedNavigation');
const { createScoreSignature, isScoreDraftDirty } = require('./scoreDraftGuard');

function assignmentNatureText(value) {
  if (value === 'staff') return localeCopy.assignmentNatureStaff;
  if (value === 'liaison') return localeCopy.assignmentNatureLiaison;
  if (value === 'other') return localeCopy.assignmentNatureOther;
  return String(value || '').trim();
}

function decorateParticipant(item) {
  const row = Object.assign({}, item || {});
  const assignmentLabel = typeof row.assignmentLabel === 'string'
    ? row.assignmentLabel.trim()
    : '';
  const parts = [
    assignmentNatureText(row.assignmentNature),
    assignmentLabel
  ].filter(Boolean);
  row._showAssignmentChip = Boolean(row.historicalAssignmentUnavailable || (row.needsAssignmentDisambiguation && row.assignmentId));
  row._assignmentChipText = row.historicalAssignmentUnavailable
    ? localeCopy.historicalAssignmentUnavailable
    : (row._showAssignmentChip ? parts.join(' · ') : '');
  return row;
}

function isStepAligned(value, startValue, stepValue) {
  if (!Number.isFinite(stepValue) || stepValue <= 0) {
    return true;
  }

  const diff = (value - startValue) / stepValue;
  return Math.abs(diff - Math.round(diff)) < 1e-8;
}

function alignScoreValue(v) {
  return Math.round(v * 1000) / 1000;
}

function getQuickScores(minValue, maxValue, startValue, stepValue) {
  let min = Number(minValue);
  let max = Number(maxValue);
  let start = Number(startValue);
  let step = Number(stepValue);

  if (!Number.isFinite(start) || !Number.isFinite(max) || !Number.isFinite(step) || step <= 0 || start > max) {
    return [];
  }

  let allScores = [];
  for (let v = start; v <= max + 1e-8; v += step) {
    let aligned = alignScoreValue(v);
    if (aligned >= min && aligned <= max) {
      allScores.push(aligned);
    }
    if (allScores.length >= 500) break;
  }

  let total = allScores.length;
  if (total === 0) return [];
  if (total <= 25) return allScores.map(String);

  // More than 25: prioritize integers, then fill remaining slots with decimals
  let intScores = [];
  let decScores = [];
  for (let i = 0; i < allScores.length; i++) {
    if (Math.abs(allScores[i] - Math.round(allScores[i])) < 1e-8) {
      intScores.push(allScores[i]);
    } else {
      decScores.push(allScores[i]);
    }
  }

  let result = [];
  let seen = {};
  function add(val) {
    let key = String(val);
    if (!seen[key]) {
      seen[key] = true;
      result.push(val);
    }
  }

  // Add all integers first (up to 25)
  for (let i = 0; i < intScores.length && result.length < 25; i++) {
    add(intScores[i]);
  }

  // Fill remaining slots with evenly distributed decimals
  let remaining = 25 - result.length;
  if (remaining > 0 && decScores.length > 0) {
    if (decScores.length <= remaining) {
      for (let i = 0; i < decScores.length; i++) {
        add(decScores[i]);
      }
    } else {
      for (let i = 0; i < remaining; i++) {
        let idx = Math.round((i / (remaining - 1)) * (decScores.length - 1));
        if (idx >= 0 && idx < decScores.length) {
          add(decScores[idx]);
        }
      }
    }
  }

  result.sort(function (a, b) { return a - b; });
  return result.slice(0, 25).map(String);
}

function validateQuestion(question) {
  question = question || {};
  let rawScore = String(question.score == null ? '' : question.score).trim();
  if (!rawScore) {
    return { ok: false, errorText: localeCopy.copy_f35088610d };
  }

  let score = Number(rawScore);
  if (Number.isNaN(score)) {
    return { ok: false, errorText: localeCopy.copy_3e1280ac6e };
  }

  if (score < Number(question.startValue)) {
    return { ok: false, errorText: localeCopy.copy_2c050ec0b6 };
  }

  if (score < Number(question.minValue) || score > Number(question.maxValue)) {
    return { ok: false, errorText: localeCopy.copy_0e293b9410 };
  }

  if (!isStepAligned(score, Number(question.startValue), Number(question.stepValue))) {
    return { ok: false, errorText: localeCopy.copy_39c11e023a };
  }

  return { ok: true, errorText: '' };
}

function normalizeQuestion(item) {
  item = item || {};
  return {
    id: item.id,
    index: Number(item.questionIndex),
    templateId: item.templateId,
    templateName: item.templateName,
    templateWeight: Number(item.templateWeight),
    templateSortOrder: Number(item.templateSortOrder),
    showTemplateHeader: !!item.showTemplateHeader,
    question: item.question,
    scoreLabel: item.scoreLabel,
    minValue: Number(item.minValue),
    startValue: Number(item.startValue),
    maxValue: Number(item.maxValue),
    stepValue: Number(item.stepValue),
    score: item.score != null ? item.score : '',
    quickScores: getQuickScores(item.minValue, item.maxValue, item.startValue, item.stepValue),
    errorText: '',
    touched: false
  };
}

function computeSummaries(questionList) {
  let templateMap = {};
  let templateOrder = [];
  for (let i = 0; i < questionList.length; i++) {
    let q = questionList[i];
    let tid = q.templateId;
    if (!templateMap[tid]) {
      templateMap[tid] = {
        templateId: tid,
        templateName: q.templateName,
        templateSortOrder: q.templateSortOrder,
        totalScore: 0,
        totalMax: 0,
        lastIndex: -1
      };
      templateOrder.push(tid);
    }
    let s = Number(q.score);
    if (!Number.isNaN(s) && String(q.score).trim() !== '') {
      templateMap[tid].totalScore += alignScoreValue(s);
    }
    templateMap[tid].totalMax += q.maxValue;
    templateMap[tid].lastIndex = i;
  }

  let newList = [];
  for (let i = 0; i < questionList.length; i++) {
    let q = questionList[i];
    let newQ = {};
    let keys = Object.keys(q);
    for (let k = 0; k < keys.length; k++) {
      newQ[keys[k]] = q[keys[k]];
    }
    newQ.showTemplateFooter = false;
    newQ.templateFooterScore = 0;
    newQ.templateFooterMax = 0;
    newList.push(newQ);
  }

  let templateSummaries = [];
  let pageTotalScore = 0;
  let pageTotalMax = 0;

  for (let t = 0; t < templateOrder.length; t++) {
    let info = templateMap[templateOrder[t]];
    if (info.lastIndex >= 0) {
      newList[info.lastIndex].showTemplateFooter = true;
      newList[info.lastIndex].templateFooterScore = info.totalScore;
      newList[info.lastIndex].templateFooterMax = info.totalMax;
    }
    templateSummaries.push({
      templateId: info.templateId,
      templateName: info.templateName,
      templateSortOrder: info.templateSortOrder,
      totalScore: info.totalScore,
      totalMax: info.totalMax
    });
    pageTotalScore += info.totalScore;
    pageTotalMax += info.totalMax;
  }

  return {
    questionList: newList,
    templateSummaries: templateSummaries,
    pageTotalScore: alignScoreValue(pageTotalScore),
    pageTotalMax: alignScoreValue(pageTotalMax)
  };
}

Page({
  data: {
    localeCopy,
    loading: true,
    loadFailed: false,
    loadErrorText: '',
    scorer: null,
    target: null,
    showStickyTarget: false,
    currentActivity: null,
    currentActivityText: localeCopy.copy_400aa44fd7,
    questionList: [],
    currentQuestionIndex: 0,
    currentQuestion: null,
    quickScoreRows: [],
    keyboardCollapsed: false,
    keyboardMode: 'quick',
    submitting: false,
    existingRecordId: '',
    existingRecordRevision: 0,
    existingRecordText: '',
    readOnly: false,
    templateSummaries: [],
    pageTotalScore: 0,
    pageTotalMax: 0,
    physicalInputValue: '',
    physicalInputFocus: false,
    physicalKeyActive: ''
  },

  syncCurrentQuestion: function (nextIndex) {
    let idx = Number.isInteger(nextIndex) ? nextIndex : this.data.currentQuestionIndex;
    let list = this.data.questionList;
    let q = (list && idx >= 0 && list[idx]) || null;
    let rows = [];
    if (q) {
      let scores = q.quickScores || [];
      let total = scores.length;
      if (total > 0) {
        let maxPerRow = 5;
        let rowCount = Math.ceil(total / maxPerRow);
        let baseSize = Math.floor(total / rowCount);
        let remainder = total % rowCount;
        let pos = 0;
        for (let r = 0; r < rowCount; r++) {
          let size = baseSize + (r < remainder ? 1 : 0);
          rows.push(scores.slice(pos, pos + size));
          pos += size;
        }
      }
    }
    let updates = {
      currentQuestionIndex: idx,
      currentQuestion: q,
      quickScoreRows: rows,
      keyboardCollapsed: q ? false : this.data.keyboardCollapsed
    };
    if (this._physicalKeyboardEnabled) {
      updates.physicalInputFocus = !updates.keyboardCollapsed && !!q;
      if (q) {
        let syncedScore = String(q.score != null ? q.score : '').trim();
        this._physicalBuffer = syncedScore;
        updates.physicalInputValue = syncedScore;
      }
    }
    if (rows.length === 0 && this.data.keyboardMode === 'quick') {
      updates.keyboardMode = 'numpad';
    }
    this.setData(updates);
  },

  collapseKeyboard: function () {
    this.setData({
      keyboardCollapsed: true,
      currentQuestion: null,
      physicalInputFocus: false
    });
  },

  expandKeyboard: function () {
    if (this.data.keyboardCollapsed && this.data.questionList.length > 0) {
      let idx = this.data.currentQuestionIndex;
      if (idx < 0 || idx >= this.data.questionList.length) {
        idx = 0;
      }
      this.syncCurrentQuestion(idx);
    }
  },

  toggleKeyboardMode: function () {
    let nextMode = this.data.keyboardMode === 'numpad' ? 'quick' : 'numpad';
    this.setData({ keyboardMode: nextMode });
  },

  onLoad: function (options) {
    wx.setNavigationBarTitle({ title: localeCopy.navigationTitle });
    this._pageActive = true;
    this._pageTimers = [];
    orgSession.consume(this);
    let deviceInfo = wx.getDeviceInfo();
    this._physicalKeyboardEnabled = deviceInfo.platform === 'devtools' || deviceInfo.platform === 'mac' || deviceInfo.platform === 'windows';
    this._physicalBuffer = '';
    this._shiftDown = false;
    this._keydownSupported = false;
    this._scoreBaselineSignature = '';
    this._draftGuardEnabled = false;
    // 微信开发者工具可能把上一评分页的原生离页提醒残留到新页面。
    // 新页面必须主动清理一次，不能只依赖上一实例的 onUnload。
    this._disableDraftGuard();
    this.targetId = String((options && options.targetId) || '').trim();
    if (!authContext.hasActiveUserAssignment()) {
      this.setData({
        loading: false,
        loadFailed: true,
        loadErrorText: localeCopy.currentAssignmentRequired
      });
      this._promptWorkContext(localeCopy.currentAssignmentRequired);
      return;
    }
    this.loadScoreForm();
  },

  onShow: function () {
    this._pageActive = true;
    if (!orgSession.consume(this).changed) return;
    orgSession.invalidateRequests(this);
    showShortToast(localeCopy.copy_0f2366ca9b);
    wx.navigateBack({ fail: function () { wx.reLaunch({ url: '/subpackages/main/pages/portal/portal' }); } });
  },

  onHide: function () {
    this._pageActive = false;
    (this._pageTimers || []).forEach(function (timer) { clearTimeout(timer); });
    this._pageTimers = [];
    if (this._clearKeyTimer) {
      clearTimeout(this._clearKeyTimer);
      this._clearKeyTimer = null;
    }
  },

  onUnload: function () {
    this._pageActive = false;
    orgSession.invalidateRequests(this);
    (this._pageTimers || []).forEach(function (timer) { clearTimeout(timer); });
    this._pageTimers = [];
    if (this._clearKeyTimer) {
      clearTimeout(this._clearKeyTimer);
      this._clearKeyTimer = null;
    }
    if (this._stickyObserver) {
      this._stickyObserver.disconnect();
      this._stickyObserver = null;
    }
    this._disableDraftGuard();
  },

  _enableDraftGuard: function () {
    if (this._draftGuardEnabled || typeof wx.enableAlertBeforeUnload !== 'function') return;
    wx.enableAlertBeforeUnload({ message: localeCopy.unsavedScoreLeaveWarning });
    this._draftGuardEnabled = true;
  },

  _disableDraftGuard: function () {
    if (typeof wx.disableAlertBeforeUnload === 'function') {
      wx.disableAlertBeforeUnload();
    }
    this._draftGuardEnabled = false;
  },

  _syncDraftGuard: function (questionList) {
    if (this.data.readOnly || !isScoreDraftDirty(questionList, this._scoreBaselineSignature)) {
      this._disableDraftGuard();
      return;
    }
    this._enableDraftGuard();
  },

  _commitCurrentDraft: function () {
    this._scoreBaselineSignature = createScoreSignature(this.data.questionList);
    this._disableDraftGuard();
  },

  _schedule: function (callback, delay) {
    let self = this;
    let timer = setTimeout(function () {
      self._pageTimers = (self._pageTimers || []).filter(function (item) { return item !== timer; });
      if (self._pageActive) callback();
    }, delay);
    this._pageTimers = (this._pageTimers || []).concat(timer);
    return timer;
  },

  _promptWorkContext: function (message) {
    wx.showModal({
      title: localeCopy.workContextTitle,
      content: message || localeCopy.currentAssignmentRequired,
      confirmText: localeCopy.switchWorkContext,
      cancelText: localeCopy.cancelSwitch,
      success: function (result) {
        if (result.confirm) navigateToTrustedRoute('/subpackages/org/pages/identitySwitch/identitySwitch');
      }
    });
  },

  _isWorkContextError: function (status) {
    return [
      'invalid_scorer',
      'work_context_required',
      'context_mismatch',
      'organization_mismatch',
      'assignment_mismatch',
      'wrong_organization',
      'wrong_assignment'
    ].indexOf(String(status || '')) >= 0;
  },

  onReady: function () {
    if (this._physicalKeyboardEnabled) {
      this.setData({ physicalInputFocus: true });
    }
  },

  _ensureInputFocus: function () {
    if (!this._physicalKeyboardEnabled) return;
    if (this.data.keyboardCollapsed) return;
    this.setData({ physicalInputFocus: true });
  },

  _setupStickyObserver: function () {
    if (this._stickyObserver) {
      this._stickyObserver.disconnect();
    }
    let self = this;
    this._stickyObserver = this.createIntersectionObserver({ nativeMode: true });
    this._stickyObserver
      .relativeToViewport({ top: 0 })
      .observe('.target-name-anchor', function (res) {
        self.setData({ showStickyTarget: res.intersectionRatio <= 0 });
      });
  },

  loadScoreForm: function () {
    let self = this;
    if (!self.targetId) {
      self.setData({
        loading: false,
        loadFailed: true,
        loadErrorText: localeCopy.copy_bcbd468dfa
      });
      return;
    }

    self.setData({ loading: true, loadFailed: false, loadErrorText: '' });

    callFunction({
      name: 'getScoreFormData',
      data: { targetId: self.targetId },
      success: function (res) {
        let result = res.result || {};
        if (result.status !== 'success') {
          if (self._isWorkContextError(result.status)) {
            self.setData({
              loading: false,
              loadFailed: true,
              loadErrorText: result.message || localeCopy.currentAssignmentRequired
            });
            self._promptWorkContext(result.message);
            return;
          }
          let loadErrorText = result.status === 'historical_structure_conflict'
            ? localeCopy.historicalDataRecovering
            : (result.message || localeCopy.loadFailedDescription);
          self.setData({ loading: false, loadFailed: true, loadErrorText: loadErrorText });
          return;
        }

        let rawQuestionList = ((result.templateBundle && result.templateBundle.questions) || []).map(function (item) {
          return normalizeQuestion(item);
        });

        self.activityId = result.currentActivity ? result.currentActivity.id : '';
        self.activityName = result.currentActivity ? result.currentActivity.name : '';
        self.templateConfigSignature = result.rule ? result.rule.templateConfigSignature : '';

        let hasExistingRecord = !!result.existingRecord;
        let readOnly = result.readOnly === true;
        let existingRecordId = hasExistingRecord ? String(result.existingRecord.id || '') : '';
        let existingRecordRevision = hasExistingRecord
          ? Math.max(1, Number(result.existingRecord.revisionNumber || 1))
          : 0;
        let existingRecordText = readOnly
          ? (result.readOnlyMessage || localeCopy.historicalReadOnly)
          : '';

        let summaries = computeSummaries(rawQuestionList);
        let questionList = summaries.questionList;
        self._scoreBaselineSignature = createScoreSignature(questionList);
        self._disableDraftGuard();

        let initialIndex = 0;
        if (questionList.length) {
          let firstEmpty = -1;
          for (let i = 0; i < questionList.length; i++) {
            if (questionList[i].score == null || String(questionList[i].score).trim() === '') {
              firstEmpty = i;
              break;
            }
          }
          initialIndex = firstEmpty >= 0 ? firstEmpty : 0;
        }

        self.setData({
          scorer: decorateParticipant(result.scorer),
          target: decorateParticipant(result.target),
          currentActivity: result.currentActivity || null,
          currentActivityText: result.currentActivity ? result.currentActivity.name : localeCopy.copy_400aa44fd7,
          questionList: questionList,
          currentQuestionIndex: initialIndex,
          existingRecordId: existingRecordId,
          existingRecordRevision: existingRecordRevision,
          existingRecordText: existingRecordText,
          readOnly: readOnly,
          templateSummaries: summaries.templateSummaries,
          pageTotalScore: summaries.pageTotalScore,
          pageTotalMax: summaries.pageTotalMax,
          loading: false,
          loadFailed: false,
          loadErrorText: ''
        });
        if (readOnly) {
          self.setData({ keyboardCollapsed: true, currentQuestion: null, physicalInputFocus: false });
        } else {
          self.syncCurrentQuestion();
        }
        self._setupStickyObserver();
        self._schedule(function () {
          self._checkSticky();
          self._ensureInputFocus();
          self.scrollToQuestion(initialIndex);
        }, 350);
      },
      fail: function () {
        self.setData({
          loading: false,
          loadFailed: true,
          loadErrorText: localeCopy.loadFailedDescription
        });
      }
    });
  },

  retryLoadScoreForm: function () {
    this.loadScoreForm();
  },

  updateQuestion: function (index, nextValues) {
    let questions = this.data.questionList.slice();
    if (!questions[index]) return;

    let nextQuestion = {};
    let keys = Object.keys(questions[index]);
    for (let k = 0; k < keys.length; k++) {
      nextQuestion[keys[k]] = questions[index][keys[k]];
    }
    let nvKeys = Object.keys(nextValues || {});
    for (let j = 0; j < nvKeys.length; j++) {
      nextQuestion[nvKeys[j]] = nextValues[nvKeys[j]];
    }

    let validation = validateQuestion(nextQuestion);
    nextQuestion.errorText = validation.errorText;
    questions[index] = nextQuestion;

    let summaries = computeSummaries(questions);
    let data = {
      questionList: summaries.questionList,
      templateSummaries: summaries.templateSummaries,
      pageTotalScore: summaries.pageTotalScore,
      pageTotalMax: summaries.pageTotalMax
    };
    if (index === this.data.currentQuestionIndex) {
      data.currentQuestion = summaries.questionList[index];
    }
    this.setData(data);
    this._syncDraftGuard(summaries.questionList);
  },

  focusQuestion: function (e) {
    if (this.data.readOnly) {
      showShortToast(localeCopy.historicalReadOnlyTap);
      return;
    }
    let index = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0) return;
    this.syncCurrentQuestion(index);
    this.scrollToQuestion(index);
  },

  onKeyboardTap: function (e) {
    let key = String(e.currentTarget.dataset.key || '');
    if (!key) return;

    let index = this.data.currentQuestionIndex;
    let question = this.data.questionList[index];
    if (!question) return;

    let current = String(question.score == null ? '' : question.score).trim();

    if (key === '.') {
      if (current === '' || current === '-') {
        current = '0.';
      } else if (current.indexOf('.') === -1) {
        current = current + '.';
      }
    } else if (key === '-') {
      if (current === '') {
        current = '-';
      } else if (current === '-') {
        current = '';
      } else if (current.charAt(0) === '-') {
        current = current.substring(1);
      } else {
        current = '-' + current;
      }
    } else {
      if (current === '0') {
        current = key;
      } else {
        current = current + key;
      }
    }

    this.flashKey(key);
    this._physicalBuffer = current;
    this.updateQuestion(index, { score: current, touched: true });
  },

  onKeyboardBackspace: function () {
    let index = this.data.currentQuestionIndex;
    let question = this.data.questionList[index];
    if (!question) return;

    let current = String(question.score == null ? '' : question.score).trim();
    if (current.length > 0) {
      current = current.substring(0, current.length - 1);
    }
    this.flashKey('backspace');
    this._physicalBuffer = current;
    this.updateQuestion(index, { score: current, touched: true });
  },

  flashKey: function (key) {
    let self = this;
    if (self._clearKeyTimer) clearTimeout(self._clearKeyTimer);
    self.setData({ physicalKeyActive: key });
    self._clearKeyTimer = setTimeout(function () {
      self.setData({ physicalKeyActive: '' });
      self._clearKeyTimer = null;
    }, 160);
  },

  processPhysicalChar: function (ch) {
    let index = this.data.currentQuestionIndex;
    let question = this.data.questionList[index];
    if (!question) return;

    let current = String(question.score == null ? '' : question.score).trim();

    if (ch === '.') {
      if (current === '' || current === '-') {
        current = '0.';
      } else if (current.indexOf('.') === -1) {
        current = current + '.';
      }
    } else if (ch === '-') {
      if (current === '') {
        current = '-';
      } else if (current === '-') {
        current = '';
      } else if (current.charAt(0) === '-') {
        current = current.substring(1);
      } else {
        current = '-' + current;
      }
    } else if (/^[0-9]$/.test(ch)) {
      if (current === '0') {
        current = ch;
      } else {
        current = current + ch;
      }
    }

    this.flashKey(ch);
    this.updateQuestion(index, { score: current, touched: true });
  },

  onPhysicalInput: function (e) {
    if (!this._physicalKeyboardEnabled) return;
    if (this.data.keyboardCollapsed) return;

    let newValue = e.detail.value || '';
    let oldValue = this._physicalBuffer || '';

    if (newValue === oldValue) return;

    let minLen = Math.min(oldValue.length, newValue.length);
    let splitPos = 0;
    while (splitPos < minLen && oldValue[splitPos] === newValue[splitPos]) {
      splitPos++;
    }

    let removeCount = oldValue.length - splitPos;

    for (let i = 0; i < removeCount; i++) {
      this.onKeyboardBackspace();
    }

    for (let i = splitPos; i < newValue.length; i++) {
      this.processPhysicalChar(newValue[i]);
    }

    this._physicalBuffer = newValue;

    if (this._physicalBuffer.length > 15) {
      let self = this;
    let currentScore = String(((self.data.questionList[self.data.currentQuestionIndex] || {}).score != null ? (self.data.questionList[self.data.currentQuestionIndex] || {}).score : '')).trim();
      this._physicalBuffer = currentScore;
      self.setData({ physicalInputValue: currentScore });
    }
  },

  onPhysicalInputBlur: function () {
    if (!this._physicalKeyboardEnabled) return;
    if (this.data.keyboardCollapsed) return;
    let self = this;
    wx.nextTick(function () {
      self._ensureInputFocus();
    });
  },

  onPhysicalKeyDown: function (e) {
    if (!this._physicalKeyboardEnabled) return;
    if (this.data.keyboardCollapsed) return;
    this._keydownSupported = true;

    let detail = e.detail || {};
    let keyCode = detail.keyCode;
    let key = detail.key || '';
    let shiftHeld = detail.shiftKey || this._shiftDown;

    // Track Shift via keydown (may not fire on all platforms)
    if (keyCode === 16 || key === 'Shift') {
      this._shiftDown = true;
      return;
    }

    // --- Arrow keys ---
    // Arrow Up → previous
    if (keyCode === 38 || key === 'ArrowUp') {
      this.flashKey('prev');
      this.goToPrevious();
      return;
    }
    // Arrow Down → next
    if (keyCode === 40 || key === 'ArrowDown') {
      this.flashKey('next');
      this.goToNext();
      return;
    }

    // --- Enter key ---
    if (keyCode === 13 || key === 'Enter') {
      if (shiftHeld) {
        this.flashKey('prev');
        this.goToPrevious();
      } else {
        let idx = this.data.currentQuestionIndex;
        let total = this.data.questionList.length;
        if (idx >= total - 1) {
          this.flashKey('submit');
          this.submitScore();
        } else {
          this.flashKey('next');
          this.goToNext();
        }
      }
    }
  },

  onPhysicalKeyUp: function (e) {
    let detail = e.detail || {};
    if (detail.keyCode === 16 || detail.key === 'Shift') {
      this._shiftDown = false;
    }
  },

  onPhysicalConfirm: function () {
    if (!this._physicalKeyboardEnabled) return;
    if (this._keydownSupported) return;
    let idx = this.data.currentQuestionIndex;
    let total = this.data.questionList.length;
    if (idx >= total - 1) {
      this.flashKey('submit');
      this.submitScore();
    } else {
      this.flashKey('next');
      this.goToNext();
    }
  },

  onQuickScoreTap: function (e) {
    let value = String(e.currentTarget.dataset.value || '');
    if (!value) return;

    let index = this.data.currentQuestionIndex;
    this._physicalBuffer = value;
    this.updateQuestion(index, { score: value, touched: true });
    this.goToNext();
  },

  goToPrevious: function () {
    let index = this.data.currentQuestionIndex;
    if (index <= 0) return;
    let newIndex = index - 1;
    this.syncCurrentQuestion(newIndex);
    this.scrollToQuestion(newIndex);
  },

  goToNext: function () {
    let index = this.data.currentQuestionIndex;
    let total = this.data.questionList.length;
    if (index >= total - 1) {
      return;
    }
    let newIndex = index + 1;
    this.syncCurrentQuestion(newIndex);
    this.scrollToQuestion(newIndex);
  },

  validateAnswers: function () {
    let nextQuestions = this.data.questionList.slice();
    let answers = [];
    let hasError = false;
    let firstMessage = '';
    let firstInvalidIndex = -1;

    for (let i = 0; i < nextQuestions.length; i++) {
      let item = nextQuestions[i];
      let validation = validateQuestion(item);
      nextQuestions[i] = {
        id: item.id,
        index: item.index,
        templateId: item.templateId,
        templateName: item.templateName,
        templateWeight: item.templateWeight,
        templateSortOrder: item.templateSortOrder,
        showTemplateHeader: item.showTemplateHeader,
        showTemplateFooter: item.showTemplateFooter,
        templateFooterScore: item.templateFooterScore,
        templateFooterMax: item.templateFooterMax,
        question: item.question,
        scoreLabel: item.scoreLabel,
        minValue: item.minValue,
        startValue: item.startValue,
        maxValue: item.maxValue,
        stepValue: item.stepValue,
        score: item.score,
        quickScores: item.quickScores,
        errorText: validation.errorText,
        touched: true
      };

      if (!validation.ok) {
        hasError = true;
        if (firstInvalidIndex === -1) firstInvalidIndex = i;
        if (!firstMessage) firstMessage = localeCopy.copy_6e979f0fec + (i + 1) + localeCopy.copy_6e2b5d44dd + validation.errorText;
        continue;
      }

      answers.push({ questionIndex: i + 1, score: Number(item.score) });
    }

    this.setData({ questionList: nextQuestions });

    if (hasError) {
      return { ok: false, message: firstMessage || localeCopy.copy_62b75ea5c2, firstInvalidIndex: firstInvalidIndex };
    }
    return { ok: true, answers: answers };
  },

  submitScore: function () {
    let self = this;
    if (self.data.readOnly) return;
    let validation = self.validateAnswers();
    if (!validation.ok) {
      if (Number.isInteger(validation.firstInvalidIndex) && validation.firstInvalidIndex >= 0) {
        self.setData({ currentQuestionIndex: validation.firstInvalidIndex, keyboardCollapsed: false });
        self.syncCurrentQuestion();
        self.scrollToQuestion(validation.firstInvalidIndex);
      }
      wx.showToast({ title: validation.message, icon: 'none' });
      return;
    }

    self.setData({ submitting: true });

    let scorer = self.data.scorer || {};
    let target = self.data.target || {};
    callFunction({
      name: 'submitScoreRecord',
      data: {
        scorerId: scorer.id || '',
        scorerAssignmentId: scorer.assignmentId || '',
        targetId: target.assignmentId || self.targetId,
        activityId: self.activityId,
        activityName: self.activityName,
        templateConfigSignature: self.templateConfigSignature,
        answers: validation.answers,
        existingRecordId: self.data.existingRecordId || '',
        existingRecordRevision: self.data.existingRecordRevision || 0
      },
      success: function (res) {
        let result = res.result || {};
        if (result.status !== 'success') {
          if (result.status === 'score_revision_conflict') {
            wx.showToast({ title: result.message || localeCopy.scoreRevisionConflict, icon: 'none' });
            self.setData({ submitting: false });
            self.loadScoreForm();
            return;
          }
          if (self._isWorkContextError(result.status)) {
            self.setData({ submitting: false });
            self._promptWorkContext(result.message);
            return;
          }
          wx.showToast({ title: result.message || localeCopy.copy_8831c65b75, icon: 'none' });
          self.setData({ submitting: false });
          return;
        }
        self._commitCurrentDraft();
        wx.showToast({ title: result.updated || result.revised ? localeCopy.scoreUpdated : localeCopy.copy_69df1816f0, icon: 'success' });
        self._schedule(function () {
          wx.navigateBack({ fail: function () { self.redirectHome(); } });
        }, 1200);
      },
      fail: function () {
        self._schedule(function () {
          callFunction({
            name: 'getScoreFormData',
            data: { targetId: self.targetId },
            success: function (checkRes) {
              let checkResult = checkRes.result || {};
              let checkedRevision = Number(checkResult.existingRecord && checkResult.existingRecord.revisionNumber || 0);
              let revisionAdvanced = self.data.existingRecordRevision > 0
                ? checkedRevision > self.data.existingRecordRevision
                : checkedRevision >= 1;
              if (checkResult.status === 'success' && checkResult.existingRecord && revisionAdvanced) {
                self._commitCurrentDraft();
                wx.showToast({ title: self.data.existingRecordRevision > 0 ? localeCopy.scoreUpdated : localeCopy.copy_69df1816f0, icon: 'success' });
                self._schedule(function () {
                  wx.navigateBack({ fail: function () { self.redirectHome(); } });
                }, 1200);
              } else {
                wx.showToast({ title: localeCopy.copy_8831c65b75, icon: 'none' });
              }
              self.setData({ submitting: false });
            },
            fail: function () {
              wx.showToast({ title: localeCopy.copy_8831c65b75, icon: 'none' });
              self.setData({ submitting: false });
            }
          });
        }, 500);
      }
    });
  },

  redirectHome: function () {
    wx.redirectTo({ url: '/subpackages/workspace/pages/home/home?subApp=scoring' });
  },

  getKeyboardHeightRpx: function () {
    if (this.data.keyboardCollapsed) return 88;
    if (this.data.keyboardMode === 'numpad') return 594;
    // Quick mode: nav(80) + action(80) + rows + safe-area(34)
    let rowCount = this.data.quickScoreRows.length;
    let quickContent = Math.min(rowCount * 94 + 4, 420);
    return 160 + quickContent + 34;
  },

  scrollToQuestion: function (index) {
    let self = this;
    let selector = '#question-' + index;
    wx.createSelectorQuery()
      .select(selector)
      .boundingClientRect()
      .selectViewport()
      .scrollOffset()
      .exec(function (res) {
        let rect = res[0];
        let scrollInfo = res[1];
        if (!rect || !scrollInfo) {
          wx.pageScrollTo({
            selector: selector,
            duration: 280,
            offsetTop: 200,
            success: function () { self._checkSticky(); },
            fail: function () {}
          });
          return;
        }

        let windowInfo = wx.getWindowInfo();
        let windowHeight = windowInfo.windowHeight;
        let windowWidth = windowInfo.windowWidth;
        let keyboardRpx = self.getKeyboardHeightRpx();
        let keyboardPx = (windowWidth / 750) * keyboardRpx;
        let visibleHeight = windowHeight - keyboardPx;
        let targetTop = (visibleHeight - rect.height) / 2;
        if (targetTop < 0) targetTop = 0;

        let newScrollTop = Math.max(0, scrollInfo.scrollTop + rect.top - targetTop);
        wx.pageScrollTo({
          scrollTop: newScrollTop,
          duration: 280,
          success: function () { self._checkSticky(); },
          fail: function () {}
        });
      });
  },

  _checkSticky: function () {
    let self = this;
    if (!self.data.target || !self.data.target.name) return;
    wx.createSelectorQuery()
      .select('.target-name-anchor')
      .boundingClientRect(function (rect) {
        if (rect) {
          self.setData({ showStickyTarget: rect.top < 0 });
        }
      })
      .exec();
  }
});
