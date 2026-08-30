# 我的 Pi 精简配置

[English](README.md)

这是我的 [Pi coding agent](https://github.com/badlogic/pi-mono) 配置导航，涵盖 token/上下文优化与日常体验增强。

本仓库只提供文档，不包含安装器、复制版配置或 API 凭据。请阅读各项目链接中的 README，并且只添加自己需要的组件。

## 设计目标

1. 减少模型可见的工具 schema 和反复出现的 system prompt 文本。
2. 通过压缩和输出控制，让长会话持续可用。
3. 保留上游 runtime 行为，而不是重新实现一套。
4. 不让本地 UI 集成进入公开插件。
5. 将供应商路由、加速和通知视为体验优化，而不是 token 优化。

## Token 与上下文优化

### 我维护的 lean wrapper

| 项目 | 作用 | 保留的能力 |
| --- | --- | --- |
| [billion-context-pi-lean](https://github.com/kunkun9527/billion-context-pi-lean) | 在 Billion Context 上提供精简的 `compress` + `acp_context` 接口。 | 上游上下文引擎与恢复操作。 |
| [rpiv-todo-lean](https://github.com/kunkun9527/rpiv-todo-lean) | 将任务工具缩减为一个紧凑的操作 schema。 | 完整任务生命周期与依赖管理。 |
| [rpiv-ask-user-question-lean](https://github.com/kunkun9527/rpiv-ask-user-question-lean) | 用更小的 schema 保留结构化澄清。 | 上游提问 UI 与验证逻辑。 |
| [pi-hashline-edit-pro-lean](https://github.com/kunkun9527/pi-hashline-edit-pro-lean) | 提供精简的锚点读取、替换和撤销工具。 | Hashline 的行安全编辑模型。 |
| [pi-web-access-lean](https://github.com/kunkun9527/pi-web-access-lean) | 用单一 schema 整合网页操作，按需提供帮助。 | 上游搜索、抓取、验证和续取行为。 |
| [pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean) | 用单一 schema 整合 subagent 操作，按需提供帮助。 | 发现、前台/后台执行、结果、引导、渲染和生命周期行为。 |

安装 wrapper 前，应删除或禁用对应的上游扩展项。同时加载两者会产生重复工具，也会破坏节省 token 的目标。

### 其他上下文优化组件

| 组件 | 作用 | 重要说明 |
| --- | --- | --- |
| [pi-slim](https://github.com/robzolkos/pi-slim) | 将 Pi 反复注入的文档指导改为按需启用。 | 直接减少 system prompt。 |
| [Billion Context](https://github.com/ranxianglei/billion-context-pi) | 压缩和恢复较早的对话区间。 | 我的配置通过 `billion-context-pi-lean` 使用它。 |
| [Headroom / noheadroom](https://www.npmjs.com/package/@raquezha/noheadroom) | 压缩庞大的上下文和工具结果。 | 我的 cache-mode fork 仅在本地；其他用户应以上游项目为可移植起点。 |
| [pi-rtk-optimizer](https://github.com/MasuRii/pi-rtk-optimizer) + [RTK](https://github.com/rtk-ai/rtk) | 重写 shell 命令并压缩受支持命令的输出。 | 我的本地 fork 保留 RTK 默认全局历史数据库，未在此发布。 |
| [pi-context-view](https://github.com/dimk90/pi-context-view) | 展示上下文消耗在哪里。 | 它只负责诊断，本身不会减少上下文。 |

### Prompt cache 保温不是压缩

[pi-warm-cache](https://github.com/ribbons-digital/pi-warm-cache) 会在空闲间隔内保活受支持供应商的 prompt cache。它**不是**压缩插件，也**不会**减少发送给供应商的 token 总量。每次 warm probe 都是真实 completion，可能消耗缓存输入、非缓存输入、cache write 和输出 token。

只有在供应商路线受支持，并且预期缓存折扣高于 probe 成本时才应启用。应查看 `/warm` 和 `/warm savings`，不要假设它一定节省费用或额度。

## 体验优化

### 供应商访问与速度

| 组件 | 作用 |
| --- | --- |
| [pi-multi-provider-manager](https://www.npmjs.com/package/pi-multi-provider-manager) | 管理多个供应商账户和部分 API-key 供应商。 |
| [pi-opencode-bridge](https://www.npmjs.com/package/pi-opencode-bridge) | 发现 OpenCode 模型，并通过 Pi 的兼容供应商路径接入。 |
| 本地 OpenAI-compatible 供应商注册 | 添加私有或自托管兼容端点；端点和凭据配置必须留在本地。 |
| [pi-openai-fast](https://github.com/diegopetrucci/pi-extensions) | 为受支持的 OpenAI Codex 模型启用 priority service tier；这可能改变供应商费用或额度行为。 |
| [pi-fireworks-quota](https://github.com/ZeR020/pi-fireworks-quota) | 显示 Fireworks 余额、支出、token 和限制信息。 |

供应商扩展不会自动节省 token。它们的价值在于路由、账户管理、可用性、速度或可观测性。

### 工作流与界面

| 组件 | 作用 |
| --- | --- |
| [pi-notify](https://github.com/diegopetrucci/pi-extensions) | Pi 等待输入时发送通知。 |
| [@getpipher/vision](https://github.com/getpipher/vision) | 提供感知模型能力的图片处理；我的 OpenAI Responses/collapsed-display 改动仅在本地。 |
| [pi-mainflow](https://github.com/fghosth/pi-mainflow) | 提供分阶段规划与实现工作流。 |
| [@narumitw/pi-goal](https://github.com/narumiruna/pi-extensions) | 执行专注于单一目标的自主工作流。 |
| [pi-ponytail](https://github.com/thelegendtubaguy/pi-ponytail) | 提供可选的高级开发者工作模式。 |
| [pi-pwsh-native](https://github.com/takomine/pi-pwsh-native) | 改善 Windows 上的原生 PowerShell 工作流。 |

## Subagent 配置

我的专用 agent 使用显式扩展白名单，使每个角色只获得所需工具。只有在确实需要时，通用 worker agent 才会继承全部已启用扩展。

安装 [pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean) 后：

1. 检查每个已发现的 agent 定义及其 `model`。
2. 删除不需要的 agent 类型。
3. 按自己的工作流重命名或修改 prompt、tools 和扩展白名单。
4. 检查全局、工作区和项目位置中的同名 agent，因为上游发现优先级可能选择与你预期不同的定义。
5. 只在某个角色确实有用时，才给该 subagent 添加 token 优化扩展。

在某个 subagent 进程中加载 cache warmer，只会保活该进程的供应商缓存，不会自动保活其他 agent 会话。

## 公开插件与我的本地配置

上面的公开仓库刻意**不依赖我的本地 collapsed-tool display service**，因此其他 Pi 用户可以直接使用。

在我的活动安装中，每个仓库都检出在私有 `local-collapsed-compat` 分支，该分支恢复可选的显示集成。这些本地专用提交不会推送到 GitHub。核心代码和文档仍可从公开 `main` 同步，同时将 UI 专用补丁留在本地。

其他未发布的定制——例如折叠工具渲染、cache-mode 默认值、私有供应商端点和本地工作流 fork——只是我机器上的实现细节，不是这些公开插件的安装要求。

## 建议采用顺序

1. 先用 `pi-context-view` 测量当前 prompt 和工具 schema 成本。
2. 添加 `pi-slim`。
3. 只将自己实际使用的大型工具替换为对应 lean wrapper。
4. 添加一种压缩策略，并在依赖它之前确认恢复功能正常。
5. 按角色配置 subagent 白名单。
6. 单独添加供应商与工作流便利功能。
7. 只有在测量供应商缓存行为和 probe 成本后，才考虑 `pi-warm-cache`。

## 维护规则

- 升级 lean wrapper 前固定或审查上游版本。
- 不要同时加载上游扩展和对应 lean wrapper。
- 依赖更新后，重新执行每个仓库文档中的检查。
- 不要将密钥和机器专用端点提交到仓库。
- 不只比较 schema 大小，也要比较行为：lean wrapper 应保留上游 runtime 契约。

## 许可证与归属

本仓库是文档。每个链接项目保留各自的许可证、作者归属和支持政策。各 lean 仓库已在自己的 README 与 package metadata 中保留上游归属。
