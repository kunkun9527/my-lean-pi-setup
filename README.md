# My Lean Pi Setup

[简体中文](README.zh-CN.md)

This is the [Pi coding agent](https://github.com/earendil-works/pi) setup I use every day. The goal is simple: send less useless context with every request. The repo has three parts:

* **Lean versions of 5 popular extensions**: same features, about 91% less always-on context combined.
* **3 companion tools**: for long-context management, the base prompt, and seeing where tokens go.
* **An `AGENTS.md` template**.

## Getting started

1. Check your current token usage with [`pi-context-view`](#pi-context-view) so you have a baseline.
2. Install [`pi-docs-slim`](#pi-docs-slim) to shorten the base prompt.
3. For long-context management, pick one: [`billion-context-pi`](#billion-context) or [`pi-blackhole`](#pi-blackhole). See [which one](#long-context-management-pick-one).
4. Swap in [lean versions](#lean-extensions) only for the tools you actually use.
5. Measure again with `pi-context-view` to see what you saved.

Keep in mind:

* Follow each repo's own install instructions.
* Install either the original extension or its lean version, not both; loading both registers the same tools twice.
* Don't commit API keys or private endpoints to a public config.

## Lean extensions

Many great Pi extensions ship long tool descriptions that get sent with every request, eating tokens before the conversation even starts. The lean versions only change what the model sees: tool schemas and descriptions are cut down to what's actually needed. Features and underlying code come straight from upstream, unchanged.

| Extension | What it does | What was trimmed |
| --- | --- | --- |
| [pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean) | Hands tasks to subagents that can run in the background and be redirected mid-task | Start, fetch results, and redirect merged into one `subagent` tool; agent discovery and lifecycle kept |
| [pi-web-access-lean](https://github.com/kunkun9527/pi-web-access-lean) | Searches the web, checks claims, fetches pages, pages through long results | Four tools merged into one `web_access`; advanced options in on-demand help |
| [pi-hashline-edit-pro-lean](https://github.com/kunkun9527/pi-hashline-edit-pro-lean) | Edits files via stable per-line HASH anchors, with one-step undo | Shorter `read`, `replace`, `undo_last_replace` descriptions; all safety checks kept |
| [rpiv-ask-user-question-lean](https://github.com/kunkun9527/rpiv-ask-user-question-lean) | Asks multiple-choice questions when a requirement or decision is unclear | Repeated wording removed; question UI and option validation unchanged |
| [rpiv-todo-lean](https://github.com/kunkun9527/rpiv-todo-lean) | Breaks work into tasks, tracks dependencies and progress | Shorter, flatter schema; no task features dropped |

### Context used at startup

<!-- token-benchmark:aggregate:start -->
| Wrapper | Lean | Pinned Upstream | Tokens Saved | Reduction |
| --- | ---: | ---: | ---: | ---: |
| `pi-web-access-lean` | **153** | 2,979 | 2,826 | **94.9%** |
| `rpiv-ask-user-question-lean` | **220** | 1,258 | 1,038 | **82.5%** |
| `rpiv-todo-lean` | **250** | 904 | 654 | **72.3%** |
| `pi-subagents-lean` | **275** | 8,540 | 8,265 | **96.8%** |
| `pi-hashline-edit-pro-lean` | **552** | 2,040 | 1,488 | **72.9%** |
| **Total** | **1,450** | **15,721** | **14,271** | **90.8%** |

Across all 5 wrappers, recurring initialization context is reduced by **14,271 tokens (90.8%)** versus their pinned upstream versions.

<details>
<summary>Methodology</summary>

* Test environment: Pi `1.0.0` using the repository's automated benchmark tool.
* Every Lean and upstream extension is measured in a separate process with an empty temporary working directory, home, and Pi agent directory.
* Built-in tools, skills, context files, session history, user messages, unrelated extensions, runtime UI, and slash commands are excluded; system-prompt and message additions from `before_agent_start` are included.
* Tokens are a fixed character-proxy estimate using `ceil(characters / 4)`, not provider tokenizer billing; upstream versions are verified against the manifest, lockfile, and installed package.

</details>
<!-- token-benchmark:aggregate:end -->

### How it works, and making your own

The trimming comes down to three methods:

1. **Shorter descriptions**: say each thing once; don't repeat types, enums, or lengths the schema already expresses; drop UI notes meant for humans and aggressive MUST-style wording. Let code handle what code can, such as filling in a missing parameter when the guess can't be wrong.
2. **Merge tools**: combine several tools into one with an `op` parameter, and move rarely used options behind `op: help`.
3. **Keep the tool list fixed for the session**: tool definitions sit at the front of the request, so adding or removing tools mid-session invalidates the whole prompt cache. That's why `pi-web-access-lean` blocks upstream's `web_enable`.

For the reasoning, before/after examples, and what Anthropic says about it, see the article: [English (dev.to)](https://dev.to/shengkai_su/cut-91-of-your-tool-prompts-a-practical-guide-for-pi-agent-users-and-extension-authors-4jo9) · [中文（知乎）](https://zhuanlan.zhihu.com/p/2087689382069383746). To make a lean version of another extension, hand [these two prompts](docs/make-your-own-lean.md) to your agent: one to build it, one to keep it in sync with upstream.

## Companion tools

| Area | Tool | What it does |
| --- | --- | --- |
| Long-context management | [Billion Context](#billion-context) or [pi-blackhole](#pi-blackhole) (pick one) | Compacts older context and brings details back |
| Base prompt | [pi-docs-slim](#pi-docs-slim) | Drops the built-in documentation guidance |
| Usage view | [pi-context-view](#pi-context-view) | Shows how many tokens each part uses |

### Long-context management: pick one

Billion Context and pi-blackhole both manage long context (say, one session running for days and adding up to billions of tokens), but in different ways. **Install only one**: both take over Pi's compaction and will overwrite each other.

The core job of both is to keep context within a set range: even on a 1M-window model, context stays around 200k or less, so the model stays in its smart zone and avoids context rot (the longer the context, the more the model overlooks or misremembers earlier content). Billion Context does this out of the box; pi-blackhole's default threshold is looser, so I recommend lowering it (see [below](#pi-blackhole)).

**Why around 200k: quality, and also cost.** Every turn resends the whole context to the model. Even with cheap cache reads, each turn costs more as the context grows. Compacting also has a fixed cost: the cache has to be rewritten, and Billion Context also has the model write a summary. Compact too often and you keep paying that fixed cost; compact too late and every turn pays for a long tail of old context. In between there is a cheapest point, which you can work out from your model's pricing and how you work. Using Opus 5.5 pricing with pi-blackhole (compaction needs no output tokens, and I ignore the cost of the cheap background model), I estimate that point at about 150k–200k, right inside the smart zone. With Billion Context you also need to count the output tokens for the summary, which pushes the cheapest point a bit later, but the method is the same.

| | Billion Context | pi-blackhole |
| --- | --- | --- |
| Who compacts | The model decides when and what to compress, and writes the summary | Code extracts goals, files, commits, preferences, etc. by rule; no model call |
| Compaction cost | The model spends output tokens on summaries | Compaction itself is free |
| Getting originals back | `decompress` restores the original content into context | `recall` searches the raw session log and returns snippets on demand |
| Cache | Cache-friendly | After compaction, the extracted info and memory form a new prefix that has to be cached again, but it's small |
| Extra requirement | None | Its built-in memory runs as background workers that need a cheap model |

**Which one:**

* **You have a cheap model** (e.g. GPT Luna, or a local model): use **pi-blackhole**. Compaction costs nothing on your main model, and the cheap model handles memory in the background.
* **You use a single model**: use **Billion Context**. No extra model to set up, and the model writes its own summaries, so quality is steadier.

### Billion Context

[Billion Context](https://github.com/ranxianglei/billion-context-pi) turns older conversation into summaries and brings details back when you need them. The model decides when and what to compress, instead of everything getting cut off at a hard limit. Most useful for long sessions and models with small context windows.

By default it nudges the model to compress each time context grows by about 50k, which usually keeps context under 150k with no tuning.

**Use the official version and turn on its `lean` prompt pack.** Upstream took my trimmed prompts (keeping about 90% of them) and ships them as the built-in `lean` pack, but it's off by default:

1. Install: `pi install npm:billion-context-pi`.
2. In `~/.pi/acp.json` (global) or `<project>/.pi/acp.json` (one project), add:

   ```json
   {
     "compress": { "promptPack": "lean" },
     "delegate": false
   }
   ```

   `delegate: false` turns off its built-in sub-agent tools. If you want its sub-agents, leave that line out and don't install another sub-agent extension.
3. Start a new session for it to take effect.

The `lean` pack deliberately keeps the detailed `howToCompress` rules, because weaker models need them to avoid hallucinated summaries. If you run frontier models and want to trim further, override those sections in the same file with `promptSections` / `prompts`; see upstream [CONFIGURATION.md](https://github.com/ranxianglei/billion-context-pi/blob/master/CONFIGURATION.md).

> My old [billion-context-pi-lean](https://github.com/kunkun9527/billion-context-pi-lean) has been merged upstream (see [issue #4](https://github.com/kunkun9527/billion-context-pi-lean/issues/4)) and is no longer maintained.

### pi-blackhole

[pi-blackhole](https://github.com/k0valik/pi-blackhole) replaces Pi's built-in `/compact` with algorithmic compaction: it extracts structured information from older turns without calling a model. It also has observational memory: background workers keep recording key facts and decisions, which are carried into each compaction.

1. Install: `pi install npm:pi-blackhole`. If you have standalone `pi-vcc` or `pi-observational-memory` installed, remove them first.
2. **Point the memory workers at a cheap model.** In `~/.pi/agent/pi-blackhole/pi-blackhole-config.json`:

   ```json
   {
     "observerModel":  { "provider": "...", "id": "..." },
     "reflectorModel": { "provider": "...", "id": "..." },
     "dropperModel":   { "provider": "...", "id": "..." }
   }
   ```

   Don't skip this. Without it, the workers fall back to your main model by default and you pay main-model prices. To rule that out entirely, also set `"sessionFallback": false`, so memory is skipped when no cheap model is available. You can also configure it in `/blackhole settings`; see upstream [CONFIG.md](https://github.com/k0valik/pi-blackhole/blob/main/docs/CONFIG.md).
3. **Recommended: lower the compaction threshold.** By default, a 1M window isn't compacted until it's 40% full (about 419k). This is the curve I use, which keeps 1M models around 200k; add it to the same config file:

   ```json
   {
     "compactAfterPreset": "smart-zone",
     "compactAfterPresets": {
       "smart-zone": [
         { "window": 131072,  "ratio": 0.8 },
         { "window": 272000,  "ratio": 0.7 },
         { "window": 1000000, "ratio": 0.175 }
       ]
     }
   }
   ```

   `ratio` is the fraction of the window at which compaction fires. Between points it changes linearly; past the last point it stays constant. For example, a 128k window compacts at about 102k, 272k at about 190k, and 1M at about 175k.
4. `/reload` or restart Pi.

By default, compaction keeps only your latest message and what follows it; earlier details come back through the summary, memory, and `recall`.

> **Non-English users**: upstream's support for Chinese and other non-English text is limited (token estimates run low, and `recall` struggles with Chinese keywords). I maintain a [fork with better Chinese support](https://github.com/kunkun9527/pi-blackhole). **It's still highly experimental.** To try it:
>
> ```bash
> pi install git:github.com/kunkun9527/pi-blackhole
> ```
>
> Installing from git requires `"npmCommand": ["npm"]` in `~/.pi/agent/settings.json`. Install either upstream or the fork, not both.

### pi-docs-slim

[pi-docs-slim](https://github.com/kunkun9527/pi-docs-slim) makes Pi's built-in documentation guidance load only when needed (ask with `/pi`), so the base prompt gets shorter. It's my fork of Rob Zolkos's [pi-slim](https://github.com/robzolkos/pi-slim), updated to work on Pi 0.87.1; the original no longer removes the docs there.

```bash
pi install npm:@ssk_dev/pi-docs-slim
```

### pi-context-view

[pi-context-view](https://github.com/dimk90/pi-context-view) shows where your tokens go: base prompt, tools, extensions, and messages. It only measures; it doesn't compress anything.

## AGENTS.md template

This repo includes the `AGENTS.md` I use, in [English](agents/en/AGENTS.md) and [简体中文](agents/zh-CN/AGENTS.md).

* **Where to put it**: `~/.pi/agent/AGENTS.md` for global rules, or `AGENTS.md` in a project root (or a parent directory). Pi reads it automatically at startup.
* **Install the skills first**: the requirement-alignment rule uses the `grilling` skill from [mattpocock/skills](https://github.com/mattpocock/skills). Install with `npx skills@latest add mattpocock/skills`.
* **Adjust the subagent section**: `Subagents Delegation` is written for a subagent extension and only covers upstream's standard types (`Explore`, `Plan`, `general-purpose`). Change it to fit your workflow, or delete it if you don't use a subagent extension.
* **Where the rules come from**: trimmed down from [i-have-adhd](https://github.com/ayghri/i-have-adhd) (lead with the result, end with a next step, skip small talk) and [ponytail](https://github.com/DietrichGebert/ponytail) (avoid over-engineering; stop at the first option that's enough).

## Maintenance and measuring

When upstream releases a new version, check what changed and whether it breaks the API or schema, bump the dependency and adjust the adapter if needed, then run the tests and re-measure tokens.

The benchmark script runs each lean version and its pinned upstream version in their own isolated, temporary Pi process:

```bash
npm run benchmark          # measure, show what changed, update the JSON and README numbers
npm run benchmark:report   # measure and print only; no files change
npm run benchmark:check    # check that the results and READMEs are up to date
```

Results are saved to `benchmarks/results.json`. The script only edits text between the `token-benchmark` markers in the READMEs, and leaves files alone if the numbers haven't changed.

## Appendix: tools I dropped after measuring

This README used to recommend RTK and Headroom. When I went through my own Pi session logs and did the math, they saved very little and caused real problems, so I removed them. The numbers come only from my setup (Windows + Git Bash + Pi, a single user). If you want to try them, measure on your own sessions first.

<details>
<summary><b>RTK + pi-rtk-optimizer</b>: only 9.7% real savings, and silently wrong results</summary>

Scope: 10 days, about 5,800 bash calls, about 2,600 of them rewritten to rtk.

* **Real savings are far below what `rtk gain` reports.** `rtk gain` said 48.6%. I re-ran 1,475 read-only commands both raw and through rtk under the same conditions (including Pi's own 50KB output cap): rtk cut output tokens by only **9.7%**. One reason for the gap: when `head`/`tail` is rewritten to `rtk read`, the savings are counted against the whole file.
* **Savings come from a handful of commands.** 91.9% of the savings came from 50 broad searches (e.g. into `node_modules`). 62.5% of commands saved nothing, and 16% produced *more* output.
* **Silently wrong results.** 16 times, plain `grep` found matches while rtk returned nothing or an error (Git Bash path conversion and regex dialect issues). Search results also get truncated and indentation stripped. The model can't tell, and reasons on them as if they were real.
* **Common flags just fail.** `git stash -q`, `diff -u/-r/-q`, `find -not/-exec`, `du` and others are unsupported, and prefixing `command` doesn't bypass the rewrite.
* **It distracts the model.** Without its hook installed, rtk adds a "No hook installed — run `rtk init -g`" line to outputs; that happened 1,238 times in 10 days. The model spent several turns investigating and eventually ran `rtk init -g` itself, which changed Claude Code's config instead.

Pi already caps each output at 50KB. For the occasional over-broad search, one line in `AGENTS.md` ("check scope with `rg -l` / `rg -c` before searching large directories") is enough.

</details>

<details>
<summary><b>Headroom / noheadroom</b>: no savings visible from Pi, about 12 hours of added waiting</summary>

Scope: 30 days, about 37,700 requests.

* **The dashboard savings aren't credible.** Over three days Headroom reported 890M tokens saved, while Pi sent only about 400M prompt tokens in total. The median input it counted was about 360K tokens; Pi's real median request was 65K. The dashboard numbers also include Headroom's own self-check requests.
* **No savings visible from Pi's side.** Prompt size per turn and cache hit rate (89–94%) on those days looked the same as any other day.
* **Compression only lasts one turn.** The extension replaces tool output in the current request only and doesn't write it back to the session, so the next turn sends the original again.
* **It slows requests down.** The extension waits for compression before sending the request. 5,321 compressions averaged 8.2 s each, 1,565 took over 5 s, about 12 hours of waiting in total.
* I later switched to lossless-only compression. It then fired just 78 times in 10 days (under 1% of turns) and saved less than 0.05% of total input, about the same as not having it.

</details>

## License and credits

Every project mentioned here keeps its own license, authorship, and terms. Each lean version credits its upstream project in its repo and npm package metadata.
