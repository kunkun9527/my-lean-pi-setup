# Why keep context around 200k

[Back to README](../README.md)

Keeping context around 200k is about quality (staying in the model's smart zone), and also about cost.

Every turn resends the whole context to the model. Even with cheap cache reads, each turn costs more as the context grows. Compacting also has a fixed cost: the cache has to be rewritten, and billion-context-pi-lean also needs a summary written. Compact too often and you keep paying that fixed cost; compact too late and every turn pays for a long tail of old context. In between there is a cheapest point, which you can work out from your model's pricing and how you work. Using Opus 5.5 pricing with pi-blackhole (compaction needs no output tokens, and I ignore the cost of the cheap background model), I estimate that point at about 150k–200k, right inside the smart zone. With billion-context-pi-lean you also need to count the output tokens for the summary (cheap if a cheap summary model writes it), which pushes the cheapest point a bit later, but the method is the same.
