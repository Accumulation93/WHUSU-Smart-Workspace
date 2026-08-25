'use strict';

const BOOKING_PURPOSE_MAX_LENGTH = 200;

function unicodeLength(value) {
  return Array.from(String(value || '')).length;
}

function isBookingPurposeLengthValid(value) {
  return unicodeLength(value) <= BOOKING_PURPOSE_MAX_LENGTH;
}

module.exports = {
  BOOKING_PURPOSE_MAX_LENGTH,
  unicodeLength,
  isBookingPurposeLengthValid
};
