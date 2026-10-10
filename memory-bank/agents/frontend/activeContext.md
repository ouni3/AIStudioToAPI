# activeContext.md (frontend / L3前端UI画师/糖衣伪装/凛)

> **[EVOLUTION_CONTRIBUTION]** (Phase 11 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 规范账号列表项启用/停用开关交互，提供防抖 loading 与事件穿透隔离，确保账号管理状态机安全响应。
> - $L_{User}$: **+** 账号状态直观可见一键开关，消除切号与账号启停的心智摩擦与误触概率。
> - $S_{total}$: **+** 遵守 Design Tokens 与 Element Plus 变体样式契约，消灭孤儿硬编码异色与样式污染。
> - `ect`: **A** (count(+)=3, count(-)=0)
> - `verdict`: **KEEP**

[ACT_SELF_EVAL] op=account_enable_disable_ui confidence=100% hits=3/3 branch=none

## 核心避坑与组件交互规范 (Key Design Patterns & Pitfalls)
1. **列表行级选择与按钮点击事件隔离 (@click.stop)**: 当列表卡片或列表行外层绑定整行点击事件（如选中复选框 `toggleSelectAccount`）时，行内的 Switch、操作按钮及外层包装容器必须显式追加 `@click.stop`，防止点击开关时意外改变多选态。
2. **ElSwitch 异步拦截防抖与即时 Loading**: 使用 `:loading` 绑定行索引活跃集合 `accountStatusUpdatingIndices.has(item.index)`，并配置 `:before-change` 返回异步 Promise。在请求飞行期间设置禁用与加载态，请求失败时返回 `false` 触发 Element Plus 自动回滚，无缝维持视觉与状态一致性。
3. **自适应行内紧凑 Switch 样式契约**: 列表行紧凑场景使用 `size="small"` 与 `inline-prompt`，`--el-switch-on-color` 严格对接 `@success-color`，`--el-switch-off-color` 对接 `--color-border-hover`，高度与圆角严格符合 Design Tokens 规范（22px 高度 / 12px 圆角）。
4. **当前账号禁用后联动状态刷新**: 禁用当前运行中的账号时后端会自动切号，前端成功提示后必须立刻调用 `updateContent()` 重新获取全量状态列表，确保高亮徽章与当前运行账号即时同步。
