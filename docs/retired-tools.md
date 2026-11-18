# Tools I dropped after measuring

[Back to README](../README.md)

This repo's README used to recommend RTK and Headroom. When I went through my own Pi session logs and did the math, they saved very little and caused real problems, so I removed them. The numbers come only from my setup (Windows + Git Bash + Pi, a single user). If you want to try them, measure on your own sessions first.

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
