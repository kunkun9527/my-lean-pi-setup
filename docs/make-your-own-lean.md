# Make your own lean version

[简体中文](make-your-own-lean.zh-CN.md) · [Back to README](../README.md)

For the reasoning and side-by-side examples, see the article [Cut 91% of your tool prompts: a practical guide for Pi Agent users and extension authors](https://dev.to/shengkai_su/cut-91-of-your-tool-prompts-a-practical-guide-for-pi-agent-users-and-extension-authors-4jo9). This page only holds two ready-to-use prompts: one to build a lean version, one to keep it in sync with upstream. Swap in the package names and send them to your agent.

## How it works

Create a new package, install the upstream extension as a dependency, and wrap it. When upstream registers its tools, the wrapper catches them first, swaps in the trimmed descriptions and schemas, and then registers them. When a tool actually runs, it still calls the original upstream code. No upstream code gets copied, and `node_modules` stays untouched.

## Building a lean version

```text
Make a lean version of the Pi extension <upstream package>, named <upstream package>-lean.

Goal: keep every feature exactly the same as upstream. Only shorten the tool descriptions and schemas the model reads on every request.

Steps:
1. Install upstream as a dependency and pin the version. Don't copy upstream code, and don't modify node_modules.
2. Read upstream first. List every tool it registers: its description, promptSnippet, promptGuidelines, and parameter schema, plus how many characters each one takes.
3. Wrap the pi object passed to upstream in a Proxy. Intercept registerTool, collect the upstream tools, swap in the lean descriptions and schemas, then register them. execute calls upstream directly.
4. Trimming rules:
   - Say each thing once.
   - Don't repeat types, enums, lengths, or counts in prose if the schema already expresses them.
   - Remove parameter descriptions but keep field names, types, and constraints. Only keep a short description when a field name doesn't make its purpose clear.
   - Remove UI notes that only matter to humans.
   - Don't use MUST, NEVER, or all caps.
   - Don't hardcode things the user should decide, like "only use this for N+ steps."
   - Keep any rule that affects how the model calls the tool.
5. If upstream has several tools, especially rarely used ones, merge them into one tool: use an op parameter to choose the operation, put common parameters in the schema, and pass rare ones as a JSON string. Add op: help, which returns the full upstream description and parameters for the matching tool.
6. The tool list must not change mid-session. If upstream calls setActiveTools, or has a loader tool that turns on other tools when called, block it.
7. For call mistakes the model makes often, fill in the missing piece in code before validation, but only when the guess can't be wrong. If it's ambiguous, return a clear error.
8. Write tests: every tool or op reaches upstream, help returns the full parameters, the fill-in logic doesn't misfire, and the tool list can't change mid-session.
9. Measure how many tokens the upstream and lean tools each take, and put the numbers in the README. At the top of the README, say which project this is based on and who the original author is, and keep the original license.
10. Write a MAINTENANCE.md covering: the matching upstream version, what was trimmed in each tool, which upstream internals this depends on (tool names, validation order, loader tools, and so on), and how to upgrade.

Before you start building, show me the upstream tool list and how you plan to trim it.
```

That last line matters. Agents sometimes misjudge which rules can go and which tools should be merged; checking the plan up front beats redoing the work.

## Keeping up with upstream

Pin the upstream version and upgrade by hand. The process is nearly always the same, so you can hand it to an agent too:

```text
Sync <lean package> to the latest version of upstream <upstream package>.

1. Read MAINTENANCE.md first to understand the current upstream version and adaptation points.
2. Check the latest upstream version. Compare the code and changelog between the two versions, and list: added or removed tools, changes to parameters and defaults, behavior changes, and whether the internals recorded in MAINTENANCE.md still hold.
3. If only the version number changed and the code didn't, just upgrade the dependency.
4. For new parameters or tools, add them to the lean version using the same trimming rules: common ones go in the schema, rare ones go in help. If upstream changed behavior, update the descriptions so they still match what the tool does.
5. Run the tests, re-measure the tokens, and update the README and MAINTENANCE.md.
6. Summarize the changes for me, and only publish after I confirm.
```

Most upstream updates only change internal logic, so upgrading the dependency is all it takes. When the adapter does need changes, it's usually because upstream renamed a tool or changed parameters.
