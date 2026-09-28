import { spawn } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { writeAtomically } from "./file-transaction.mjs";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const setupRoot = path.dirname(scriptDir);
const configPath = path.join(setupRoot, "benchmarks", "config.json");
const workerPath = path.join(scriptDir, "measure-extension-worker.mjs");
const command = process.argv[2] ?? "report";
const validCommands = new Set(["report", "update", "check"]);

if (!validCommands.has(command)) {
  fail(`Unknown command: ${command}. Use report, update, or check.`);
}

const config = JSON.parse(await readFile(configPath, "utf8"));
const packagesRoot = path.resolve(setupRoot, config.packagesRoot);
const resultsPath = path.resolve(setupRoot, config.resultsFile);
let previous;
let previousText;
try {
  previousText = await readFile(resultsPath, "utf8");
  previous = JSON.parse(previousText);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

async function main() {
  await preloadReadmes();
  console.log(`\nMeasuring ${config.extensions.length} Lean extensions in isolated Pi sessions...\n`);

  let current;
  try {
    current = await measureAll(config.extensions);
  } catch (error) {
    console.error("\n\x1b[31;1mTOKEN BENCHMARK FAILED\x1b[0m");
    console.error(error instanceof Error ? error.message : String(error));
    console.error("No benchmark JSON or README files were changed.");
    process.exitCode = 1;
    return;
  }

  printComparison(current, previous);

  const renderedFiles = renderAllReadmes(current, config.extensions);
  const snapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    estimator: "fixed character proxy: ceil(characters / 4)",
    piVersion: current.piVersion,
    totals: current.totals,
    extensions: current.extensions,
  };
  if (previous && stableJson(previous) === stableJson(snapshot)) {
    snapshot.generatedAt = previous.generatedAt;
  }
  const snapshotText = `${JSON.stringify(snapshot, null, 2)}\n`;

  if (command === "report") {
    console.log("\nReport only: no files changed.");
    return;
  }

  if (command === "check") {
    const stale = [];
    if (previousText !== snapshotText) {
      stale.push(relativeDisplay(resultsPath));
    }
    for (const [filePath, expected] of renderedFiles) {
      const actual = await readFile(filePath, "utf8");
      if (actual !== expected) stale.push(relativeDisplay(filePath));
    }
    if (stale.length > 0) {
      console.error("\n\x1b[31;1mBENCHMARK CHECK FAILED\x1b[0m");
      console.error("Outdated generated files:");
      for (const file of stale) console.error(`  - ${file}`);
      console.error("Run: npm run benchmark");
      process.exitCode = 1;
      return;
    }
    console.log("\n\x1b[32;1mBenchmark snapshot and README blocks are current.\x1b[0m");
    return;
  }

  const writes = new Map(renderedFiles);
  writes.set(resultsPath, snapshotText);
  const changed = [];
  for (const [filePath, expected] of writes) {
    let actual;
    try {
      actual = await readFile(filePath, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (actual !== expected) changed.push([filePath, expected, actual]);
  }

  if (changed.length === 0) {
    console.log("\nNo generated files changed.");
    return;
  }

  await writeAtomically(changed);
  console.log("\nUpdated generated files:");
  for (const [filePath] of changed) console.log(`  - ${relativeDisplay(filePath)}`);
}

async function measureAll(extensionConfigs) {
  const extensions = [];
  let piVersion;
  for (const extensionConfig of extensionConfigs) {
    const packageRoot = containedPath(packagesRoot, extensionConfig.directory, `${extensionConfig.id}: directory`);
    const leanPackage = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
    const dependency = await validateUpstreamDependency(packageRoot, leanPackage, extensionConfig);
    const { upstreamRoot, upstreamPackage } = dependency;
    const upstreamEntry = upstreamPackage.pi?.extensions?.[0] ?? upstreamPackage.main;
    if (typeof upstreamEntry !== "string" || upstreamEntry.length === 0) {
      throw new Error(`${extensionConfig.id}: upstream package has no valid pi.extensions or main entry.`);
    }
    const upstreamExtensionPath = containedPath(upstreamRoot, upstreamEntry, `${extensionConfig.id}: upstream entry`);
    await access(path.join(packageRoot, "index.ts"));
    await access(upstreamExtensionPath);
    console.log(`  ${extensionConfig.displayName}`);
    const profiles = [];
    for (const profile of extensionConfig.profiles) {
      const lean = await runMeasurement({
        extensionId: extensionConfig.id,
        variant: "lean",
        profile,
        extensionPath: path.join(packageRoot, "index.ts"),
      });
      const upstream = await runMeasurement({
        extensionId: extensionConfig.id,
        variant: "upstream",
        profile,
        extensionPath: upstreamExtensionPath,
        adapterFactory: extensionConfig.upstreamFactory,
      });
      piVersion ??= lean.piVersion;
      if (lean.piVersion !== piVersion || upstream.piVersion !== piVersion) {
        throw new Error(`${extensionConfig.id}: inconsistent Pi versions during measurement.`);
      }
      const savedTokens = upstream.totalTokens - lean.totalTokens;
      profiles.push({
        id: profile.id,
        label: profile.label,
        lean: compactMeasurement(lean),
        upstream: compactMeasurement(upstream),
        savedTokens,
        reductionPercent: upstream.totalTokens === 0 ? 0 : round1(savedTokens / upstream.totalTokens * 100),
      });
      console.log(`    ${profile.label}: ${lean.totalTokens} vs ${upstream.totalTokens} (${signed(savedTokens)} saved)`);
    }

    extensions.push({
      id: extensionConfig.id,
      directory: extensionConfig.directory,
      displayName: extensionConfig.displayName,
      leanPackage: leanPackage.name,
      leanVersion: leanPackage.version,
      upstreamPackage: upstreamPackage.name,
      upstreamVersion: upstreamPackage.version,
      profiles,
    });
  }

  const defaults = extensions.map((extension) => extension.profiles.find((profile) => profile.id === "default") ?? extension.profiles[0]);
  const leanTokens = defaults.reduce((sum, profile) => sum + profile.lean.totalTokens, 0);
  const upstreamTokens = defaults.reduce((sum, profile) => sum + profile.upstream.totalTokens, 0);
  const savedTokens = upstreamTokens - leanTokens;
  return {
    piVersion,
    extensions,
    totals: {
      leanTokens,
      upstreamTokens,
      savedTokens,
      reductionPercent: upstreamTokens === 0 ? 0 : round1(savedTokens / upstreamTokens * 100),
    },
  };
}

async function runMeasurement({ extensionId, variant, profile, extensionPath, adapterFactory }) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), `pi-token-bench-${extensionId}-${variant}-`));
  const home = path.join(tempRoot, "home");
  const cwd = path.join(tempRoot, "cwd");
  const agentDir = path.join(home, ".pi", "agent");
  const inputPath = path.join(tempRoot, "input.json");
  const resultPath = path.join(tempRoot, "result.json");
  try {
    await Promise.all([mkdir(home, { recursive: true }), mkdir(cwd, { recursive: true }), mkdir(agentDir, { recursive: true })]);
    for (const [relativePath, content] of Object.entries(profile.homeFiles ?? {})) {
      const filePath = path.join(home, relativePath);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf8");
    }
    let measuredExtensionPath = extensionPath;
    if (adapterFactory) {
      measuredExtensionPath = path.join(tempRoot, "adapter.mjs");
      const moduleUrl = pathToFileURL(extensionPath).href;
      const options = JSON.stringify(adapterFactory.options ?? {});
      const source = `import { ${adapterFactory.exportName} as createExtension } from ${JSON.stringify(moduleUrl)};\nexport default createExtension(${options});\n`;
      await writeFile(measuredExtensionPath, source, "utf8");
    }
    await writeFile(inputPath, `${JSON.stringify({ extensionPath: measuredExtensionPath, cwd, agentDir, resultPath }, null, 2)}\n`, "utf8");
    const result = await spawnWorker(inputPath, isolatedEnvironment(home, agentDir), cwd);
    if (result.code !== 0) {
      throw new Error(`${extensionId}/${variant}/${profile.id} exited ${result.code}.\n${result.stderr || result.stdout}`);
    }
    return JSON.parse(await readFile(resultPath, "utf8"));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function isolatedEnvironment(home, agentDir) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^ACP_/i.test(key) || /^(BILLION_CONTEXT|HASHLINE|RPIV_|SUBAGENTS_|WEB_ACCESS)/i.test(key)) delete env[key];
    if (/^PI_/i.test(key) && !["PI_GLOBAL_NODE_MODULES", "PI_CODING_AGENT_MODULE"].includes(key)) delete env[key];
  }
  return {
    ...env,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    PI_CODING_AGENT_DIR: agentDir,
    PI_AGENT_DIR: agentDir,
    NO_UPDATE_NOTIFIER: "1",
    PI_SKIP_UPDATE_CHECK: "1",
  };
}

