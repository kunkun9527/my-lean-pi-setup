import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const setupRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packagesRoot = path.dirname(setupRoot);
const config = JSON.parse(await readFile(path.join(setupRoot, "benchmarks", "config.json"), "utf8"));
const results = JSON.parse(await readFile(path.join(setupRoot, "benchmarks", "results.json"), "utf8"));

test("configuration covers the six public Lean wrappers", async () => {
  assert.equal(config.extensions.length, 6);
  assert.equal(config.extensions.some((extension) => extension.directory === "pi-goal-lean"), false);
  for (const extension of config.extensions) {
    const packageRoot = path.join(packagesRoot, extension.directory);
    await access(path.join(packageRoot, "index.ts"));
    const packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
    assert.equal(typeof packageJson.dependencies[extension.upstreamPackage], "string");
  }
});

test("snapshot arithmetic and aggregate totals are internally consistent", () => {
  let leanTokens = 0;
  let upstreamTokens = 0;
  for (const extension of results.extensions) {
    const defaultProfile = extension.profiles.find((profile) => profile.id === "default") ?? extension.profiles[0];
    for (const profile of extension.profiles) {
      assert.equal(profile.savedTokens, profile.upstream.totalTokens - profile.lean.totalTokens);
      assert.equal(
        profile.reductionPercent,
        Math.round(profile.savedTokens / profile.upstream.totalTokens * 1000) / 10,
      );
    }
    leanTokens += defaultProfile.lean.totalTokens;
    upstreamTokens += defaultProfile.upstream.totalTokens;
  }
  assert.equal(results.totals.leanTokens, leanTokens);
  assert.equal(results.totals.upstreamTokens, upstreamTokens);
  assert.equal(results.totals.savedTokens, upstreamTokens - leanTokens);
});

test("all generated README blocks have exactly one start and end marker", async () => {
  const files = [
    path.join(setupRoot, "README.md"),
    path.join(setupRoot, "README.zh-CN.md"),
  ];
  for (const extension of config.extensions) {
    files.push(
      path.join(packagesRoot, extension.directory, "README.md"),
      path.join(packagesRoot, extension.directory, "README.zh-CN.md"),
    );
  }

  for (const filePath of files) {
    const content = await readFile(filePath, "utf8");
    const isSetupReadme = path.dirname(filePath) === setupRoot;
    const ids = isSetupReadme ? ["aggregate"] : ["benchmark"];
    if (!isSetupReadme && !filePath.includes("pi-hashline-edit-pro-lean")) ids.push("summary");
    for (const id of ids) {
      assert.equal(content.split(`<!-- token-benchmark:${id}:start -->`).length - 1, 1, `${filePath}: ${id} start`);
      assert.equal(content.split(`<!-- token-benchmark:${id}:end -->`).length - 1, 1, `${filePath}: ${id} end`);
    }
  }
});
