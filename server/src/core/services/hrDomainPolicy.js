'use strict';

function countUserCharacters(value) {
  return Array.from(String(value == null ? '' : value)).length;
}

module.exports = {
  countUserCharacters
};
