# 我的 Pi 精简配置

[English](README.md)

这是一份聚焦于 [Pi coding agent](https://github.com/earendil-works/pi) 上下文优化组件的指南，并推荐少量经过 lean 处理的常用工具。

本仓库只提供文档，不包含安装器、复制版配置、私人端点或 API 凭据。请阅读各链接项目的 README，并且只安装自己需要的组件。

## 上下文优化组件

这些组件分别处理上下文消耗的不同环节，是这套配置的重点。

### 1. billion-context-pi-lean

[billion-context-pi-lean](https://github.com/kunkun9527/billion-context-pi-lean) 是长会话的主要上下文组件。它在 [Billion Context](https://github.com/ranxianglei/billion-context-pi) 上提供紧凑的 `compress` + `acp_context` 接口，同时保留上游压缩与恢复引擎。

它适合用于：

- 将已经使用完的对话区间替换为高密度摘要；
- 相关细节再次需要时，恢复已压缩内容；
- 避免每轮都暴露完整上游工具接口，同时让长会话保持可用。

### 2. pi-slim

[pi-slim](https://github.com/robzolkos/pi-slim) 将 Pi 反复出现的文档指导改为按需启用，从而缩减基础 prompt。

这是对静态 prompt 文本的直接削减，通常也是最适合优先添加的组件。

### 3. Headroom / noheadroom

[Headroom / noheadroom](https://www.npmjs.com/package/@raquezha/noheadroom) 会压缩庞大的上下文和工具结果，避免它们挤占真正有用的工作信息。

它与 Billion Context 互补：Headroom 控制进入或留在活动上下文中的庞大内容，Billion Context 则负责较早对话区间的管理和后续恢复。

### 4. RTK 与 pi-rtk-optimizer

[RTK](https://github.com/rtk-ai/rtk) 和 [pi-rtk-optimizer](https://github.com/MasuRii/pi-rtk-optimizer) 会减少冗长的 shell 命令输出，并自动改写受支持的命令。

它从源头节省上下文：让精简后的命令输出进入对话，而不是等冗长输出已经占用空间后再压缩。

### 5. pi-context-view

[pi-context-view](https://github.com/dimk90/pi-context-view) 会显示基础 prompt、工具定义、扩展注入和对话内容分别使用了多少上下文。

它是观测工具，不是压缩器。可以用它测量修改前后的配置，并找出下一个主要上下文开销来源。

## 各组件如何配合

| 环节 | 组件 | 目的 |
| --- | --- | --- |
| 静态 prompt | `pi-slim` | 删除反复出现的文档指导。 |
| 工具与命令输出 | RTK + `pi-rtk-optimizer` | 避免冗长 shell 输出进入上下文。 |
| 活动上下文 | Headroom / noheadroom | 压缩庞大的结果和活动内容。 |
| 长会话历史 | `billion-context-pi-lean` | 压缩已使用区间，并按需恢复细节。 |
| 测量 | `pi-context-view` | 显示上下文成本并验证优化效果。 |

## 推荐的 lean 常用工具

下面是常用的 Pi 工具。它们缩小了模型可见接口，同时不刻意删除上游 runtime 行为。

### pi-subagents-lean

[pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean) 将 subagent 操作整合到一个紧凑 schema 中，并按需提供帮助。

它保留发现、前台和后台执行、结果、引导、渲染以及生命周期行为。安装后应检查每个已发现 agent 的模型、prompt、工具和扩展白名单，并删除不需要的 agent 类型。

### pi-web-access-lean

[pi-web-access-lean](https://github.com/kunkun9527/pi-web-access-lean) 将网页搜索、检查、抓取和续取整合到一个紧凑的操作 schema 中。

详细参数通过按需帮助提供，不必在每轮模型上下文中重复出现。

### pi-hashline-edit-pro-lean

[pi-hashline-edit-pro-lean](https://github.com/kunkun9527/pi-hashline-edit-pro-lean) 提供紧凑的锚点读取、替换和撤销工具，同时保留 Hashline 的行安全编辑模型。

它适合需要可靠编辑、但不希望每次请求都发送庞大编辑工具 schema 的场景。

### rpiv-ask-user-question-lean

[rpiv-ask-user-question-lean](https://github.com/kunkun9527/rpiv-ask-user-question-lean) 用更小的 schema 保留结构化澄清 UI 和验证行为。

当 agent 需要用户明确选择，而不是自由格式追问时，可以使用它。

### rpiv-todo-lean

[rpiv-todo-lean](https://github.com/kunkun9527/rpiv-todo-lean) 将任务管理缩减为一个紧凑的操作 schema，同时保留任务状态、依赖关系、负责人和生命周期操作。

它最适合需要保持进度可见且可恢复的多步骤工作。

## 建议采用顺序

1. 安装 `pi-context-view`，记录当前上下文构成。
2. 添加 `pi-slim`，缩减静态 prompt。
3. 如果 shell 输出是主要噪声来源，添加 RTK 和 `pi-rtk-optimizer`。
4. 添加 Headroom，处理庞大的活动上下文和工具结果。
5. 添加 `billion-context-pi-lean`，处理长会话压缩与恢复。
6. 只将自己实际使用的常用工具替换为对应 lean 版本。
7. 再次使用 `pi-context-view` 测量。

## 安装规则

- 按照各链接仓库中的安装说明操作。
- 不要同时加载上游扩展及其 lean wrapper；重复注册会浪费上下文，也可能发生冲突。
- 只添加工作流实际使用的 lean 工具。
- 升级 wrapper 前检查其固定的上游版本。
- 依赖更新后重新执行各仓库文档中的检查。
- 将机器专用集成、供应商配置、端点和密钥留在公开配置之外。

## 本仓库不介绍的内容

本指南刻意不介绍我的供应商扩展、账户管理器、模型加速选项、通知、视觉配置、工作流模式及其他私人体验插件。它们与上面的核心上下文优化组件和可移植 lean 工具推荐无关。

## 许可证与归属

本仓库是文档。每个链接项目保留各自的许可证、作者归属和支持政策。各 lean 仓库已在自己的 README 与 package metadata 中保留上游归属。
