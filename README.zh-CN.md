# 我的 Pi 精简配置

[English](README.md)

一套面向 [Pi coding agent](https://github.com/earendil-works/pi) 的上下文优化配置方案，包含多个经过深度精简的常用工具封装。

## 为什么制作这些精简版插件

这套精简包装最初是我为了日常自用编写的；后来觉得对其他关注上下文开销的 Pi 用户也会有帮助，于是整理开源。

Pi 最突出的优势之一是轻量、可控的上下文。然而，许多优秀的社区插件在每次请求时都会注入冗长详尽的工具说明，导致在对话尚未正式开始前就占用了大量 Token。

这套精简版在完整保留上游核心逻辑与功能特性的前提下，将面向模型的 Schema 和描述精简到核心要点。现代大语言模型已经具备很强的理解能力，只要 Schema 结构清晰，无需在 Prompt 中堆砌冗余啰嗦的说明也能稳定执行。

日常维护也很清晰：当上游版本更新时，对比上游变更与精简封装，确认 API、Schema 或运行时是否存在破坏性改动，按需调整依赖与适配代码，最后运行测试并重新测量上下文占用即可。

## 上下文优化组件方案

### 1. billion-context-pi-lean

[billion-context-pi-lean](https://github.com/kunkun9527/billion-context-pi-lean) 基于 [Billion Context](https://github.com/ranxianglei/billion-context-pi) 封装，提供精简的 `compress` 与 `acp_context` 接口。它负责总结历史对话区间并按需恢复细节，使活动上下文始终保持轻量，并提示模型主动压缩过时信息。对于可用上下文窗口较小的模型尤其有效。

### 2. pi-slim

[pi-slim](https://github.com/robzolkos/pi-slim) 将 Pi 默认注入的文档说明改为按需启用，直接削减基础 Prompt 的静态开销。

### 3. Headroom / noheadroom

[Headroom / noheadroom](https://www.npmjs.com/package/@raquezha/noheadroom) 动态压缩庞大的工具执行结果与运行时上下文。根据我的日常使用体验，通常能减少约 **20% 到 30%** 的 Token 消耗（此为个人工作流实测观察，非单一基准测试）。Billion Context 则负责较早会话区间的归档与召回。

### 4. RTK 与 pi-rtk-optimizer

[RTK](https://github.com/rtk-ai/rtk) 与 [pi-rtk-optimizer](https://github.com/MasuRii/pi-rtk-optimizer) 在终端命令输出进入会话前进行针对性过滤与压缩。

### 5. pi-context-view

[pi-context-view](https://github.com/dimk90/pi-context-view) 用于实时监测基础 Prompt、工具、扩展和会话上下文的 Token 分布。它是用于观测分析的度量工具，不执行压缩。

## 精简版常用工具

### pi-subagents-lean

[pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean) 支持将复杂任务分派给专业 Subagent，具备后台运行与动态引导能力。精简版将任务启动、结果获取和引导整合为单个 `subagent` 工具，完整保留上游的 Agent 发现与生命周期管理机制。

### pi-web-access-lean

[pi-web-access-lean](https://github.com/kunkun9527/pi-web-access-lean) 支持网页搜索、事实核验、页面全文抓取与结果续取。精简版将原版的 4 个工具整合为统一的 `web_access` 入口，高级参数转为按需帮助展开。

### pi-hashline-edit-pro-lean

[pi-hashline-edit-pro-lean](https://github.com/kunkun9527/pi-hashline-edit-pro-lean) 基于稳定的 HASH 行锚点实现精确的文件编辑与一键回滚。精简版精简了 `read`、`replace` 和 `undo_last_replace` 的 Prompt 描述，同时完整保留 Hashline 的安全校验。

### rpiv-ask-user-question-lean

[rpiv-ask-user-question-lean](https://github.com/kunkun9527/rpiv-ask-user-question-lean) 在需求或决策不明确时向用户发起结构化提问。精简版去除了工具说明中的重复描述，完整保留问卷 UI 与选项校验。

### rpiv-todo-lean

[rpiv-todo-lean](https://github.com/kunkun9527/rpiv-todo-lean) 提供任务拆解、依赖追踪与状态流转管理。精简版以紧凑的原生扁平 Schema 保留了完整的任务生命周期。

## 方案架构概览

| 环节 | 组件 | 功能职责 |
| --- | --- | --- |
| 静态 Prompt | `pi-slim` | 移除常驻的基础文档说明。 |
| 命令与工具输出 | RTK + `pi-rtk-optimizer` | 拦截并过滤冗长的终端命令输出。 |
| 活动上下文 | Headroom / noheadroom | 动态压缩运行期的工具输出与会话膨胀。 |
| 长会话历史 | `billion-context-pi-lean` | 压缩已读历史轮次，支持按需精准恢复。 |
| 观测度量 | `pi-context-view` | 量化并呈现各模块的 Token 占用。 |

## 安装与配置建议

### 推荐启用顺序

1. 使用 `pi-context-view` 测量当前环境的基础 Token 开销。
2. 安装 `pi-slim` 缩减基础 Prompt。
3. 如果终端输出频繁冗长，接入 RTK 与 `pi-rtk-optimizer`。
4. 接入 Headroom 压缩活动工具结果。
5. 接入 `billion-context-pi-lean` 负责长会话压缩与召回。
6. 根据实际需要，将常用工具逐一替换为对应精简版本。
7. 再次测量对比优化效果。

### 注意事项

* 请参考各仓库内的说明进行具体安装。
* 切勿同时加载原版扩展与其对应的精简版，以免重复注册工具。
* 依赖版本升级后请及时执行检查验证。
* 切勿将私有 API 密钥与内部服务端点提交至公开配置中。

## 初始上下文占用实测

以下数据衡量的是常驻注入到模型 Prompt 中的初始上下文占用，并非运行期内存占用。

### 测量方式

* 测试环境：Pi `0.84.4`，搭配 `pi-context-view` `0.4.3`，选定模型为 `GPT-5.6-SOL`。
* 每个扩展在全新的隔离会话中单独加载，排除内置工具、Skills 与上下文文件。
* 统计口径与 `/context injections` 保持一致（包含工具定义、相关提示词与扩展注入内容）。
* Context View 按 `ceil(字符数 / 4)` 估算 Token。
* 原版对比基准采用各精简版锁定的上游版本。

### 上下文组件分析

| 组件 | 初始上下文影响 | 说明 |
| --- | ---: | --- |
| `billion-context-pi-lean` | **675 tokens** | 原版 `billion-context-pi@0.1.52`: **6,061 tokens**（节省 88.9%）。 |
| `pi-slim@0.2.1` | **净减少 309 tokens** | 从基础 Prompt 中移除了 1,236 字符的静态文档说明。 |
| Headroom / noheadroom | **初始 0 tokens** | 属于动态中间件，在运行期动态压缩上下文增长。 |
| RTK + `pi-rtk-optimizer` | **初始 0 tokens** | 属于运行期 Hook，在命令执行时生效。 |
| `pi-context-view@0.4.3` | **初始 0 tokens** | 仅注册观测器与 Slash 命令，不向模型注入提示词。 |

### 精简版工具对比

| 插件封装 | 精简版 | 锁定原版 | 节省 Token | 降幅 |
| --- | ---: | ---: | ---: | ---: |
| `billion-context-pi-lean` | **675** | 6,061 | 5,386 | **88.9%** |
| `pi-subagents-lean` | **268** | 1,416 | 1,148 | **81.1%** |
| `pi-web-access-lean` | **141** | 2,376 | 2,235 | **94.1%** |
| `pi-hashline-edit-pro-lean` | **351** | 1,410 | 1,059 | **75.1%** |
| `rpiv-ask-user-question-lean` | **215** | 1,258 | 1,043 | **82.9%** |
| `rpiv-todo-lean` | **256** | 904 | 648 | **71.7%** |
| **合计** | **1,906** | **13,425** | **11,519** | **85.8%** |

综合使用这 6 个精简封装，初始工具定义开销可降至原版的约七分之一。

### 各工具详细构成

| 插件 | 精简版工具结构明细 | 原版工具结构明细 |
| --- | --- | --- |
| Billion Context | `compress` (216) + `acp_context` (90) + prompt (369) = **675** | `compress` (549) + `decompress` (546) + `search_context` (210) + `acp_status` (339) + prompt (4,417) = **6,061** |
| Subagents | `subagent` = **268** | `Agent` (1,111) + `get_subagent_result` (149) + `steer_subagent` (156) = **1,416** |
| Web access | `web_access` = **141** | `web_search` (994) + `source_check` (413) + `fetch_content` (576) + `get_search_content` (393) = **2,376** |
| Hashline edit | `read` (85) + `replace` (203) + `undo_last_replace` (63) = **351** | `read` (247) + `replace` (948) + `undo_last_replace` (215) = **1,410** |
| Ask user | `ask_user_question` = **215** | `ask_user_question` = **1,258** |
| Todo | `todo` = **256** | `todo` = **904** |

## 开源协议与归属声明

各链接引用的开源项目均保留其原作者版权与授权协议。所有精简版封装均在其仓库及 Package 元数据中完整保留了上游归属信息。
