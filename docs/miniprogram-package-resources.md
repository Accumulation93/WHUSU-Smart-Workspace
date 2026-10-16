# 小程序主包与分包资源

2026-10-16 起，语言唯一来源仍为 `shared/locales/**`，网页继续读取原有生成副本。`web.js` 和三个已退役的小程序语言文件不再生成到小程序目录。不能为了消除主包未使用提示，在 app.js 或门户中增加无业务用途的 require。

`scripts/miniprogram-package-resources.js` 从 app.js、主包页面、全局组件、全部分包页面和 JSON 组件注册构建依赖图，使用 JS 语法树解析真实 require，忽略注释及字符串里的伪引用，动态 require 无法确定时直接失败。主包实际使用的资源保留；仅业务分包使用的资源生成到对应 `subpackages/<模块>/package-resources/`，多分包共用时各生成一份，禁止跨分包引用。

公共组件和工具的原路径仍是唯一维护入口，例如 `miniprogram/components/personnel-picker/`。这些维护源及其语言副本可以被 Node 测试读取，但会逐文件加入 project.config.json 的上传排除清单，不进入主包。原有页面与组件注册指向当前分包的生成副本，副本内容必须与维护源一致，仅调整相对依赖路径。WXML 和 WXSS 原样复制，不改布局。共同会话、事件总线等主包已使用的模块仍由主包唯一提供，不在分包复制运行状态。

修改文案仍只修改 shared/locales；修改组件仍只修改原组件目录。随后执行 `node scripts/sync-shared-modules.js --write`，它同时更新语言副本、分包副本、页面引用和上传清单。`scripts/miniprogram-package-sources.json` 记录自动管理的排除条目，资源归属变为主包时自动撤销对应排除。生成目录禁止手改；未使用或过期的生成文件会被清除。

校验模式核对每个副本内容、入口引用、上传排除和实际打包依赖，拒绝引用被排除文件、跨分包依赖、主包未使用 JS 和无调用方 JS。原严格 UI 与生命周期检查仍执行，只有经逐字校验的生成文件可复用原公共组件/工具的检查规则。回归测试为 `server/test/miniprogramPackageResources.test.js`，完整本机 CI 中通过共享模块一致性检查执行实际资源检查。

实际微信主包及全部分包编译结果、包体积与发布结果按本次提交核对。静态图不代表所有页面已在实体设备点击验收；本次不修改视觉和交互。
