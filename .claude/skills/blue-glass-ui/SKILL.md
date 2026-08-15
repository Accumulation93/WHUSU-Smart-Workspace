# Blue Glass UI 兼容入口

本文件不再维护第二套 UI 规范。蓝色轻奢玻璃风的唯一实施规范位于：

- `.agents/skills/blue-glass-ui/SKILL.md`
- `docs/ui-kit.md`
- `docs/ui-components.md`
- `docs/ui-page-templates.md`

调用本路径时，必须先读取上述事实来源；其中 `miniprogram/app.wxss` 是运行时令牌和弹窗视口几何的唯一入口，业务页面不得复制或覆盖另一套弹窗定位、设备断点或坐标契约。