function spawnWorker(inputPath, env, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath, inputPath], {
      cwd,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let spawnError;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, 60_000);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { spawnError = error; });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (spawnError) reject(spawnError);
      else if (timedOut) reject(new Error(`Measurement timed out after 60 seconds: ${inputPath}`));
      else resolve({ code, stdout, stderr });
    });
  });
}

function compactMeasurement(measurement) {
  return {
    totalTokens: measurement.totalTokens,
    toolTokens: measurement.toolTokens,
    promptDeltaTokens: measurement.promptDeltaTokens,
    promptDeltaChars: measurement.promptDeltaChars,
    eventMessageChars: measurement.eventMessageChars,
    activeToolNames: measurement.activeToolNames,
    tools: measurement.tools.map(({ name, chars, tokens, descriptionChars, schemaChars, snippetChars, guidelineChars }) => ({
      name,
      chars,
      tokens,
      descriptionChars,
      schemaChars,
      snippetChars,
      guidelineChars,
    })),
  };
}

function renderAllReadmes(result, extensionConfigs) {
  const files = new Map();
  for (const extensionConfig of extensionConfigs) {
    const extension = result.extensions.find((item) => item.id === extensionConfig.id);
    const packageRoot = path.join(packagesRoot, extension.directory);
    for (const [fileName, language] of [["README.md", "en"], ["README.zh-CN.md", "zh"]]) {
      const filePath = path.join(packageRoot, fileName);
      files.set(filePath, renderExtensionReadme(filePath, extension, result.piVersion, language));
    }
  }
  for (const [fileName, language] of [["README.md", "en"], ["README.zh-CN.md", "zh"]]) {
    const filePath = path.join(setupRoot, fileName);
    files.set(filePath, renderSetupReadme(filePath, result, language));
  }
  return files;
}

