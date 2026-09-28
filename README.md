# My Lean Pi Setup

[简体中文](README.zh-CN.md)

This is the [Pi coding agent](https://github.com/earendil-works/pi) setup I use every day. The goal is simple: send less useless context with every request. It includes slimmed-down versions of a few popular extensions, plus the other token-saving tools I pair them with.

## Why lean versions?

I built these for myself, then open-sourced them in case other Pi users find them useful.

One of Pi's best traits is a small, controllable context. But many great extensions ship long tool descriptions, and those get sent with every single request, eating tokens before the conversation even starts.

The lean versions only change what the model sees: tool schemas and descriptions are cut down to what's actually needed. The features and the underlying code come straight from upstream, unchanged. Modern models understand a clear schema just fine without being told the same thing three times.

Keeping them up to date is easy. When upstream releases a new version, look at what changed and whether it breaks the API or schema, bump the dependency and adjust the adapter if needed, then run the tests and re-measure the token count.

## Tools that save context

### 1. Billion Context

[Billion Context](https://github.com/ranxianglei/billion-context-pi) turns older conversation into summaries and brings details back when you need them. The model decides when to compress and what to compress, instead of everything getting cut off at a hard limit. Most useful for long sessions and models with small context windows.

**Use the official version and turn on its `lean` prompt pack.** My old [billion-context-pi-lean](https://github.com/kunkun9527/billion-context-pi-lean) is now just a historical version and is no longer maintained. Upstream took my trimmed prompts (keeping about 90% of them) and ships them as the built-in `lean` prompt pack (see [issue #4](https://github.com/kunkun9527/billion-context-pi-lean/issues/4)). It's off by default, so you have to turn it on yourself.

How to use it:

1. Install the official version: `pi install npm:billion-context-pi`.
2. In `~/.pi/acp.json` (global) or `<project>/.pi/acp.json` (one project), add:

   ```json
   {
     "compress": { "promptPack": "lean" },
     "delegate": false
   }
   ```

   `promptPack: "lean"` switches to the trimmed prompts. `delegate: false` turns off its built-in sub-agent tools, which my lean version also removed. If you want its sub-agents, leave that line out and don't install another sub-agent extension.
3. Start a new session for it to take effect.

The `lean` pack deliberately keeps the detailed `howToCompress` rules, because weaker models need them to avoid hallucinated summaries. If you run frontier models and want to trim further, override those sections in the same file with `promptSections` / `prompts`; see upstream [CONFIGURATION.md](https://github.com/ranxianglei/billion-context-pi/blob/master/CONFIGURATION.md).

### 2. pi-docs-slim

[pi-docs-slim](https://github.com/kunkun9527/pi-docs-slim) makes Pi's built-in documentation guidance load only when needed (ask with `/pi`), so the base prompt gets shorter. It's my fork of [pi-slim](https://github.com/robzolkos/pi-slim) by Rob Zolkos, updated to work on Pi 0.87.1; the original no longer removes the docs there.

```bash
pi install npm:@ssk_dev/pi-docs-slim
```

### 3. pi-context-view

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

* [mattpocock/skills](https://github.com/mattpocock/skills): a set of engineering workflows for coding agents. The requirement-alignment rule in this `AGENTS.md` uses its `grilling` skill.
* Install:

```bash
npx skills@latest add mattpocock/skills
```

### Where the rules come from

This `AGENTS.md` borrows from two open-source prompt projects and trims them down:

* [i-have-adhd](https://github.com/ayghri/i-have-adhd): lead with the result, end with a concrete next step, skip the small talk.
* [ponytail](https://github.com/DietrichGebert/ponytail): avoid over-engineering. Go down the list and stop at the first option that's enough: use an existing command or config → reuse existing code → use what the platform provides → make a small change.

### Adjust the subagent section

The `Subagents Delegation` section in `AGENTS.md` is my suggestion for using a subagent extension (for example [pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean)), and it only covers upstream's standard types (`Explore`, `Plan`, `general-purpose`). Everyone's workflow and custom agents are different, so change, add, or remove entries to fit yours. If you don't use a subagent extension, delete the whole section.

### Where to put it

Pi reads `AGENTS.md` automatically at startup from:

* Global: `~/.pi/agent/AGENTS.md`
* Project: `./AGENTS.md` in the project root (or a parent directory)

## Who does what

| Area | Component | What it does |
| --- | --- | --- |
| Base prompt | `pi-docs-slim` | Drops the built-in documentation guidance. |
| Conversation history | `billion-context-pi` (official) | Summarizes old turns and brings details back when needed. |
| Usage view | `pi-context-view` | Shows how many tokens each part uses. |

## Getting started

### Suggested order

1. Check your current token usage with `pi-context-view` so you have something to compare against.
2. Install `pi-docs-slim` to shorten the base prompt.
3. Add the official `billion-context-pi` with its `lean` prompt pack for long conversations.
4. Swap in lean versions only for the tools you actually use.
5. Measure again with `pi-context-view` to see what you saved.

### Keep in mind

* Follow each repo's own install instructions.
* Install either the original extension or its lean version, not both; loading both registers the same tools twice.
* Run the checks again after upgrading dependencies.
* Don't commit API keys or private endpoints to a public config.

## Measuring tokens

The repo has one script that measures the public lean versions I still maintain (billion-context-pi-lean is no longer maintained, so it's no longer measured). Each lean version and its pinned upstream version run in their own isolated, temporary Pi process.

```bash
npm run benchmark          # measure, show what changed, update the JSON and README numbers
npm run benchmark:report   # measure and print only; no files change
npm run benchmark:check    # check that the results and READMEs are up to date
```

Results are saved to `benchmarks/results.json`. The script only edits text between the `token-benchmark` markers in the READMEs, and leaves files alone if the numbers haven't changed.

## Context used at startup

<!-- token-benchmark:aggregate:start -->
### Methodology

* Test environment: Pi `0.87.1` using the repository's automated benchmark tool.
* Every Lean and upstream extension is measured in a separate process with an empty temporary working directory, home, and Pi agent directory.
* Built-in tools, skills, context files, session history, user messages, unrelated extensions, runtime UI, and slash commands are excluded; system-prompt and message additions from `before_agent_start` are included.
* Tokens are a fixed character-proxy estimate using `ceil(characters / 4)`, not provider tokenizer billing; upstream versions are verified against the manifest, lockfile, and installed package.

### Lean Tool Comparison

| Wrapper | Lean | Pinned Upstream | Tokens Saved | Reduction |
| --- | ---: | ---: | ---: | ---: |
| `pi-web-access-lean` | **152** | 2,953 | 2,801 | **94.9%** |
| `rpiv-ask-user-question-lean` | **215** | 1,258 | 1,043 | **82.9%** |
| `rpiv-todo-lean` | **248** | 904 | 656 | **72.6%** |
| `pi-subagents-lean` | **268** | 8,540 | 8,272 | **96.9%** |
| `pi-hashline-edit-pro-lean` | **537** | 2,040 | 1,503 | **73.7%** |
| **Total** | **1,420** | **15,695** | **14,275** | **91.0%** |

Across all 5 wrappers, recurring initialization context is reduced by **14,275 tokens (91.0%)** versus their pinned upstream versions.
<!-- token-benchmark:aggregate:end -->

## License and credits

Every project mentioned here keeps its own license, authorship, and terms. Each lean version credits its upstream project in its repo and npm package metadata.
