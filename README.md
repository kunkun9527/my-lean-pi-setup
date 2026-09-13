# My Lean Pi Setup

[简体中文](README.zh-CN.md)

A curated, context-efficient [Pi coding agent](https://github.com/earendil-works/pi) configuration featuring lightweight tool wrappers that minimize prompt overhead.

## Why I Built These Lean Wrappers

I initially created these wrappers for my own daily workflow and later open-sourced them for other Pi users focused on context efficiency.

One of Pi's greatest strengths is its lean, controllable context. However, many excellent extensions introduce lengthy tool definitions that consume substantial tokens on every request, working against that advantage. These wrappers condense the model-facing schemas to their essentials while keeping the complete upstream engine and feature set intact. Modern LLMs handle clean, concise schemas reliably without requiring verbose, repetitive instructions in the prompt.

Maintaining these wrappers is straightforward: when upstream updates arrive, compare the changes against the lean wrapper, check for breaking API or schema modifications, bump the pinned dependency and adapter if needed, and re-run tests and footprint measurements.

## Context Optimization Stack

### 1. billion-context-pi-lean

[billion-context-pi-lean](https://github.com/kunkun9527/billion-context-pi-lean) wraps [Billion Context](https://github.com/ranxianglei/billion-context-pi) with a streamlined `compress` and `acp_context` interface. It summarizes older conversation turns and restores fine-grained context on demand, keeping active memory clean and prompting the model to compress stale information. This is particularly valuable for models with smaller context windows.

### 2. pi-slim

[pi-slim](https://github.com/robzolkos/pi-slim) makes Pi documentation guidance opt-in, directly reducing base prompt overhead.

### 3. Headroom / noheadroom

[Headroom / noheadroom](https://www.npmjs.com/package/@raquezha/noheadroom) dynamically compresses bulky tool outputs and runtime context. In daily usage, this typically saves around **20% to 30%** in token consumption (based on regular workflow observations rather than isolated benchmarks). Billion Context handles older history and long-term recovery.

### 4. RTK and pi-rtk-optimizer

[RTK](https://github.com/rtk-ai/rtk) and [pi-rtk-optimizer](https://github.com/MasuRii/pi-rtk-optimizer) compress shell command output before it enters the conversation context.

### 5. pi-context-view

[pi-context-view](https://github.com/dimk90/pi-context-view) provides observability into base prompt, tool, extension, and message token costs. It serves as an inspection tool rather than a compressor.

## Lean Tool Wrappers

### pi-subagents-lean

[pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean) enables delegating tasks to specialized subagents with background execution and dynamic steering. The lean wrapper unifies spawning, result fetching, and steering under a single `subagent` tool while preserving upstream discovery and lifecycle handling.

### pi-web-access-lean

[pi-web-access-lean](https://github.com/kunkun9527/pi-web-access-lean) supports web search, source verification, page fetching, and result pagination. The lean wrapper combines four separate tools into a single `web_access` entrypoint, moving advanced parameters to on-demand help.

### pi-hashline-edit-pro-lean

[pi-hashline-edit-pro-lean](https://github.com/kunkun9527/pi-hashline-edit-pro-lean) enables line-safe file editing and instant rollback using stable HASH line anchors. The lean wrapper shortens the tool schemas for `read`, `replace`, and `undo_last_replace` while preserving full Hashline safety validation.

### rpiv-ask-user-question-lean

[rpiv-ask-user-question-lean](https://github.com/kunkun9527/rpiv-ask-user-question-lean) provides interactive questionnaire prompts for clarifying ambiguous requirements. The lean wrapper strips repetitive prompt verbiage while retaining full UI and validation capabilities.

### rpiv-todo-lean

[rpiv-todo-lean](https://github.com/kunkun9527/rpiv-todo-lean) manages structured tasks, dependencies, and execution status. The lean wrapper preserves the complete task lifecycle with a clean, flat schema.

## Curated AGENTS.md Rules

This repository includes a lean, production-ready `AGENTS.md` instruction file available in both [English](agents/en/AGENTS.md) and [简体中文](agents/zh-CN/AGENTS.md).

### Recommended Prerequisites

Before applying this configuration, it is recommended to install Matt Pocock's skills repository:
* [mattpocock/skills](https://github.com/mattpocock/skills): A collection of structured engineering workflows. This `AGENTS.md` integrates with workflows such as the `/grill-me` skill for requirement alignment.
* Installation:
```bash
npx skills@latest add mattpocock/skills
```

### Design Rationale

This `AGENTS.md` is a streamlined distillation synthesized from two community prompt philosophies:
* [i-have-adhd](https://github.com/ayghri/i-have-adhd): Enforces action-first communication, numbered multi-step execution, and concrete next actions while eliminating conversational fluff.
* [ponytail](https://github.com/DietrichGebert/ponytail): Implements an anti-overengineering decision ladder (stop at the first sufficient rung: no code, reuse, platform native, minimal change).

### Customizing Subagents Delegation

The `Subagents Delegation` section in `AGENTS.md` provides sensible defaults based on standard upstream types (`Explore`, `Plan`, `general-purpose`). Because subagent workflows and custom agent definitions vary across individual environments, it is strongly recommended to adapt, add, or remove subagent types to match your own development needs.

### Placement

Pi automatically loads `AGENTS.md` at session startup from:
* Global configuration: `~/.pi/agent/AGENTS.md`
* Project configuration: `./AGENTS.md` (or parent directories)

## Architecture Overview

| Layer | Component | Function |
| --- | --- | --- |
| Base Prompt | `pi-slim` | Removes static documentation guidance. |
| Command Output | RTK + `pi-rtk-optimizer` | Filters verbose terminal outputs. |
| Active Context | Headroom / noheadroom | Compresses runtime tool results and message bloat. |
| Session History | `billion-context-pi-lean` | Compresses older conversation turns and recovers context on demand. |
| Observability | `pi-context-view` | Measures token consumption across extensions and prompts. |

## Installation & Adoption Guide

### Recommended Setup Order

1. Measure baseline context usage with `pi-context-view`.
2. Install `pi-slim` to reduce base prompt size.
3. Add RTK and `pi-rtk-optimizer` if working with verbose command lines.
4. Add Headroom to compress active tool results.
5. Add `billion-context-pi-lean` for long-session compression.
6. Swap in only the lean tool wrappers relevant to your workflow.
7. Re-measure to verify context savings.

### Best Practices

* Follow individual repository instructions for installation commands.
* Never load an upstream extension and its lean wrapper simultaneously.
* Verify pinned dependency versions when updating.
* Keep API keys and private endpoints out of public configurations.

## Automated Token Benchmarks

The repository includes a centralized benchmark tool for all six public Lean wrappers. It measures each wrapper and its exact pinned upstream dependency in separate isolated Pi processes.

```bash
npm run benchmark          # measure, show changes, update JSON and README blocks
npm run benchmark:report   # measure and print only
npm run benchmark:check    # verify the snapshot and generated README blocks
```

Structured results are stored in `benchmarks/results.json`. Generated README content is limited to `token-benchmark` marker blocks; if values do not change, files are left untouched.

## Measured Initialization Context Footprint

<!-- token-benchmark:aggregate:start -->
### Methodology

* Test environment: Pi `0.85.1` using the repository's automated benchmark tool.
* Every Lean and upstream extension is measured in a separate process with an empty temporary home and Pi agent directory.
* Built-in tools, skills, context files, messages, unrelated extensions, runtime UI, and slash commands are excluded.
* Tokens use `ceil(characters / 4)`; upstream baselines are the exact dependency versions pinned by each Lean package.

### Lean Tool Comparison

| Wrapper | Lean | Pinned Upstream | Tokens Saved | Reduction |
| --- | ---: | ---: | ---: | ---: |
| `billion-context-pi-lean` | **690** | 5,802 | 5,112 | **88.1%** |
| `pi-web-access-lean` | **152** | 2,899 | 2,747 | **94.8%** |
| `rpiv-ask-user-question-lean` | **215** | 1,258 | 1,043 | **82.9%** |
| `rpiv-todo-lean` | **246** | 904 | 658 | **72.8%** |
| `pi-subagents-lean` | **268** | 8,540 | 8,272 | **96.9%** |
| `pi-hashline-edit-pro-lean` | **423** | 1,503 | 1,080 | **71.9%** |
| **Total** | **1,994** | **20,906** | **18,912** | **90.5%** |

Across all six wrappers, recurring initialization context is reduced by **18,912 tokens (90.5%)** versus their pinned upstream versions.
<!-- token-benchmark:aggregate:end -->

## License & Attribution

Each referenced project retains its respective open-source license, authorship, and terms. All wrappers preserve original upstream attribution in their repositories and package metadata.
