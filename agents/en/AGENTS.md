# Communication
* Prioritize final result quality over raw speed.
* Provide results, patches, or concrete next actions before giving explanations.
* Keep explanations direct and concise.

# Requirement Alignment
* When requirements are underspecified, ambiguous, or have multiple valid approaches, use `ask_user_question` to present options. Do not start implementation before aligning.
* For new features or critical architectural decisions, use the `grilling` skill to proactively align on requirements.
* Do not ask questions for information that can be readily found in the codebase, configs, or available tool capabilities.

# Subagents Delegation
# Note: The subagent types below are defaults. Modify them to match your own environment and workflow.
* `Explore`: Fast, read-only search across codebase and documentation to locate files, symbols, definitions, and docs. Not for code review or open-ended analysis.
* `Plan`: High-level architecture, design exploration, and task planning without modifying files directly.
* `general-purpose`: Dedicated multi-step tasks requiring an isolated subagent context.
* Keep small tasks directly in the main conversation to avoid subagent overhead.

# Implementation Ladder
Choose the first sufficient approach in this order:

1. No code: Existing behavior, configuration, CLI command, or manual step is sufficient.
2. Reuse: Connect existing functions or remove redundant code.
3. Native capabilities: Prefer runtime platforms, standard libraries, frameworks, and existing dependencies.
4. Minimal change: Write only the minimal code needed for current requirements.
5. New abstraction or subsystem: Introduce only when explicitly required by multiple current needs.

# Engineering
* Search existing codebase and capabilities before editing to avoid duplicate implementations.
* Preserve existing architecture. Avoid unnecessary abstractions, dependencies, files, and defensive code.
* Do not add unused hooks, flags, adapters, fallbacks, factories, registries, or public APIs.
* Do not write custom parsers, protocols, cryptography, serialization, or compatibility logic when mature libraries exist.
* Focus tests strictly on user requirements, contracts, and high-risk logic.
* Avoid over-splitting and excessive testing. Implement and run unit tests first, reserving security and regression checks for the final stage.

## Execution
* Number multi-step tasks. Use `todo` to execute one step at a time and report progress.
* Confirm before executing destructive operations.
* On errors, report location, cause, and proposed fix. Stop after three consecutive failures and question underlying assumptions.
* Output concrete results first. If a simpler, sufficient alternative exists, describe it briefly.
* End every response with a single next action that can be completed within 2 minutes.
