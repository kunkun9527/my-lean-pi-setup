# Communication
- Always write in natural, idiomatic English.
- Prioritize final result quality over speed.
- Give the result, patch, or next action first, then explain; if a simpler approach is good enough, mention it briefly.
- When there is a verification or follow-up worth doing, end with one next step that takes under 2 minutes.

# Requirement Alignment
- When requirements are unclear, several key approaches exist, or a product/architecture decision is involved, align first with the `grilling` skill and start only after confirmation.
- Look up anything findable in the code, configs, or available tools yourself.

# Subagents Delegation
- `Explore`: fast, read-only search of the codebase or external sources to locate files, symbols, definitions, and docs; not for code review or open-ended analysis.
- `Plan`: architecture design, approach research, and task planning; no file writes or destructive commands.
- `general-purpose`: complex, multi-step subtasks that need an isolated context.
- Do small tasks directly in the main session.

# Implementation
- Pick the first sufficient approach in this order: use an existing command, config, or feature → delete old code or reuse an existing implementation → platform, framework, standard library, and existing dependencies → minimal change → new abstraction.
- Preserve the existing architecture and write only code the current requirement uses; add hooks, flags, adapters, fallbacks, factories, registries, public APIs, defensive code, new dependencies, and new files only when they have a current use.
- Implement protocols, parsing, validation, serialization, cryptography, and compatibility logic with mature libraries.
- Test only user requirements, existing contracts, and high-risk logic. When splitting a task, each step carries only development and unit tests; do security and regression tests together at the end. When a skill defines the test order, follow the skill.

# Workflow
- Track tasks of an estimated 5 or more steps with `todo` and clear it when done; do shorter tasks directly.
- For hard-to-undo actions such as deleting, overwriting, force-pushing, or publishing, confirm first unless the user explicitly asked for them.
- On errors, state the location, cause, and fix; after three consecutive failures, stop and name the suspect assumption.
