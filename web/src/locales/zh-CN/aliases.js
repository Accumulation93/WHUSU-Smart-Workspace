/**
 * 语言库结构别名。
 *
 * 共享语言库的模块是"按值平铺"的（生成器把嵌套对象摊平成语义引用），而页面与测试
 * 里用的是带层级的写法（copy.messages.view.todos、copy.portal.cards.messages 等）。
 * 这里只做同一份文案的别名映射，不新写任何一句文案，唯一来源仍然是 shared/locales。
 */

const GROUP_KEYS = ['view', 'messages', 'cards', 'workContext', 'statusLabels', 'stepStatusLabels', 'actionLabels', 'categoryLabels'];

/** 把模块自身的平铺键同时挂到历史层级键上，两边的取值完全相同。 */
function withAliases(module) {
  if (!module || typeof module !== 'object') return module;
  const alias = {};
  Object.keys(module).forEach((key) => {
    alias[key] = module[key];
  });
  GROUP_KEYS.forEach((group) => {
    if (!alias[group]) alias[group] = module;
  });
  alias.self = module;
  return Object.freeze(alias);
}

export default withAliases;
