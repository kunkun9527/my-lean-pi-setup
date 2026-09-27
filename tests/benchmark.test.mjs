import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { writeAtomically } from "../scripts/file-transaction.mjs";
const execFileAsync = promisify(execFile);
const setupRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packagesRoot = path.dirname(setupRoot);
const config = JSON.parse(await readFile(path.join(setupRoot, "benchmarks", "config.json"), "utf8"));
const results = JSON.parse(await readFile(path.join(setupRoot, "benchmarks", "results.json"), "utf8"));

test("configuration covers the maintained public Lean wrappers", async () => {
  assert.equal(config.extensions.length, 5);
  assert.equal(config.extensions.some((extension) => extension.directory === "billion-context-pi-lean"), false);
  assert.equal(config.extensions.some((extension) => extension.directory === "pi-goal-lean"), false);
  for (const extension of config.extensions) {
    const packageRoot = path.join(packagesRoot, extension.directory);
    await access(path.join(packageRoot, "index.ts"));
    const packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
    const declaredVersion = packageJson.dependencies[extension.upstreamPackage];
    assert.match(declaredVersion, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);

    const lockfile = JSON.parse(await readFile(path.join(packageRoot, "package-lock.json"), "utf8"));
    const lockEntry = lockfile.packages[`node_modules/${extension.upstreamPackage}`];
    assert.equal(lockEntry.version, declaredVersion);
    assert.equal(typeof lockEntry.integrity, "string");

    const installedPath = path.join(packageRoot, "node_modules", ...extension.upstreamPackage.split("/"), "package.json");
    const installed = JSON.parse(await readFile(installedPath, "utf8"));
    assert.equal(installed.name, extension.upstreamPackage);
    assert.equal(installed.version, declaredVersion);
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
        profile.upstream.totalTokens === 0
          ? 0
          : Math.round(profile.savedTokens / profile.upstream.totalTokens * 1000) / 10,
      );
    }
    leanTokens += defaultProfile.lean.totalTokens;
    upstreamTokens += defaultProfile.upstream.totalTokens;
  }
  assert.equal(results.totals.leanTokens, leanTokens);
  assert.equal(results.totals.upstreamTokens, upstreamTokens);
  assert.equal(results.totals.savedTokens, upstreamTokens - leanTokens);
  assert.equal(
    results.totals.reductionPercent,
    upstreamTokens === 0 ? 0 : Math.round((upstreamTokens - leanTokens) / upstreamTokens * 1000) / 10,
  );
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
      assert.ok(
        content.indexOf(`<!-- token-benchmark:${id}:start -->`)
          < content.indexOf(`<!-- token-benchmark:${id}:end -->`),
        `${filePath}: ${id} marker order`,
      );
    }
  }
});
test("multi-file transaction restores every original after an injected commit failure", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "pi-benchmark-transaction-test-"));
  const first = path.join(tempRoot, "first.md");
  const second = path.join(tempRoot, "second.md");
  try {
    await writeFile(first, "first-old\n", "utf8");
    await writeFile(second, "second-old\n", "utf8");
    await assert.rejects(
      writeAtomically(
        [
          [first, "first-new\n", "first-old\n"],
          [second, "second-new\n", "second-old\n"],
        ],
        { failAfterInstall: 1 },
      ),
      /Injected transaction failure/,
    );
    assert.equal(await readFile(first, "utf8"), "first-old\n");
    assert.equal(await readFile(second, "utf8"), "second-old\n");
    assert.deepEqual((await readdir(tempRoot)).sort(), ["first.md", "second.md"]);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});


test("report runs all measurements with isolated worker cwd and environment", async () => {
  const scriptPath = path.join(setupRoot, "scripts", "benchmark-extensions.mjs");
  const { stdout } = await execFileAsync(process.execPath, [scriptPath, "report"], {
    cwd: setupRoot,
    env: {
      ...process.env,
      ACP_SHOULD_NOT_LEAK: "1",
      PI_SHOULD_NOT_LEAK: "1",
      HASHLINE_SHOULD_NOT_LEAK: "1",
    },
    timeout: 180_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.match(stdout, /Measuring 5 Lean extensions in isolated Pi sessions/);
  assert.match(stdout, /Report only: no files changed/);
});
