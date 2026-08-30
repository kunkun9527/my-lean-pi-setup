# My Lean Pi Setup

[简体中文](README.zh-CN.md)

A focused guide to the context-optimization stack I use with the [Pi coding agent](https://github.com/earendil-works/pi), followed by a small set of commonly useful tools with token-lean interfaces.

This repository is documentation only. It contains no installer, copied configuration, private endpoints, or API credentials. Follow each linked project's README and install only what you need.

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
