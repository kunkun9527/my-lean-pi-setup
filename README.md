# My Lean Pi Setup

[简体中文](README.zh-CN.md)

A context-efficient [Pi coding agent](https://github.com/earendil-works/pi) stack plus five common tools with lean model-facing interfaces.

## Measured initial context footprint

These figures measure recurring model-facing initialization context, not one-time process memory.

### Method

- Pi `0.84.4`, `pi-context-view` `0.4.3`, with `GPT-5.6-SOL` selected.
- Each extension was loaded alone in a fresh in-memory session. Pi built-in tools, skills, context files, messages, and unrelated extensions were excluded.
- The calculation matches `/context injections`: tool metadata, related prompt guidance, and extension-added system-prompt text. Runtime-only UI and slash commands are excluded.
- Context View estimates tokens as `ceil(characters / 4)`; these are reproducible estimates, not exact GPT tokenizer counts.
- Upstream comparisons use the versions pinned by each lean wrapper. Updates can change the results.

### Context components

| Component | Initial context impact | Interpretation |
| --- | ---: | --- |
| `billion-context-pi-lean` | **675 tokens** | Upstream `billion-context-pi@0.1.52`: **6,061**. Saves **5,386 (88.9%)**. |
| `pi-slim@0.2.1` | **−309 tokens net** | Removes 1,236 characters of Pi documentation guidance from the measured base prompt. |
| Headroom / local noheadroom | **0 tokens initially** | Reduces context and tool-result growth at runtime. |
| RTK + `pi-rtk-optimizer` | **0 tokens initially** | The measured rewrite configuration uses runtime hooks and shell rewriting. Optional guidance can make this non-zero. |
| `pi-context-view@0.4.3` | **0 tokens initially** | Adds observers and a slash command, not model-facing tools or instructions. |

Zero initial footprint does not mean zero runtime benefit: Headroom and RTK reduce later context growth, while `pi-context-view` measures it.

### Lean wrapper comparison

| Wrapper | Lean | Pinned upstream | Saved | Reduction |
| --- | ---: | ---: | ---: | ---: |
| `billion-context-pi-lean` | **675** | 6,061 | 5,386 | **88.9%** |
| `pi-subagents-lean` | **268** | 1,416 | 1,148 | **81.1%** |
| `pi-web-access-lean` | **141** | 2,376 | 2,235 | **94.1%** |
| `pi-hashline-edit-pro-lean` | **351** | 1,410 | 1,059 | **75.1%** |
| `rpiv-ask-user-question-lean` | **215** | 1,258 | 1,043 | **82.9%** |
| `rpiv-todo-lean` | **256** | 904 | 648 | **71.7%** |
| **Total** | **1,906** | **13,425** | **11,519** | **85.8%** |

The six lean wrappers use about one seventh of the pinned upstream interfaces' initialization context. This saving recurs while the tools remain enabled; provider prompt caching may reduce the billed difference.

### Per-tool breakdown

| Plugin | Lean interface | Original interface |
| --- | --- | --- |
| Billion Context | `compress` 216 + `acp_context` 90 + prompt 369 = **675** | `compress` 549 + `decompress` 546 + `search_context` 210 + `acp_status` 339 + prompt 4,417 = **6,061** |
| Subagents | `subagent` = **268** | `Agent` 1,111 + `get_subagent_result` 149 + `steer_subagent` 156 = **1,416** |
| Web access | `web_access` = **141** | `web_search` 994 + `source_check` 413 + `fetch_content` 576 + `get_search_content` 393 = **2,376** |
| Hashline edit | `read` 85 + `replace` 203 + `undo_last_replace` 63 = **351** | `read` 247 + `replace` 948 + `undo_last_replace` 215 = **1,410** |
| Ask user | `ask_user_question` = **215** | `ask_user_question` = **1,258** |
| Todo | `todo` = **256** | `todo` = **904** |

## Context optimization stack

### 1. billion-context-pi-lean

[billion-context-pi-lean](https://github.com/kunkun9527/billion-context-pi-lean) provides a compact `compress` + `acp_context` interface over [Billion Context](https://github.com/ranxianglei/billion-context-pi) for summarizing consumed conversation ranges and restoring details on demand.

### 2. pi-slim

[pi-slim](https://github.com/robzolkos/pi-slim) makes Pi documentation guidance opt-in, directly reducing the recurring base prompt.

### 3. Headroom / noheadroom

[Headroom / noheadroom](https://www.npmjs.com/package/@raquezha/noheadroom) compresses bulky active context and tool results. Billion Context handles older conversation ranges and later recovery.

### 4. RTK and pi-rtk-optimizer

[RTK](https://github.com/rtk-ai/rtk) and [pi-rtk-optimizer](https://github.com/MasuRii/pi-rtk-optimizer) reduce shell-command output before it enters the conversation.

### 5. pi-context-view

[pi-context-view](https://github.com/dimk90/pi-context-view) measures base-prompt, tool, extension, and conversation context. It is an observability tool, not a compressor.

## How the stack fits together

| Stage | Component | Purpose |
| --- | --- | --- |
| Static prompt | `pi-slim` | Removes recurring documentation guidance. |
| Tool and command output | RTK + `pi-rtk-optimizer` | Prevents verbose shell output from entering context. |
| Active context | Headroom / noheadroom | Compresses bulky results and active material. |
| Long-session history | `billion-context-pi-lean` | Compresses consumed ranges and restores details on demand. |
| Measurement | `pi-context-view` | Reveals context cost and verifies improvements. |

## Recommended lean tools

### pi-subagents-lean

[pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean) combines subagent operations behind one schema while preserving execution, results, steering, and lifecycle behavior. Review discovered agents' models, prompts, tools, and extension allowlists; delete unused types.

### pi-web-access-lean

[pi-web-access-lean](https://github.com/kunkun9527/pi-web-access-lean) combines web search, checking, fetching, and continuation behind one schema with on-demand advanced help.

### pi-hashline-edit-pro-lean

[pi-hashline-edit-pro-lean](https://github.com/kunkun9527/pi-hashline-edit-pro-lean) provides compact anchored read, replace, and undo tools while preserving Hashline's line-safe editing model.

### rpiv-ask-user-question-lean

[rpiv-ask-user-question-lean](https://github.com/kunkun9527/rpiv-ask-user-question-lean) retains structured clarification, validation, and UI behavior behind a smaller schema.

### rpiv-todo-lean

[rpiv-todo-lean](https://github.com/kunkun9527/rpiv-todo-lean) retains task states, dependencies, ownership, and lifecycle operations behind one compact schema.

## Recommended adoption order

1. Measure the current setup with `pi-context-view`.
2. Add `pi-slim`.
3. Add RTK and `pi-rtk-optimizer` if shell output is noisy.
4. Add Headroom for bulky active context and tool results.
5. Add `billion-context-pi-lean` for long-session compression and recovery.
6. Replace only tools you use with lean variants.
7. Measure again.

## Installation rules

- Follow each linked repository's installation instructions.
- Never load an upstream extension and its lean wrapper together.
- Check pinned upstream versions and run the repository's checks after dependency updates.
- Keep endpoints, provider settings, and secrets out of public configuration.

## License and attribution

Each linked project retains its own license, authorship, and support policy. The lean repositories preserve upstream attribution in their READMEs and package metadata.
