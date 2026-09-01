'use strict';

function getPasswordRequiredMessage(studentId, passphrase, messages) {
  const hasStudentId = Boolean(String(studentId || '').trim());
  const hasPassphrase = Boolean(String(passphrase || ''));
  if (!hasStudentId && !hasPassphrase) return messages.passwordRequired;
  if (!hasStudentId) return messages.passwordStudentIdRequired;
  if (!hasPassphrase) return messages.passwordPassphraseRequired;
  return '';
}

module.exports = { getPasswordRequiredMessage };
