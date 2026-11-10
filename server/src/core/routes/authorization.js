'use strict';

const router = require('express').Router();
const pool = require('../../config/db');
const model = require('../models/authorization');
const inspection = require('../services/authorizationInspection');
const access = require('../services/authorizationAccess');
const dictionaries = require('../models/dictionaryAuthorization');
const natures = require('../services/assignmentNatureManagement');
const configCopy = require('../services/organizationConfigCopy');
const { referenceFromRequest, createGuard, readManagement, readCandidates } = require('../services/authorizationManagement');
const copy = require('../../locales/zh-CN/authorization');

const ERRORS = Object.freeze({
  authorization_forbidden: [403, 'forbidden'],
  authorization_actor_missing: [403, 'forbidden'],
  authorization_conflict: [409, 'conflict'],
  authorization_stale_reference: [409, 'staleReference'],
  authorization_organization_missing: [403, 'forbidden'],
  authorization_scheme_unpublished: [409, 'unpublishedScheme'],
  invalid_authorization_name: [400, 'invalidName'],
  invalid_authorization_policy: [400, 'invalidPolicy'],
  invalid_authorization_selection: [400, 'invalidPolicy'],
  invalid_authorization_capabilities: [400, 'invalidPolicy'],
  invalid_authorization_delegation: [400, 'invalidPolicy'],
  assignment_nature_invalid: [400, 'invalidNature'],
  assignment_nature_name_invalid: [400, 'invalidName'],
  assignment_nature_description_invalid: [400, 'invalidPolicy'],
  assignment_nature_duplicate: [409, 'duplicateNature'],
  assignment_nature_in_use: [409, 'natureInUse'],
  assignment_nature_legacy_required: [409, 'legacyNatureRequired'],
  config_copy_invalid: [400, 'copyInvalid'],
  config_copy_conflict: [409, 'copyConflict'],
  config_copy_missing: [404, 'copyMissing'],
  config_copy_unavailable: [409, 'copyUnavailable'],
  config_copy_unsupported: [400, 'copyUnsupported'],
  config_copy_duplicate: [409, 'copyDuplicate'],
  config_copy_reference: [409, 'copyReference'],
  config_copy_approval_conflict: [409, 'copyApprovalConflict']
});

function handler(work) {
  return async (req, res) => {
    try {
      const reference = referenceFromRequest(req);
      if (!reference) return res.status(401).json({ status: 'unauthorized', message: copy.loginRequired });
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ status: 'invalid_params', message: copy.invalidPolicy });
      }
      const data = await work(req.body, reference, createGuard(reference));
      return res.json(Object.assign({ status: 'success' }, data));
    } catch (error) {
      const expected = ERRORS[error.code];
      if (expected) return res.status(expected[0]).json({ status: error.code, message: copy[expected[1]] });
      if (req.logger) req.logger.error('Authorization operation failed', { code: error.code || 'unexpected_error' });
      return res.status(500).json({ status: 'error', message: copy.operationFailed });
    }
  };
}

router.post('/getCurrentAuthorizationAccess', handler((_body, reference) => pool.withTransaction(connection => access.current(connection, reference))));
router.post('/listAuthorizedDictionary', handler((body, reference) => dictionaries.list(body.kind, reference)));
router.post('/getAuthorizationManagement', handler((_body, reference) => pool.withTransaction(connection => readManagement(connection, reference))));
router.post('/getEffectiveAuthorization', handler((body, reference) => pool.withTransaction(connection => inspection.inspect(connection, reference, body))));
router.post('/listAssignmentNatures', handler((_body, reference) => natures.list(reference)));
router.post('/saveAssignmentNature', handler((body, reference) => natures.save(body, reference)));
router.post('/deleteAssignmentNature', handler((body, reference) => natures.remove(body, reference)));
router.post('/getAuthorizationCandidates', handler((body, reference) => pool.withTransaction(connection => {
  if (body.purpose === 'inspection') return inspection.inspectableCandidates(connection, reference);
  if (body.purpose !== undefined) throw Object.assign(new Error('invalid_authorization_selection'), { code: 'invalid_authorization_selection' });
  return readCandidates(connection, reference);
})));
router.post('/previewAuthorizationRule', handler((body, reference, guard) => model.previewRule(body, reference.organizationId, guard)));
router.post('/saveAuthorizationRule', handler(async (body, reference, guard) => ({ rule: await model.saveRule(body, reference.organizationId, guard) })));
router.post('/deleteAuthorizationRules', handler((body, reference, guard) => model.deleteRules(body, reference.organizationId, guard)));
router.post('/previewAuthorizationRuleDeletion', handler((body, reference, guard) => model.previewRuleDeletion(body, reference.organizationId, guard)));
router.post('/saveAuthorizationScheme', handler(async (body, reference, guard) => ({ scheme: await model.saveScheme(body, reference.organizationId, guard) })));
router.post('/previewAuthorizationScheme', handler((body, reference, guard) => model.previewScheme(body, reference.organizationId, guard)));
router.post('/getAuthorizationSchemeVersions', handler((body, reference, guard) => model.schemeVersions(body, reference.organizationId, guard)));
router.post('/publishAuthorizationScheme', handler((body, reference, guard) => model.publishScheme(body, reference.organizationId, guard)));
router.post('/saveAuthorizationDelegation', handler(async (body, reference, guard) => ({ delegation: await model.saveDelegation(body, reference.organizationId, guard) })));
router.post('/previewAuthorizationDelegation', handler((body, reference, guard) => model.previewDelegation(body, reference.organizationId, guard)));
router.post('/previewAuthorizationDelegationDeletion', handler((body, reference, guard) => model.previewDelegationDeletion(body, reference.organizationId, guard)));
router.post('/deleteAuthorizationDelegation', handler((body, reference, guard) => model.deleteDelegation(body, reference.organizationId, guard)));
router.post('/shareOrganizationConfiguration', handler((body, reference) => configCopy.share(body, reference)));
router.post('/revokeOrganizationConfigurationShare', handler((body, reference) => configCopy.revoke(body, reference)));
router.post('/listSharedOrganizationConfigurations', handler((body, reference) => configCopy.available(body, reference)));
router.post('/receiveOrganizationConfiguration', handler((body, reference) => configCopy.receive(body, reference)));
router.post('/getOrganizationConfigurationDraft', handler((body, reference) => configCopy.detail(body, reference)));
router.post('/applyOrganizationConfigurationDraft', handler((body, reference) => configCopy.apply(body, reference)));
router.post('/enableOrganizationConfiguration', handler((body, reference) => configCopy.enable(body, reference)));
router.post('/getOrganizationConfigurationWorkspace', handler((body, reference) => configCopy.workspace(body, reference)));
router.post('/getOrganizationConfigurationCandidates', handler((body, reference) => configCopy.candidates(body, reference)));

module.exports = router;
