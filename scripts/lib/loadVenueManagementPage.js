'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 测试真实 Page 壳与正式 Behavior 的组合，不改写生产注册方式。
module.exports = function loadVenueManagementPage(environment) {
  const base = path.resolve(__dirname, '../../miniprogram/subpackages/venue/pages/venueManage');
  let page;
  const merge = definition => {
    const output = { data: {}, methods: {} };
    for (const behavior of definition.behaviors || []) {
      const inherited = merge(behavior || {});
      Object.assign(output.data, inherited.data);
      Object.assign(output.methods, inherited.methods);
    }
    Object.assign(output.data, definition.data || {});
    Object.assign(output.methods, definition.methods || {});
    return output;
  };
  const context = { ...environment,
    Page(definition) {
      const combined = merge(definition);
      page = { ...combined.methods, ...definition, data: combined.data };
    },
    require(name) {
      if (name === './venueManagementBehavior') {
        const child = { ...environment, module: { exports: {} }, Behavior: value => value };
        const filename = path.join(base, 'venueManagementBehavior.js');
        vm.runInNewContext(fs.readFileSync(filename, 'utf8'), child, { filename });
        return child.module.exports;
      }
      return environment.require(name);
    }
  };
  const filename = path.join(base, 'venueManage.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return page;
};