function renderExtensionReadme(filePath, extension, piVersion, language) {
  const content = readFileSyncText(filePath);
  let rendered = replaceManagedBlock(content, "benchmark", extensionBenchmark(extension, piVersion, language), filePath);
  if (rendered.includes("<!-- token-benchmark:summary:start -->")) {
    rendered = replaceManagedBlock(rendered, "summary", extensionSummary(extension, language), filePath);
  }
  return rendered;
}

function renderSetupReadme(filePath, result, language) {
  return replaceManagedBlock(readFileSyncText(filePath), "aggregate", aggregateBenchmark(result, language), filePath);
}

function extensionSummary(extension, language) {
  const profile = extension.profiles.find((item) => item.id === "default") ?? extension.profiles[0];
  if (language === "zh") {
    return `> **Token 基准：Lean ${format(profile.lean.totalTokens)}，上游 \`${extension.upstreamPackage}@${extension.upstreamVersion}\` ${format(profile.upstream.totalTokens)}，减少 ${profile.reductionPercent.toFixed(1)}%。**`;
  }
  return `> **Token benchmark: Lean ${format(profile.lean.totalTokens)}, upstream \`${extension.upstreamPackage}@${extension.upstreamVersion}\` ${format(profile.upstream.totalTokens)} — ${profile.reductionPercent.toFixed(1)}% fewer.**`;
}

function extensionBenchmark(extension, piVersion, language) {
  if (extension.profiles.length > 1) return profileBenchmark(extension, piVersion, language);
  const profile = extension.profiles[0];
  const leanTools = breakdown(profile.lean, language);
  const upstreamTools = breakdown(profile.upstream, language);
  if (language === "zh") {
    return [
      `单独启用本扩展时，模型可见的常驻初始化上下文如下：`,
      "",
      "| 版本 | 工具与 Prompt 构成 | 合计 |",
      "| --- | --- | ---: |",
      `| Lean \`${extension.leanPackage}@${extension.leanVersion}\` | ${leanTools} | **${format(profile.lean.totalTokens)}** |`,
      `| 上游 \`${extension.upstreamPackage}@${extension.upstreamVersion}\` | ${upstreamTools} | **${format(profile.upstream.totalTokens)}** |`,
      "",
      `节省 **${format(profile.savedTokens)} tokens（${profile.reductionPercent.toFixed(1)}%）**。`,
      methodLine(piVersion, "zh"),
    ].join("\n");
  }
  return [
    "With only this extension enabled, its recurring model-facing initialization contribution is:",
    "",
    "| Variant | Tool and prompt contribution | Total |",
    "| --- | --- | ---: |",
    `| Lean \`${extension.leanPackage}@${extension.leanVersion}\` | ${leanTools} | **${format(profile.lean.totalTokens)}** |`,
    `| Upstream \`${extension.upstreamPackage}@${extension.upstreamVersion}\` | ${upstreamTools} | **${format(profile.upstream.totalTokens)}** |`,
    "",
    `This saves **${format(profile.savedTokens)} tokens (${profile.reductionPercent.toFixed(1)}%)**.`,
    methodLine(piVersion, "en"),
  ].join("\n");
}

