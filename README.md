# My Lean Pi Setup

[简体中文](README.zh-CN.md)

This is the [Pi coding agent](https://github.com/earendil-works/pi) setup I use every day. The goal is simple: send less useless context with every request. It includes slimmed-down versions of a few popular extensions, plus the other token-saving tools I pair them with.

## Why lean versions?

I built these for myself, then open-sourced them in case other Pi users find them useful.

One of Pi's best traits is a small, controllable context. But many great extensions ship long tool descriptions, and those get sent with every single request, eating tokens before the conversation even starts.

The lean versions only change what the model sees: tool schemas and descriptions are cut down to what's actually needed. The features and the underlying code come straight from upstream, unchanged. Modern models understand a clear schema just fine without being told the same thing three times.

Keeping them up to date is easy. When upstream releases a new version, look at what changed and whether it breaks the API or schema, bump the dependency and adjust the adapter if needed, then run the tests and re-measure the token count.

## Tools that save context

### 1. billion-context-pi-lean

[billion-context-pi-lean](https://github.com/kunkun9527/billion-context-pi-lean) is a lean version of [Billion Context](https://github.com/ranxianglei/billion-context-pi) that exposes just two tools: `compress` and `acp_context`. It turns older conversation into summaries, brings details back when you need them, and nudges the model to compress stale content. Most useful for models with small context windows.

### 2. pi-slim

[pi-slim](https://github.com/robzolkos/pi-slim) makes Pi's built-in documentation guidance load only when needed, so the base prompt gets shorter.

### 3. Headroom / noheadroom

[Headroom / noheadroom](https://www.npmjs.com/package/@raquezha/noheadroom) compresses long tool output and the running context. In my daily use it saves roughly **20% to 30%** of tokens (that's what I see in normal work, not a formal benchmark). Older history is handled by Billion Context.

### 4. RTK and pi-rtk-optimizer

[RTK](https://github.com/rtk-ai/rtk) and [pi-rtk-optimizer](https://github.com/MasuRii/pi-rtk-optimizer) filter and shrink shell command output before it reaches the conversation.

### 5. pi-context-view

[pi-context-view](https://github.com/dimk90/pi-context-view) shows where your tokens go: base prompt, tools, extensions, and messages. It only measures; it doesn't compress anything.

## Lean tool versions

### pi-subagents-lean

[pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean) hands tasks off to subagents, which can run in the background and be redirected mid-task. The lean version merges starting, fetching results, and redirecting into one `subagent` tool, and keeps upstream's agent discovery and lifecycle handling.

### pi-web-access-lean

[pi-web-access-lean](https://github.com/kunkun9527/pi-web-access-lean) searches the web, checks claims, fetches pages, and lets you page through long results. The lean version merges the original four tools into a single `web_access` tool; advanced options live in on-demand help.

### pi-hashline-edit-pro-lean

[pi-hashline-edit-pro-lean](https://github.com/kunkun9527/pi-hashline-edit-pro-lean) edits files by pointing at lines with stable HASH anchors, and can undo a bad edit in one step. The lean version shortens the descriptions for `read`, `replace`, and `undo_last_replace`; all of Hashline's safety checks are still there.

### rpiv-ask-user-question-lean

[rpiv-ask-user-question-lean](https://github.com/kunkun9527/rpiv-ask-user-question-lean) asks you multiple-choice questions when a requirement or decision is unclear. The lean version drops the repeated wording from the tool description; the question UI and option validation are unchanged.

### rpiv-todo-lean

[rpiv-todo-lean](https://github.com/kunkun9527/rpiv-todo-lean) breaks work into tasks, tracks dependencies, and follows progress. The lean version uses a shorter, flatter schema without dropping any task features.

## AGENTS.md template

This repo includes the `AGENTS.md` I use, in [English](agents/en/AGENTS.md) and [简体中文](agents/zh-CN/AGENTS.md).

### Install the skills first

Before using these rules, I recommend installing Matt Pocock's skills:

* [mattpocock/skills](https://github.com/mattpocock/skills): a set of engineering workflows for coding agents. The requirement-alignment rule in this `AGENTS.md` relies on skills like `/grill-me`.
* Install:

```bash
npx skills@latest add mattpocock/skills
```

### Where the rules come from

This `AGENTS.md` borrows from two open-source prompt projects and trims them down:

* [i-have-adhd](https://github.com/ayghri/i-have-adhd): lead with the result, number multi-step work, end with a concrete next step, skip the small talk.
* [ponytail](https://github.com/DietrichGebert/ponytail): avoid over-engineering. Go down the list and stop at the first option that's enough: no code → reuse existing code → use what the platform provides → make a small change.

### Adjust the subagent section

The `Subagents Delegation` section in `AGENTS.md` only covers upstream's standard types (`Explore`, `Plan`, `general-purpose`). Everyone's workflow and custom agents are different, so change, add, or remove entries to fit yours.

### Where to put it

Pi reads `AGENTS.md` automatically at startup from:

* Global: `~/.pi/agent/AGENTS.md`
* Project: `./AGENTS.md` in the project root (or a parent directory)

## Who does what

| Area | Component | What it does |
| --- | --- | --- |
| Base prompt | `pi-slim` | Drops the built-in documentation guidance. |
| Command output | RTK + `pi-rtk-optimizer` | Filters long terminal output. |
| Current context | Headroom / noheadroom | Compresses tool output and messages while you work. |
| Conversation history | `billion-context-pi-lean` | Summarizes old turns and brings details back when needed. |
| Usage view | `pi-context-view` | Shows how many tokens each part uses. |

## Getting started

### Suggested order

1. Check your current token usage with `pi-context-view` so you have something to compare against.
2. Install `pi-slim` to shorten the base prompt.
3. If your commands produce lots of output, add RTK and `pi-rtk-optimizer`.
4. Add Headroom to compress tool output.
5. Add `billion-context-pi-lean` for long conversations.
6. Swap in lean versions only for the tools you actually use.
7. Measure again with `pi-context-view` to see what you saved.

### Keep in mind

* Follow each repo's own install instructions.
* Install either the original extension or its lean version, not both; loading both registers the same tools twice.
* Run the checks again after upgrading dependencies.
* Don't commit API keys or private endpoints to a public config.

## Measuring tokens

The repo has one script that measures all six public lean versions. Each lean version and its pinned upstream version run in their own isolated, temporary Pi process.

```bash
npm run benchmark          # measure, show what changed, update the JSON and README numbers
npm run benchmark:report   # measure and print only; no files change
npm run benchmark:check    # check that the results and READMEs are up to date
```

Results are saved to `benchmarks/results.json`. The script only edits text between the `token-benchmark` markers in the READMEs, and leaves files alone if the numbers haven't changed.

## Context used at startup

<!-- token-benchmark:aggregate:start -->
### Methodology

* Test environment: Pi `0.85.1` using the repository's automated benchmark tool.
* Every Lean and upstream extension is measured in a separate process with an empty temporary working directory, home, and Pi agent directory.
* Built-in tools, skills, context files, session history, user messages, unrelated extensions, runtime UI, and slash commands are excluded; system-prompt and message additions from `before_agent_start` are included.
* Tokens are a fixed character-proxy estimate using `ceil(characters / 4)`, not provider tokenizer billing; upstream versions are verified against the manifest, lockfile, and installed package.

### Lean Tool Comparison

| Wrapper | Lean | Pinned Upstream | Tokens Saved | Reduction |
| --- | ---: | ---: | ---: | ---: |
| `billion-context-pi-lean` | **690** | 5,802 | 5,112 | **88.1%** |
| `pi-web-access-lean` | **152** | 2,899 | 2,747 | **94.8%** |
| `rpiv-ask-user-question-lean` | **215** | 1,258 | 1,043 | **82.9%** |
| `rpiv-todo-lean` | **246** | 904 | 658 | **72.8%** |
| `pi-subagents-lean` | **268** | 8,540 | 8,272 | **96.9%** |
| `pi-hashline-edit-pro-lean` | **537** | 1,934 | 1,397 | **72.2%** |
| **Total** | **2,108** | **21,337** | **19,229** | **90.1%** |

Across all six wrappers, recurring initialization context is reduced by **19,229 tokens (90.1%)** versus their pinned upstream versions.
<!-- token-benchmark:aggregate:end -->

## License and credits

Every project mentioned here keeps its own license, authorship, and terms. Each lean version credits its upstream project in its repo and npm package metadata.
