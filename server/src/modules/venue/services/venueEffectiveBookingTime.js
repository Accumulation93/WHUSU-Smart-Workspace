'use strict';

function effectiveBookingStart(originalStart, approvedAt) {
  const original = originalStart instanceof Date ? originalStart : new Date(originalStart);
  const approved = approvedAt instanceof Date ? approvedAt : new Date(approvedAt);
  if (Number.isNaN(original.getTime()) || Number.isNaN(approved.getTime())) {
    const error = new TypeError();
    error.code = 'invalid_booking_time';
    throw error;
  }
  return approved > original ? approved : original;
}

module.exports = { effectiveBookingStart };
