'use strict';

function format(template, values) {
  return String(template || '').replace(/\{(\d+)\}/g, function(_, index) {
    const value = values && values[Number(index)];
    return value == null ? '' : String(value);
  });
}

module.exports = Object.freeze({ format });