function profileBenchmark(extension, piVersion, language) {
  const rows = extension.profiles.map((profile) => {
    const saved = language === "zh"
      ? `${format(profile.savedTokens)}（${profile.reductionPercent.toFixed(1)}%）`
      : `${format(profile.savedTokens)} (${profile.reductionPercent.toFixed(1)}%)`;
    return `| ${profileDisplayLabel(profile, language)} | **${format(profile.lean.totalTokens)}** | ${format(profile.upstream.totalTokens)} | **${saved}** |`;
  });
  const detailed = extension.profiles.map((profile) => {
    const label = profileDisplayLabel(profile, language);
    if (language === "zh") {
      return `- **${label} Lean：**${breakdown(profile.lean, language)}\n- **${label} 上游：**${breakdown(profile.upstream, language)}`;
    }
    return `- **${label} Lean:** ${breakdown(profile.lean, language)}\n- **${label} upstream:** ${breakdown(profile.upstream, language)}`;
  }).join("\n");
  if (language === "zh") {
    return [
      `针对上游 \`${extension.upstreamPackage}@${extension.upstreamVersion}\`，实测结果如下：`,
      "",
      "| 配置 | Lean | 上游 | 节省 |",
      "| --- | ---: | ---: | ---: |",
      ...rows,
      "",
      detailed,
      "",
      methodLine(piVersion, "zh"),
    ].join("\n");
  }
  return [
    `Measured against upstream \`${extension.upstreamPackage}@${extension.upstreamVersion}\`:`,
    "",
    "| Configuration | Lean | Upstream | Saved |",
    "| --- | ---: | ---: | ---: |",
    ...rows,
    "",
    detailed,
    "",
    methodLine(piVersion, "en"),
  ].join("\n");
}

function aggregateBenchmark(result, language) {
  const rows = result.extensions.map((extension) => {
    const profile = extension.profiles.find((item) => item.id === "default") ?? extension.profiles[0];
    return `| \`${extension.directory}\` | **${format(profile.lean.totalTokens)}** | ${format(profile.upstream.totalTokens)} | ${format(profile.savedTokens)} | **${profile.reductionPercent.toFixed(1)}%** |`;
  });
  const totals = result.totals;
  if (language === "zh") {
    return [
      "| 扩展封装 | 精简版 | 锁定上游 | 节省 Token | 降幅 |",
      "| --- | ---: | ---: | ---: | ---: |",
      ...rows,
      `| **合计** | **${format(totals.leanTokens)}** | **${format(totals.upstreamTokens)}** | **${format(totals.savedTokens)}** | **${totals.reductionPercent.toFixed(1)}%** |`,
      "",
      `${config.extensions.length} 个精简版合计，常驻的初始上下文比锁定的上游版本少 **${format(totals.savedTokens)} tokens（${totals.reductionPercent.toFixed(1)}%）**。`,
      "",
      "<details>",
      "<summary>测量方式</summary>",
      "",
      `* 测试环境：Pi \`${result.piVersion}\`，使用仓库内置自动化工具。`,
      "* 每个精简版和它的上游版本，都在独立的临时进程里测，工作目录、Home 和 Pi Agent 目录都是空的。",
      "* 不计内置工具、Skills、上下文文件、会话历史、用户消息、无关扩展、运行时 UI 和 Slash Commands；计入扩展通过 `before_agent_start` 注入的系统提示和消息。",
      "* Token 按 `ceil(字符数 / 4)` 估算，不是某个模型 tokenizer 的实际计费值。上游版本是各精简包锁定的精确版本，已对照 lockfile 和已安装的包校验。",
      "",
      "</details>",
    ].join("\n");
  }
  return [
    "| Wrapper | Lean | Pinned Upstream | Tokens Saved | Reduction |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...rows,
    `| **Total** | **${format(totals.leanTokens)}** | **${format(totals.upstreamTokens)}** | **${format(totals.savedTokens)}** | **${totals.reductionPercent.toFixed(1)}%** |`,
    "",
    `Across all ${config.extensions.length} wrappers, recurring initialization context is reduced by **${format(totals.savedTokens)} tokens (${totals.reductionPercent.toFixed(1)}%)** versus their pinned upstream versions.`,
    "",
    "<details>",
    "<summary>Methodology</summary>",
    "",
    `* Test environment: Pi \`${result.piVersion}\` using the repository's automated benchmark tool.`,
    "* Every Lean and upstream extension is measured in a separate process with an empty temporary working directory, home, and Pi agent directory.",
    "* Built-in tools, skills, context files, session history, user messages, unrelated extensions, runtime UI, and slash commands are excluded; system-prompt and message additions from `before_agent_start` are included.",
    "* Tokens are a fixed character-proxy estimate using `ceil(characters / 4)`, not provider tokenizer billing; upstream versions are verified against the manifest, lockfile, and installed package.",
    "",
    "</details>",
  ].join("\n");
}

