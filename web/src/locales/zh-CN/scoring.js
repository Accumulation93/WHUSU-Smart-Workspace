// 由 scripts/locale-align.js 从共享语言库生成，请勿直接修改。
// 唯一来源：shared/locales/zh-CN/**；改文案请改共享语言库后重新运行本脚本。
import src_admin from './shared/generated/subpackages/scoring/pages/admin/admin.js';
import src_score from './shared/generated/subpackages/scoring/pages/score/score.js';
import src_scorerTasks from './shared/generated/subpackages/scoring/pages/scorerTasks/scorerTasks.js';
import src_home from './shared/home.js';
import src_web from './shared/web.js';

export default Object.freeze({
  navigationTitle: src_admin.navigationTitle,
  title: src_admin.copy_33a502217d,
  taskTitle: src_scorerTasks.copy_3a550fe14c,
  taskNote: src_web.scoring.taskNote,
  fillTitle: src_score.copy_1f4d77229c,
  adminTitle: src_web.scoring.adminTitle,
  activityLabel: src_admin.copy_22123f353c,
  activityEmpty: src_score.copy_400aa44fd7,
  activityWindowClosed: src_web.scoring.activityWindowClosed,
  progressLabel: src_web.scoring.progressLabel,
  progressText: src_web.scoring.progressText,
  scoreStatusScored: src_web.scoring.scoreStatusScored,
  scoreStatusPending: src_home.text.pendingScore,
  actionOpenScore: src_web.scoring.actionOpenScore,
  actionRewriteScore: src_web.scoring.actionRewriteScore,
  actionBackToTasks: src_web.scoring.actionBackToTasks,
  targetLabel: src_admin.copy_00ed459adb,
  targetListEmpty: src_admin.copy_1f4cbedfa9,
  loadFailed: src_web.scoring.loadFailed,
  submitFailed: src_web.scoring.submitFailed,
  submitDone: src_web.scoring.submitDone,
  submitting: src_web.audit.createSubmitting,
  actionSubmit: src_web.scoring.actionSubmit,
  readOnlyNotice: src_web.scoring.readOnlyNotice,
  readOnlyReason: src_web.scoring.readOnlyReason,
  existingRecordNotice: src_web.scoring.existingRecordNotice,
  revisionConflict: src_web.scoring.revisionConflict,
  questionRequired: src_web.scoring.questionRequired,
  questionRange: src_web.scoring.questionRange,
  questionStep: src_web.scoring.questionStep,
  totalLabel: src_web.scoring.totalLabel,
  templateWeightLabel: src_admin.copy_30e235fb56,
  scoreLabel: src_admin.copy_7dce1d98a1,
});
