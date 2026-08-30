# My Lean Pi Setup

[简体中文](README.zh-CN.md)

A focused guide to the context-optimization stack I use with the [Pi coding agent](https://github.com/earendil-works/pi), followed by a small set of commonly useful tools with token-lean interfaces.

This repository is documentation only. It contains no installer, copied configuration, private endpoints, or API credentials. Follow each linked project's README and install only what you need.

## Measured initial context footprint

The figures below measure the recurring model-facing context added at initialization. Pi's built-in tools (`read`, `bash`, `edit`, `write`, and related built-ins), skills, context files, conversation messages, and unrelated extensions were excluded, so each result belongs to the named plugin.

### Method and scope

- Pi `0.84.4`, `pi-context-view` `0.4.3`, with `GPT-5.6-SOL` selected.
- Each extension was loaded alone in a fresh in-memory session with built-in tools, skills, and context files disabled.
- The calculation matches `/context injections`: tool name + description + JSON schema + prompt snippet/guidelines, plus extension-added system prompt text. Slash commands and UI/runtime code are not counted because they are not sent to the model.
- `pi-context-view` estimates text as `ceil(characters / 4)`. These are reproducible estimates, not provider-tokenizer-exact GPT token counts; the selected model does not change this estimator.
- Upstream comparisons use the exact versions pinned by the lean wrappers. Values can change after either Pi or a plugin is updated.

### Context components

| Component | Initial context impact | Comparison / interpretation |
| --- | ---: | --- |
| `billion-context-pi-lean` | **675 tokens** | Upstream `billion-context-pi@0.1.52`: **6,061**. Saves **5,386 (88.9%)**. |
| `pi-slim@0.2.1` | **−309 tokens net** | Adds no model-facing tool or instruction in normal use; removes 1,236 characters of Pi documentation guidance from the measured base prompt. |
| Headroom / local noheadroom | **0 tokens initially** | Works on context and tool results at runtime; it does not add a startup tool schema or prompt instruction. |
| RTK + `pi-rtk-optimizer` | **0 tokens initially** | Under the measured rewrite configuration, it works through runtime hooks and shell rewriting. Optional source-filter troubleshooting guidance can make this non-zero when enabled. |
| `pi-context-view@0.4.3` | **0 tokens initially** | Registers a slash command and observers, but adds no model-facing instructions or tools. |

A zero initial footprint does **not** mean a component saves nothing. Headroom and RTK primarily reduce later tool-result/context growth, while `pi-context-view` measures that growth.

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

Together, these six lean wrappers use about **one seventh** of the initialization context of their pinned upstream interfaces. This saving recurs on model requests where the tools remain enabled, although provider prompt caching may reduce its billed cost.

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

These components address different parts of context usage. They are the core of this setup.

### 1. billion-context-pi-lean

[billion-context-pi-lean](https://github.com/kunkun9527/billion-context-pi-lean) is the main long-session context component. It provides a compact `compress` + `acp_context` interface over [Billion Context](https://github.com/ranxianglei/billion-context-pi) while preserving the upstream compression and recovery engine.

Use it to:

- replace consumed conversation ranges with dense summaries;
- recover compressed details when they become relevant again;
- keep long sessions usable without exposing the full upstream tool surface on every turn.

### 2. pi-slim

[pi-slim](https://github.com/robzolkos/pi-slim) reduces Pi's recurring base prompt by making documentation guidance opt-in.

This is a direct reduction in static prompt text and is usually the simplest component to add first.

### 3. Headroom / noheadroom

[Headroom / noheadroom](https://www.npmjs.com/package/@raquezha/noheadroom) compresses bulky context and tool results before they crowd out useful working information.

It complements Billion Context: Headroom controls oversized material entering or remaining in the active context, while Billion Context manages older conversation ranges and later recovery.

### 4. RTK and pi-rtk-optimizer

[RTK](https://github.com/rtk-ai/rtk) and [pi-rtk-optimizer](https://github.com/MasuRii/pi-rtk-optimizer) reduce noisy shell-command output and automate supported command rewriting.

This saves context near the source: concise command output enters the conversation instead of being compressed only after it has already consumed space.

### 5. pi-context-view

[pi-context-view](https://github.com/dimk90/pi-context-view) shows how much context is used by the base prompt, tool definitions, extension injections, and conversation content.

It is an observability tool, not a compressor. Use it to measure the setup before and after changes and to find the next large source of context overhead.

## How the stack fits together

| Stage | Component | Purpose |
| --- | --- | --- |
| Static prompt | `pi-slim` | Removes recurring documentation guidance. |
| Tool and command output | RTK + `pi-rtk-optimizer` | Prevents verbose shell output from entering context. |
| Active context | Headroom / noheadroom | Compresses bulky results and active material. |
| Long-session history | `billion-context-pi-lean` | Compresses consumed ranges and restores details on demand. |
| Measurement | `pi-context-view` | Reveals context cost and verifies improvements. |

## Recommended lean tools

These are commonly useful Pi tools whose model-facing interfaces have been reduced without intentionally removing their upstream runtime behavior.

### pi-subagents-lean

[pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean) combines subagent operations behind one compact schema with on-demand help.

It preserves discovery, foreground and background execution, results, steering, rendering, and lifecycle behavior. After installation, review every discovered agent's model, prompt, tools, and extension allowlist; delete agent types you do not need.

### pi-web-access-lean

[pi-web-access-lean](https://github.com/kunkun9527/pi-web-access-lean) combines web search, checking, fetching, and continuation behind one compact operation schema.

Detailed parameters remain available through on-demand help instead of being repeated in the model context on every turn.

### pi-hashline-edit-pro-lean

[pi-hashline-edit-pro-lean](https://github.com/kunkun9527/pi-hashline-edit-pro-lean) provides compact anchored read, replace, and undo tools while preserving Hashline's line-safe editing model.

It is useful when reliable edits matter but a large editing-tool schema does not need to be sent on every request.

### rpiv-ask-user-question-lean

[rpiv-ask-user-question-lean](https://github.com/kunkun9527/rpiv-ask-user-question-lean) keeps the structured clarification UI and validation behavior behind a smaller schema.

Use it when the agent needs explicit choices rather than unstructured follow-up questions.

### rpiv-todo-lean

[rpiv-todo-lean](https://github.com/kunkun9527/rpiv-todo-lean) reduces task management to one compact operation schema while preserving task states, dependencies, ownership, and lifecycle operations.

It is most useful for multi-step work where progress should remain visible and recoverable.

## Recommended adoption order

1. Install `pi-context-view` and record the current context breakdown.
2. Add `pi-slim` to reduce the static prompt.
3. Add RTK and `pi-rtk-optimizer` if shell output is a major source of noise.
4. Add Headroom for bulky active context and tool results.
5. Add `billion-context-pi-lean` for long-session compression and recovery.
6. Replace only the common tools you actually use with their lean variants.
7. Measure again with `pi-context-view`.

## Installation rules

- Follow the installation instructions in each linked repository.
- Do not load an upstream extension and its lean wrapper at the same time; duplicate registrations waste context and may conflict.
- Add only the lean tools your workflow actually uses.
- Review pinned upstream versions before upgrading a wrapper.
- Re-run each repository's documented checks after dependency updates.
- Keep machine-specific integrations, provider settings, endpoints, and secrets outside public configuration.

## What this repository does not cover

This guide intentionally does not document my provider extensions, account managers, model-speed options, notifications, vision setup, workflow modes, or other private quality-of-life plugins. They are unrelated to the focused context-optimization stack and portable lean-tool recommendations above.

## License and attribution

This repository is documentation. Each linked project retains its own license, authorship, and support policy. The lean repositories preserve upstream attribution in their individual READMEs and package metadata.
