# 我的 Pi 精简配置

[English](README.md)

这是我自己在用的 [Pi coding agent](https://github.com/earendil-works/pi) 配置，目标是让每次请求少带点没用的上下文。里面有几个常用扩展的精简版，以及我搭配使用的其他省 token 工具。

## 为什么要做精简版

一开始只是给自己用的，后来觉得别的 Pi 用户可能也用得上，就开源了。

Pi 的一大优点是上下文很干净、可控。但不少好用的扩展会带很长的工具说明，每次请求都要发一遍，对话还没开始就占掉不少 token。

精简版只改模型看到的那部分：把工具的 Schema 和说明缩短到够用为止，功能和底层逻辑都直接用上游的，没有改。现在的模型看懂一个清楚的 Schema 就够了，不需要反复叮嘱。

维护起来也不麻烦：上游发新版时，看看改了什么、有没有破坏 API 或 Schema，需要的话升级依赖、调整适配代码，然后跑测试、重新测一下 token 就行。

## 省上下文的几个组件

### 1. Billion Context

[Billion Context](https://github.com/ranxianglei/billion-context-pi) 会把较早的对话压成摘要，需要时再把细节找回来。由模型自己决定什么时候压、压哪一段，而不是到了上限一刀切。长对话、上下文窗口小的模型最用得上。

**请直接用官方版，并打开它的 `lean` 提示词包。** 我以前做的 [billion-context-pi-lean](https://github.com/kunkun9527/billion-context-pi-lean) 现在只是历史版本，已经不再维护。官方把我那版精简提示词（保留了大约九成）做成了内置的 `lean` 提示词包（见 [issue #4](https://github.com/kunkun9527/billion-context-pi-lean/issues/4)），但默认不启用，要自己在配置里打开。

用法：

1. 安装官方版：`pi install npm:billion-context-pi`。
2. 在 `~/.pi/acp.json`（全局）或 `<项目>/.pi/acp.json`（单个项目）里写：

   ```json
   {
     "compress": { "promptPack": "lean" },
     "delegate": false
   }
   ```

   `promptPack: "lean"` 用上精简提示词。`delegate: false` 关掉它自带的子代理工具，我的精简版本来也去掉了这部分；如果你想用它的子代理，就不要写这一行，同时别再装其他子代理扩展。
3. 新开一个会话就生效。

`lean` 包里有意保留了比较详细的 `howToCompress` 规则，弱一点的模型靠这些规则才不会压出幻觉。如果你用的是前沿模型，还想再压，可以在同一个文件里用 `promptSections` / `prompts` 覆盖对应段落，具体见官方的 [CONFIGURATION.md](https://github.com/ranxianglei/billion-context-pi/blob/master/CONFIGURATION.md)。

### 2. pi-docs-slim

[pi-docs-slim](https://github.com/kunkun9527/pi-docs-slim) 让 Pi 默认附带的文档说明改成需要时才加载（用 `/pi` 提问），基础 Prompt 因此变短。它是我从 Rob Zolkos 的 [pi-slim](https://github.com/robzolkos/pi-slim) fork 出来的，改成能在 Pi 0.87.1 上用；原版在这个版本上已经去不掉文档说明了。

```bash
pi install npm:@ssk_dev/pi-docs-slim
```

### 3. pi-context-view

[pi-context-view](https://github.com/dimk90/pi-context-view) 用来查看 token 都花在哪：基础 Prompt、工具、扩展、对话各占多少。它只负责看，不负责压缩。

## 以前推荐过、实测后撤下的工具

这个 README 以前推荐过 RTK 和 Headroom。后来我对照自己的 Pi 会话记录逐条核算，发现它们实际省得很少，副作用倒不少，所以撤下了。下面的数据只来自我自己的环境（Windows + Git Bash + Pi，一个人用），仅供参考。如果你想用，建议先在自己的会话上测一下。

### RTK + pi-rtk-optimizer

统计范围：10 天，约 5,800 次 bash 调用，其中约 2,600 次被改写成 rtk 命令。

* **实际节省远低于 `rtk gain` 的数字。** `rtk gain` 显示省了 48.6%。我把 1,475 条只读命令分别用原命令和 rtk 版重跑一遍，条件相同（包括 Pi 自带的 50KB 输出截断），实际只少了 **9.7%** 的输出 token。差距的原因之一：`head`/`tail` 被改写成 `rtk read` 后，节省是按整个文件的大小算的。
* **节省集中在极少数命令上。** 91.9% 的节省来自 50 条大范围搜索（比如搜进了 `node_modules`）。62.5% 的命令一点没省，16% 的命令输出反而变长。
* **会悄悄给出错误结果。** 有 16 次原生 `grep` 能搜到内容，rtk 却返回空或报错（Git Bash 的路径转换和正则语法不兼容）。搜索结果还会被截断、缩进被去掉。模型不知道这些，会当成真实结果继续推理。
* **常用参数直接报错。** `git stash -q`、`diff -u/-r/-q`、`find -not/-exec`、`du` 等都不支持，前面加 `command` 也绕不开改写。
* **干扰模型。** 没装 hook 时，rtk 会在输出里插一行 "No hook installed — run `rtk init -g`"，10 天里出现了 1,238 次。模型为此花了好几轮排查，最后自己执行了 `rtk init -g`，改的却是 Claude Code 的配置。

Pi 本身会把单次输出截到 50KB。剩下的"偶尔一次搜索范围太大"，在 `AGENTS.md` 里写一句"在大目录里搜索前先用 `rg -l` / `rg -c` 看范围"就够了。

### Headroom / noheadroom

统计范围：30 天，约 37,700 轮请求。

* **面板上的节省数字不可信。** 有三天，Headroom 统计的节省是 8.9 亿 token，而 Pi 同期发出的 prompt 总共只有约 4 亿。它统计的输入中位数约 36 万 token，Pi 实际请求的中位数只有 6.5 万。面板数字里还混进了它自己的自检请求。
* **从 Pi 这边看不出任何节省。** 那几天每轮 prompt 的大小和缓存命中率（89%～94%）跟平时没有区别。
* **压缩只作用于一轮。** 扩展只在当次请求里替换工具输出，不写回会话，下一轮又发原文。
* **拖慢请求。** 扩展要等压缩返回才把请求发给模型。5,321 次压缩平均每次 8.2 秒，1,565 次超过 5 秒，累计等待约 12 小时。
* 我后来改成只做无损压缩，结果 10 天只触发了 78 次（不到 1% 的轮次），省下的不到总输入的 0.05%，跟没装差不多。

## 精简版工具

### pi-subagents-lean

[pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean) 可以把任务交给子代理去做，支持后台运行和中途调整方向。精简版把启动、取结果、调整方向合成一个 `subagent` 工具，上游的代理发现和生命周期管理都保留。

### pi-web-access-lean

[pi-web-access-lean](https://github.com/kunkun9527/pi-web-access-lean) 能搜索网页、核实说法、抓取页面，结果太长时可以分页继续读。精简版把原来的 4 个工具合成一个 `web_access`，高级参数要用时再查帮助。

### pi-hashline-edit-pro-lean

[pi-hashline-edit-pro-lean](https://github.com/kunkun9527/pi-hashline-edit-pro-lean) 用每行的 HASH 锚点来定位和修改文件，改错了可以一步撤回。精简版缩短了 `read`、`replace`、`undo_last_replace` 的说明，Hashline 的安全校验都还在。

### rpiv-ask-user-question-lean

[rpiv-ask-user-question-lean](https://github.com/kunkun9527/rpiv-ask-user-question-lean) 在需求或决定不明确时，用选择题的方式问用户。精简版删掉了说明里重复的话，提问界面和选项校验都没动。

### rpiv-todo-lean

[rpiv-todo-lean](https://github.com/kunkun9527/rpiv-todo-lean) 用来拆任务、记依赖、跟进度。精简版换成了更短、更平的 Schema，任务管理功能一个没少。

## AGENTS.md 规则模板

仓库里附了一份我自己在用的 `AGENTS.md`，有[中文版](agents/zh-CN/AGENTS.md)和[英文版](agents/en/AGENTS.md)。

### 建议先装 Skills

用这份规则之前，建议先装 Matt Pocock 的 Skills：

* [mattpocock/skills](https://github.com/mattpocock/skills)：一组给 coding agent 用的工程工作流。这份 `AGENTS.md` 里的需求对齐，用的就是其中的 `grilling` skill。
* 安装：

```bash
npx skills@latest add mattpocock/skills
```

### 规则从哪来

这份 `AGENTS.md` 参考了两个开源 Prompt 项目，再精简而成：

* [i-have-adhd](https://github.com/ayghri/i-have-adhd)：先给结果，给出明确的下一步，不说客套话。
* [ponytail](https://github.com/DietrichGebert/ponytail)：防止过度设计。按顺序往下选，第一个够用的方案就停：直接用现有命令或配置 → 复用现有代码 → 用平台自带能力 → 小改动。

### 子代理部分要自己改

`AGENTS.md` 里的 `Subagents Delegation` 一节，是我配合子代理扩展（比如 [pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean)）写的使用建议，只用了上游的标准类型（`Explore`、`Plan`、`general-purpose`）。每个人的工作流和自定义代理都不一样，请按自己的需要改、加或删；没装子代理扩展的话，整节删掉就行。

### 放在哪里

Pi 启动时会自动读取这两个位置的 `AGENTS.md`：

* 全局：`~/.pi/agent/AGENTS.md`
* 项目：项目根目录的 `./AGENTS.md`（或更上层的目录）

## 各组件分工

| 管哪部分 | 组件 | 做什么 |
| --- | --- | --- |
| 基础 Prompt | `pi-docs-slim` | 去掉默认附带的文档说明。 |
| 历史对话 | `billion-context-pi`（官方版） | 把旧对话压成摘要，需要时找回细节。 |
| 查看用量 | `pi-context-view` | 看各部分分别占多少 token。 |

## 怎么上手

### 建议的顺序

1. 用 `pi-context-view` 看一下现在的 token 占用，作为对比基准。
2. 装 `pi-docs-slim`，缩短基础 Prompt。
3. 装官方的 `billion-context-pi` 并打开 `lean` 提示词包，处理长对话。
4. 只把你真正常用的工具换成精简版。
5. 再用 `pi-context-view` 测一次，看省了多少。

### 注意

* 具体安装步骤看各个仓库的说明。
* 原版扩展和它的精简版只能装一个，同时装会重复注册工具。
* 升级依赖后记得跑一遍检查。
* 不要把 API 密钥和内部服务地址提交到公开配置里。

## Token 测量

仓库里有一个测量脚本，覆盖还在维护的几个公开精简版（billion-context-pi-lean 已不再维护，不再测量）。每个精简版和它锁定的上游版本，都在各自独立的临时 Pi 进程里测。

```bash
npm run benchmark          # 测量，显示变化，并更新 JSON 和 README 里的数字
npm run benchmark:report   # 只测量、只输出，不改文件
npm run benchmark:check    # 检查结果和 README 是不是最新的
```

结果保存在 `benchmarks/results.json`。脚本只改 README 里 `token-benchmark` 标记之间的内容；数字没变就不会改文件。

## 启动时的上下文占用

<!-- token-benchmark:aggregate:start -->
### 测量方式

* 测试环境：Pi `0.87.1`，使用仓库内置自动化工具。
* 每个 Lean 与上游扩展均在独立临时进程、空白工作目录、空白 Home 和空白 Pi Agent 目录中测量。
* 排除内置工具、Skills、上下文文件、会话历史、用户消息、无关扩展、运行时 UI 与 Slash Commands；计入扩展通过 `before_agent_start` 注入的系统提示和消息。
* Token 是固定字符代理估算，按 `ceil(字符数 / 4)` 计算，并非特定模型 tokenizer 的实际计费值；上游采用各 Lean 包经 lockfile 和已安装包共同校验的精确版本。

### 精简版工具对比

| 扩展封装 | 精简版 | 锁定上游 | 节省 Token | 降幅 |
| --- | ---: | ---: | ---: | ---: |
| `pi-web-access-lean` | **152** | 2,953 | 2,801 | **94.9%** |
| `rpiv-ask-user-question-lean` | **215** | 1,258 | 1,043 | **82.9%** |
| `rpiv-todo-lean` | **248** | 904 | 656 | **72.6%** |
| `pi-subagents-lean` | **268** | 8,540 | 8,272 | **96.9%** |
| `pi-hashline-edit-pro-lean` | **537** | 2,040 | 1,503 | **73.7%** |
| **合计** | **1,420** | **15,695** | **14,275** | **91.0%** |

综合使用这 5 个精简封装，常驻初始化上下文相比锁定的上游版本减少 **14,275 tokens（91.0%）**。
<!-- token-benchmark:aggregate:end -->

## 许可与署名

文中提到的各个项目，版权和许可证都归原作者所有。每个精简版都在自己的仓库和 npm 包信息里注明了上游来源。
