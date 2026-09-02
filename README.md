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

## Measured Initialization Context Footprint

These figures reflect recurring initialization context injected into model prompts, rather than process memory.

### Methodology

* Test environment: Pi `0.84.4` with `pi-context-view` `0.4.3`, using `GPT-5.6-SOL`.
* Each extension was evaluated individually in a fresh session, excluding built-in tools, skills, and context files.
* Calculations align with `/context injections` (tool schemas, related prompts, and extension injections).
* Context View estimates tokens via `ceil(characters / 4)`.
* Upstream baselines reflect the versions pinned by each wrapper.

### Stack Breakdown

| Component | Initial Context Impact | Notes |
| --- | ---: | --- |
| `billion-context-pi-lean` | **675 tokens** | Upstream `billion-context-pi@0.1.52`: **6,061 tokens** (saves 88.9%). |
| `pi-slim@0.2.1` | **-309 tokens net** | Strips 1,236 characters of default documentation guidance from base prompt. |
| Headroom / noheadroom | **0 tokens initially** | Operates dynamically at runtime to compress context growth. |
| RTK + `pi-rtk-optimizer` | **0 tokens initially** | Operates dynamically at runtime via shell hooks. |
| `pi-context-view@0.4.3` | **0 tokens initially** | Provides observers and commands without injecting prompt instructions. |

### Lean Tool Comparison

| Wrapper | Lean | Pinned Upstream | Tokens Saved | Reduction |
| --- | ---: | ---: | ---: | ---: |
| `billion-context-pi-lean` | **675** | 6,061 | 5,386 | **88.9%** |
| `pi-subagents-lean` | **268** | 1,416 | 1,148 | **81.1%** |
| `pi-web-access-lean` | **141** | 2,376 | 2,235 | **94.1%** |
| `pi-hashline-edit-pro-lean` | **351** | 1,410 | 1,059 | **75.1%** |
| `rpiv-ask-user-question-lean` | **215** | 1,258 | 1,043 | **82.9%** |
| `rpiv-todo-lean` | **256** | 904 | 648 | **71.7%** |
| **Total** | **1,906** | **13,425** | **11,519** | **85.8%** |

Across all six wrappers, initial prompt overhead is cut to approximately one-seventh of the original footprint.

### Detailed Per-Tool Comparison

| Extension | Lean Interface Breakdown | Original Interface Breakdown |
| --- | --- | --- |
| Billion Context | `compress` (216) + `acp_context` (90) + prompt (369) = **675** | `compress` (549) + `decompress` (546) + `search_context` (210) + `acp_status` (339) + prompt (4,417) = **6,061** |
| Subagents | `subagent` = **268** | `Agent` (1,111) + `get_subagent_result` (149) + `steer_subagent` (156) = **1,416** |
| Web access | `web_access` = **141** | `web_search` (994) + `source_check` (413) + `fetch_content` (576) + `get_search_content` (393) = **2,376** |
| Hashline edit | `read` (85) + `replace` (203) + `undo_last_replace` (63) = **351** | `read` (247) + `replace` (948) + `undo_last_replace` (215) = **1,410** |
| Ask user | `ask_user_question` = **215** | `ask_user_question` = **1,258** |
| Todo | `todo` = **256** | `todo` = **904** |

## License & Attribution

Each referenced project retains its respective open-source license, authorship, and terms. All wrappers preserve original upstream attribution in their repositories and package metadata.
