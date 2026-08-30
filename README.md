# My Lean Pi Setup

[简体中文](README.zh-CN.md)

A documentation-only map of my token-efficient and quality-of-life setup for the [Pi coding agent](https://github.com/badlogic/pi-mono).

This repository intentionally contains no installer, copied configuration, or API credentials. Follow each linked project's own README and add only the pieces you need.

## Design goals

1. Reduce model-facing tool schemas and recurring system-prompt text.
2. Keep long sessions useful through compaction and output control.
3. Preserve upstream runtime behavior instead of rebuilding it.
4. Keep local UI integrations out of public packages.
5. Treat provider routing, speed, and notifications as quality-of-life features—not token savings.

## Token and context efficiency

### Lean wrappers I maintain

| Project | What it does | What stays intact |
| --- | --- | --- |
| [billion-context-pi-lean](https://github.com/kunkun9527/billion-context-pi-lean) | Exposes a small `compress` + `acp_context` surface over Billion Context. | The upstream context engine and recovery operations. |
| [rpiv-todo-lean](https://github.com/kunkun9527/rpiv-todo-lean) | Reduces the task tool to one compact operation schema. | The full task lifecycle and dependency handling. |
| [rpiv-ask-user-question-lean](https://github.com/kunkun9527/rpiv-ask-user-question-lean) | Keeps structured clarification with a smaller schema. | The upstream question UI and validation. |
| [pi-hashline-edit-pro-lean](https://github.com/kunkun9527/pi-hashline-edit-pro-lean) | Provides compact anchored read, replace, and undo tools. | Hashline's line-safe editing model. |
| [pi-web-access-lean](https://github.com/kunkun9527/pi-web-access-lean) | Combines web operations behind one schema with on-demand help. | Upstream search, fetch, verification, and continuation behavior. |
| [pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean) | Combines subagent operations behind one schema with on-demand help. | Discovery, foreground/background execution, results, steering, rendering, and lifecycle behavior. |

Install a wrapper only after removing or disabling the corresponding upstream extension entry. Loading both creates duplicate tools and defeats the token-saving goal.

### Other context-saving components

| Component | Role | Important note |
| --- | --- | --- |
| [pi-slim](https://github.com/robzolkos/pi-slim) | Makes Pi's recurring documentation guidance opt-in. | A direct system-prompt reduction. |
| [Billion Context](https://github.com/ranxianglei/billion-context-pi) | Compresses and restores older conversation ranges. | I use it through `billion-context-pi-lean`. |
| [Headroom / noheadroom](https://www.npmjs.com/package/@raquezha/noheadroom) | Compresses bulky context and tool results. | My cache-mode fork is local; use the upstream project as the portable starting point. |
| [pi-rtk-optimizer](https://github.com/MasuRii/pi-rtk-optimizer) + [RTK](https://github.com/rtk-ai/rtk) | Rewrites shell commands and compacts supported command output. | My local fork preserves RTK's default global history database; it is not published here. |
| [pi-context-view](https://github.com/dimk90/pi-context-view) | Shows where context is being spent. | Diagnostic only; it does not reduce context by itself. |

### Prompt-cache warming is different

[pi-warm-cache](https://github.com/ribbons-digital/pi-warm-cache) keeps supported provider prompt caches alive during idle gaps. It is **not** a compression plugin and does **not** reduce the total number of provider tokens sent. Every warm probe is a real completion that can consume cached-input, uncached-input, cache-write, and output tokens.

Use it only when the provider route is supported and the expected cache discount is worth the probe cost. Check `/warm` and `/warm savings` rather than assuming it always saves money or quota.

## Quality of life

### Provider access and speed

| Component | Role |
| --- | --- |
| [pi-multi-provider-manager](https://www.npmjs.com/package/pi-multi-provider-manager) | Manages multiple provider accounts and selected API-key providers. |
| [pi-opencode-bridge](https://www.npmjs.com/package/pi-opencode-bridge) | Discovers OpenCode models and connects them through Pi's compatible provider path. |
| Local OpenAI-compatible provider registration | Adds private or self-hosted compatible endpoints. Keep endpoint and credential configuration local. |
| [pi-openai-fast](https://github.com/diegopetrucci/pi-extensions) | Enables the supported OpenAI Codex priority service tier. This may change provider cost or quota behavior. |
| [pi-fireworks-quota](https://github.com/ZeR020/pi-fireworks-quota) | Shows Fireworks balance, spend, token, and limit information. |

Provider extensions do not automatically save tokens. Their value is routing, account management, availability, speed, or observability.

### Workflow and interface

| Component | Role |
| --- | --- |
| [pi-notify](https://github.com/diegopetrucci/pi-extensions) | Sends a notification when Pi is ready for input. |
| [@getpipher/vision](https://github.com/getpipher/vision) | Adds capability-aware image handling. My OpenAI Responses/collapsed-display changes are local only. |
| [pi-mainflow](https://github.com/fghosth/pi-mainflow) | Provides a staged planning and implementation workflow. |
| [@narumitw/pi-goal](https://github.com/narumiruna/pi-extensions) | Runs a focused autonomous objective workflow. |
| [pi-ponytail](https://github.com/thelegendtubaguy/pi-ponytail) | Adds an optional senior-developer working mode. |
| [pi-pwsh-native](https://github.com/takomine/pi-pwsh-native) | Improves native PowerShell workflows on Windows. |

## Subagent setup

My specialized agents use explicit extension allowlists so each role receives only the tools it needs. General-purpose worker agents may inherit all enabled extensions when that is intentional.

After installing [pi-subagents-lean](https://github.com/kunkun9527/pi-subagents-lean):

1. Inspect every discovered agent definition and its `model`.
2. Delete agent types you do not need.
3. Rename or edit prompts, tools, and extension allowlists for your workflow.
4. Check for same-name agents in global, workspace, and project locations, because upstream discovery precedence can select a different definition than expected.
5. Add token-saving extensions to a subagent only when they are useful for that role.

A cache warmer loaded inside one subagent process warms that process's provider cache; it does not warm every other agent session automatically.

## Public packages vs. my local setup

The public repositories above deliberately have **no dependency on my local collapsed-tool display service**. This keeps them portable for other Pi users.

In my active installation, each repository is checked out on a private `local-collapsed-compat` branch that restores the optional display integration. Those local-only commits are not pushed to GitHub. Core code and documentation can still be synchronized from public `main` while the UI-specific patch remains local.

Other unpublished customizations—such as collapsed tool rendering, cache-mode defaults, private provider endpoints, and local workflow forks—are implementation details of my machine, not installation requirements for these public packages.

## Suggested adoption order

1. Use `pi-context-view` to measure your current prompt and tool-schema cost.
2. Add `pi-slim`.
3. Replace only the large tools you actually use with the matching lean wrappers.
4. Add one compaction strategy and verify that restoration works before relying on it.
5. Configure subagent allowlists by role.
6. Add provider and workflow conveniences separately.
7. Consider `pi-warm-cache` only after measuring your provider's cache behavior and probe cost.

## Maintenance rules

- Pin or review upstream versions before upgrading a lean wrapper.
- Never load an upstream extension and its lean wrapper at the same time.
- Re-run each repository's documented checks after dependency updates.
- Keep secrets and machine-specific endpoints out of repositories.
- Compare behavior, not just schema size: lean wrappers should preserve the upstream runtime contract.

## License and attribution

This repository is documentation. Each linked project keeps its own license, authorship, and support policy. The lean repositories preserve upstream attribution in their individual READMEs and package metadata.
