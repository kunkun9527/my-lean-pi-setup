# 我的 Pi 精简配置

[English](README.md)

一套面向 [Pi coding agent](https://github.com/earendil-works/pi) 的上下文优化配置，以及五个模型可见接口经过精简的常用工具。

## 为什么制作这些 lean 版本

这些包装层最初只是为了自用；后来觉得它们也可能帮助其他 Pi 用户，所以将其开源。

Pi 的吸引力之一是精简、可控的上下文。有些插件非常好用，但会在每次请求中携带很长的工具描述，持续消耗大量 tokens，这与精简上下文的目标相悖。这些 lean 包装层缩短模型可见描述，同时保留上游运行时和功能。能力较强的现代 LLM 通常不需要重复、过度复杂的指令，也能可靠使用清晰的工具 schema。

更新包装层也很直接：让 agent 对照审查上游变更与 lean 版本，检查 API、schema 或运行时是否存在破坏性变化；必要时更新固定依赖和适配代码，然后运行测试并重新测量上下文占用。

## 实测初始化上下文占用

下列数字衡量反复发送给模型的初始化上下文，而非一次性的进程内存。

### 测量方法

- Pi `0.84.4`、`pi-context-view` `0.4.3`，选择的模型为 `GPT-5.6-SOL`。
- 每个扩展都在全新的内存会话中单独加载，并排除 Pi 自带工具、skills、context files、消息和无关扩展。
- 计算口径与 `/context injections` 一致：工具元数据、相关提示指引和扩展注入的 system prompt。纯运行时 UI 和 slash commands 不计入。
- Context View 按 `ceil(字符数 / 4)` 估算；这些是可复现的估值，不是 GPT tokenizer 的精确计数。
- 原版对比使用各 lean wrapper 固定的上游版本；更新后结果可能变化。

### 上下文组件

| 组件 | 初始化上下文影响 | 解读 |
| --- | ---: | --- |
| `billion-context-pi-lean` | **675 tokens** | 原版 `billion-context-pi@0.1.52`：**6,061**。节省 **5,386（88.9%）**。 |
| `pi-slim@0.2.1` | **净减少 309 tokens** | 从实测基础 prompt 中删除 1,236 个字符的 Pi 文档指导。 |
| Headroom / 本地 noheadroom | **初始化 0 tokens** | 在运行期减少上下文和工具结果增长。 |
| RTK + `pi-rtk-optimizer` | **初始化 0 tokens** | 实测 rewrite 配置使用运行期 hooks 和 shell rewriting；可选指引会使结果不为零。 |
| `pi-context-view@0.4.3` | **初始化 0 tokens** | 添加观察器和 slash command，不添加模型可见工具或指令。 |

初始化为零不代表运行期没有收益：Headroom 和 RTK 减少后续上下文增长，`pi-context-view` 负责测量。

### Lean wrapper 对比

| Wrapper | Lean | 固定的原版 | 节省 | 降幅 |
| --- | ---: | ---: | ---: | ---: |
| `billion-context-pi-lean` | **675** | 6,061 | 5,386 | **88.9%** |
| `pi-subagents-lean` | **268** | 1,416 | 1,148 | **81.1%** |
| `pi-web-access-lean` | **141** | 2,376 | 2,235 | **94.1%** |
| `pi-hashline-edit-pro-lean` | **351** | 1,410 | 1,059 | **75.1%** |
| `rpiv-ask-user-question-lean` | **215** | 1,258 | 1,043 | **82.9%** |
| `rpiv-todo-lean` | **256** | 904 | 648 | **71.7%** |
| **合计** | **1,906** | **13,425** | **11,519** | **85.8%** |

六个 lean wrapper 的初始化上下文合计约为固定原版接口的七分之一。只要工具保持启用，这部分节省就会反复出现；供应商的 prompt cache 可能降低实际计费差异。

### 每个工具明细

| 插件 | Lean 接口 | 原版接口 |
| --- | --- | --- |
| Billion Context | `compress` 216 + `acp_context` 90 + prompt 369 = **675** | `compress` 549 + `decompress` 546 + `search_context` 210 + `acp_status` 339 + prompt 4,417 = **6,061** |
| Subagents | `subagent` = **268** | `Agent` 1,111 + `get_subagent_result` 149 + `steer_subagent` 156 = **1,416** |
| Web access | `web_access` = **141** | `web_search` 994 + `source_check` 413 + `fetch_content` 576 + `get_search_content` 393 = **2,376** |
| Hashline edit | `read` 85 + `replace` 203 + `undo_last_replace` 63 = **351** | `read` 247 + `replace` 948 + `undo_last_replace` 215 = **1,410** |
| Ask user | `ask_user_question` = **215** | `ask_user_question` = **1,258** |
| Todo | `todo` = **256** | `todo` = **904** |

## 上下文优化组件

### 1. billion-context-pi-lean

[billion-context-pi-lean](https://github.com/kunkun9527/billion-context-pi-lean) 在 [Billion Context](https://github.com/ranxianglei/billion-context-pi) 上提供紧凑的 `compress` + `acp_context` 接口，用于总结已使用的对话区间并按需恢复细节。实际使用中，它能让活动上下文保持较小，并推动模型主动压缩已经不再需要的内容。这不但节约 tokens，对于可用 context window 较小的模型也尤其有价值。

### 2. pi-slim

[pi-slim](https://github.com/robzolkos/pi-slim) 将 Pi 文档指导改为按需启用，直接缩减反复出现的基础 prompt。

### 3. Headroom / noheadroom

[Headroom / noheadroom](https://www.npmjs.com/package/@raquezha/noheadroom) 压缩庞大的活动上下文和工具结果。根据我的日常实测，它通常能节约约 **20%–30%** 的 tokens；这是个人使用观察，并非隔离基准测试。Billion Context 则负责较早的对话区间及后续恢复。

### 4. RTK 与 pi-rtk-optimizer

[RTK](https://github.com/rtk-ai/rtk) 和 [pi-rtk-optimizer](https://github.com/MasuRii/pi-rtk-optimizer) 在 shell 命令输出进入对话前缩减它们。这部分目前仍在体验中，暂时还没有详细的节省数据。

### 5. pi-context-view

[pi-context-view](https://github.com/dimk90/pi-context-view) 测量基础 prompt、工具、扩展和对话上下文。它是观测工具，不是压缩器。

## 各组件如何配合

| 环节 | 组件 | 目的 |
| --- | --- | --- |
| 静态 prompt | `pi-slim` | 删除反复出现的文档指导。 |
| 工具与命令输出 | RTK + `pi-rtk-optimizer` | 避免冗长 shell 输出进入上下文。 |
| 活动上下文 | Headroom / noheadroom | 压缩庞大的结果和活动内容。 |
| 长会话历史 | `billion-context-pi-lean` | 压缩已使用区间，并按需恢复细节。 |
| 测量 | `pi-context-view` | 显示上下文成本并验证优化效果。 |

## 推荐的 lean 常用工具

### pi-subagents-lean

[pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean) 将 subagent 操作整合到一个 schema，同时保留执行、结果、steering 和生命周期行为。请检查已发现 agents 的模型、prompts、工具和扩展白名单，并删除不用的类型。

### pi-web-access-lean

[pi-web-access-lean](https://github.com/kunkun9527/pi-web-access-lean) 将网页搜索、核验、抓取和续取整合到一个 schema，高级参数按需提供。

### pi-hashline-edit-pro-lean

[pi-hashline-edit-pro-lean](https://github.com/kunkun9527/pi-hashline-edit-pro-lean) 提供紧凑的锚点读取、替换和撤销工具，同时保留 Hashline 的行安全编辑模型。

### rpiv-ask-user-question-lean

[rpiv-ask-user-question-lean](https://github.com/kunkun9527/rpiv-ask-user-question-lean) 用更小的 schema 保留结构化澄清、验证和 UI 行为。

### rpiv-todo-lean

[rpiv-todo-lean](https://github.com/kunkun9527/rpiv-todo-lean) 用一个紧凑 schema 保留任务状态、依赖关系、负责人和生命周期操作。

## 建议采用顺序

1. 使用 `pi-context-view` 测量当前配置。
2. 添加 `pi-slim`。
3. 如果 shell 输出冗长，添加 RTK 和 `pi-rtk-optimizer`。
4. 添加 Headroom，处理庞大的活动上下文和工具结果。
5. 添加 `billion-context-pi-lean`，处理长会话压缩与恢复。
6. 只将实际使用的工具替换为 lean 版本。
7. 再次测量。

## 安装规则

- 按各链接仓库的说明安装。
- 不要同时加载上游扩展及其 lean wrapper。
- 检查固定的上游版本；依赖更新后执行仓库检查。
- 不要将端点、供应商设置和密钥放入公开配置。

## 许可证与归属

每个链接项目保留各自的许可证、作者归属和支持政策。各 lean 仓库在 README 与 package metadata 中保留上游归属。