function methodLine(piVersion, language) {
  if (language === "zh") {
    return `测量环境为 Pi ${piVersion} 的独立临时进程、空白工作目录与空白配置。排除内置工具、Skills、上下文文件、会话历史、用户消息、无关扩展、运行时 UI 与 Slash Commands；计入扩展的 \`before_agent_start\` 注入。Token 是按 \`ceil(字符数 / 4)\` 计算的固定字符代理估算，并非模型 tokenizer 实际计费值。`;
  }
  return `Measured with Pi ${piVersion} in separate temporary processes with empty working directories and configuration. Built-in tools, skills, context files, session history, user messages, unrelated extensions, runtime UI, and slash commands are excluded; \`before_agent_start\` additions are included. Tokens are a fixed character-proxy estimate using \`ceil(characters / 4)\`, not provider tokenizer billing.`;
}

function profileDisplayLabel(profile, language) {
  if (language !== "zh") return profile.label;
  if (profile.id === "default") return "默认";
  if (profile.id === "anchor-grep") return "启用 anchor_grep";
  return profile.label;
}

function breakdown(measurement, language) {
  const parts = measurement.tools.map((tool) => `\`${tool.name}\` (${format(tool.tokens)})`);
  if (measurement.promptDeltaTokens !== 0) {
    parts.push(`${language === "zh" ? "Prompt 注入" : "prompt additions"} (${format(measurement.promptDeltaTokens)})`);
  }
  return parts.length > 0 ? parts.join(" + ") : language === "zh" ? "无常驻注入" : "no recurring injection";
}

function replaceManagedBlock(content, id, body, filePath) {
  const start = `<!-- token-benchmark:${id}:start -->`;
  const end = `<!-- token-benchmark:${id}:end -->`;
  const startCount = content.split(start).length - 1;
  const endCount = content.split(end).length - 1;
  const startIndex = content.indexOf(start);
  const endIndex = content.indexOf(end);
  if (startCount !== 1 || endCount !== 1 || endIndex < startIndex + start.length) {
    throw new Error(
      `${relativeDisplay(filePath)} must contain exactly one ordered marker pair for ${id}; found ${startCount} start and ${endCount} end markers.`,
    );
  }
  const before = content.slice(0, startIndex + start.length);
  const after = content.slice(endIndex);
  return `${before}\n${body.trim()}\n${after}`;
}

function readFileSyncText(filePath) {
  return globalThis.__benchmarkReadCache?.get(filePath) ?? (() => {
    throw new Error(`Internal error: README was not preloaded: ${filePath}`);
  })();
}

async function preloadReadmes() {
  const cache = new Map();
  for (const extension of config.extensions) {
    const root = path.join(packagesRoot, extension.directory);
    for (const fileName of ["README.md", "README.zh-CN.md"]) {
      const filePath = path.join(root, fileName);
      cache.set(filePath, await readFile(filePath, "utf8"));
    }
  }
  for (const fileName of ["README.md", "README.zh-CN.md"]) {
    const filePath = path.join(setupRoot, fileName);
    cache.set(filePath, await readFile(filePath, "utf8"));
  }
  globalThis.__benchmarkReadCache = cache;
}


async function validateUpstreamDependency(packageRoot, leanPackage, extensionConfig) {
  const packageName = extensionConfig.upstreamPackage;
  const declaredVersion = leanPackage.dependencies?.[packageName];
  if (typeof declaredVersion !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(declaredVersion)) {
    throw new Error(`${extensionConfig.id}: ${packageName} must be pinned to an exact version; found ${JSON.stringify(declaredVersion)}.`);
  }

  const lockfile = JSON.parse(await readFile(path.join(packageRoot, "package-lock.json"), "utf8"));
  const lockKey = `node_modules/${packageName}`;
  const lockEntry = lockfile.packages?.[lockKey];
  if (!lockEntry) throw new Error(`${extensionConfig.id}: package-lock.json is missing ${lockKey}.`);
  if (lockEntry.version !== declaredVersion) {
    throw new Error(`${extensionConfig.id}: lockfile has ${packageName}@${lockEntry.version}, expected ${declaredVersion}.`);
  }
  if (typeof lockEntry.integrity !== "string" || lockEntry.integrity.length === 0) {
    throw new Error(`${extensionConfig.id}: lockfile entry for ${packageName}@${declaredVersion} has no integrity hash.`);
  }

  const upstreamRoot = packageRootForDependency(packageRoot, packageName);
  const upstreamPackage = JSON.parse(await readFile(path.join(upstreamRoot, "package.json"), "utf8"));
  if (upstreamPackage.name !== packageName || upstreamPackage.version !== declaredVersion) {
    throw new Error(
      `${extensionConfig.id}: installed dependency is ${upstreamPackage.name}@${upstreamPackage.version}; expected ${packageName}@${declaredVersion}.`,
    );
  }
  return { upstreamRoot, upstreamPackage };
}

function containedPath(root, relativePath, label) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath)) {
    throw new Error(`${label} must be a relative path.`);
  }
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return resolved;
  throw new Error(`${label} escapes its allowed root: ${relativePath}`);
}

function packageRootForDependency(packageRoot, packageName) {
  return path.join(packageRoot, "node_modules", ...packageName.split("/"));
}

function stableJson(value) {
  const copy = structuredClone(value);
  delete copy.generatedAt;
  return JSON.stringify(copy);
}

function printComparison(currentResult, oldResult) {
  console.log("\nToken comparison:");
  for (const extension of currentResult.extensions) {
    const oldExtension = oldResult?.extensions?.find((item) => item.id === extension.id);
    for (const profile of extension.profiles) {
      const oldProfile = oldExtension?.profiles?.find((item) => item.id === profile.id);
      const leanDelta = oldProfile ? profile.lean.totalTokens - oldProfile.lean.totalTokens : undefined;
      const upstreamDelta = oldProfile ? profile.upstream.totalTokens - oldProfile.upstream.totalTokens : undefined;
      console.log(
        `  ${extension.displayName}/${profile.label}: Lean ${format(profile.lean.totalTokens)}${deltaText(leanDelta)}, `
        + `upstream ${format(profile.upstream.totalTokens)}${deltaText(upstreamDelta)}, `
        + `saved ${format(profile.savedTokens)} (${profile.reductionPercent.toFixed(1)}%)`,
      );
    }
  }
  console.log(
    `  TOTAL: Lean ${format(currentResult.totals.leanTokens)}, upstream ${format(currentResult.totals.upstreamTokens)}, `
    + `saved ${format(currentResult.totals.savedTokens)} (${currentResult.totals.reductionPercent.toFixed(1)}%)`,
  );
}

function deltaText(delta) {
  if (delta === undefined) return " (new)";
  if (delta === 0) return " (unchanged)";
  return ` (${delta > 0 ? "+" : ""}${delta})`;
}

function relativeDisplay(filePath) {
  const relativeToPackages = path.relative(packagesRoot, filePath);
  return relativeToPackages.startsWith("..") ? filePath : relativeToPackages.replaceAll("\\", "/");
}

function format(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function signed(value) {
  return value >= 0 ? format(value) : `-${format(Math.abs(value))}`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

await main().catch((error) => {
  console.error("\n\x1b[31;1mTOKEN BENCHMARK FAILED\x1b[0m");
  console.error(error instanceof Error ? error.message : String(error));
  console.error("No benchmark JSON or README files were changed.");
  process.exitCode = 1;
});

