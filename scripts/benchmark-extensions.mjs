import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
// Not README.*: npm force-packs README.* files and may pick one as the package page.
const EXTENSION_ZH_README = "README_zh-CN.md";
const EXTENSION_CHART_DIR = "assets";
const resultsPath = path.resolve(setupRoot, config.resultsFile);
// Temporary installs of dev-only upstream packages; removed after measuring.
const temporaryUpstreamRoots = [];
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
  } finally {
    await Promise.all(temporaryUpstreamRoots.map((root) => rm(root, { recursive: true, force: true })));
  }

  printComparison(current, previous);

  const renderedFiles = new Map([...renderAllReadmes(current, config.extensions), ...renderCharts(current)]);
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
      const actual = await readFile(filePath, "utf8").catch((error) => {
        if (error.code === "ENOENT") return undefined;
        throw error;
      });
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
    console.log("\n\x1b[32;1mBenchmark snapshot, charts, and README blocks are current.\x1b[0m");
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
    const leanExtensionPath = containedPath(packageRoot, extensionConfig.leanEntry ?? "index.ts", `${extensionConfig.id}: lean entry`);
    await access(leanExtensionPath);
    await access(upstreamExtensionPath);
    console.log(`  ${extensionConfig.displayName}`);
    const profiles = [];
    for (const profile of extensionConfig.profiles) {
      const lean = await runMeasurement({
        extensionId: extensionConfig.id,
        variant: "lean",
        profile,
        extensionPath: leanExtensionPath,
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
        ...(profile.labelZh ? { labelZh: profile.labelZh } : {}),
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
  const piModule = env.PI_CODING_AGENT_MODULE ?? (env.PI_GLOBAL_NODE_MODULES ? undefined : managedPiModule());
  return {
    ...env,
    ...(piModule ? { PI_CODING_AGENT_MODULE: piModule } : {}),
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    PI_CODING_AGENT_DIR: agentDir,
    PI_AGENT_DIR: agentDir,
    NO_UPDATE_NOTIFIER: "1",
    PI_SKIP_UPDATE_CHECK: "1",
  };
}

// Pi's managed installer (~/.pi/agent/install) lives outside npm's global root;
// use its current release when present, otherwise the worker falls back to npm.
function managedPiModule() {
  const agentDir = process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent");
  const installRoot = process.env.PI_MANAGED_INSTALL_ROOT ?? path.join(agentDir, "install");
  try {
    const version = readFileSync(path.join(installRoot, "current-version"), "utf8").trim();
    const modulePath = path.join(installRoot, "releases", version, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "index.js");
    return existsSync(modulePath) ? modulePath : undefined;
  } catch {
    return undefined;
  }
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
    for (const [fileName, language] of [["README.md", "en"], [EXTENSION_ZH_README, "zh"]]) {
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
  const extensionConfig = config.extensions.find((item) => item.id === extension.id);
  let rendered = readFileSyncText(filePath);
  // Forks such as billion-context-pi-lean keep a hand-written detailed comparison; only the summary line is generated.
  if (extensionConfig.readmeBenchmarkBlock !== false) {
    rendered = replaceManagedBlock(rendered, "benchmark", extensionBenchmark(extension, piVersion, language), filePath);
  }
  if (rendered.includes("<!-- token-benchmark:summary:start -->")) {
    rendered = replaceManagedBlock(rendered, "summary", extensionSummary(extension, language), filePath);
  }
  return rendered;
}

function renderSetupReadme(filePath, result, language) {
  return replaceManagedBlock(readFileSyncText(filePath), "aggregate", aggregateBenchmark(result, language), filePath);
}

function extensionSummary(extension, language) {
  const text = chartText[language];
  const profile = defaultProfile(extension);
  const alt = text.extensionAlt(format(profile.upstream.totalTokens), format(profile.lean.totalTokens), profile.reductionPercent.toFixed(1));
  return `<p align="center"><img src="${EXTENSION_CHART_DIR}/${text.file}" alt="${escapeXml(alt)}" width="800"></p>`;
}

function defaultProfile(extension) {
  return extension.profiles.find((item) => item.id === "default") ?? extension.profiles[0];
}

function extensionBenchmark(extension, piVersion, language) {
  if (extension.profiles.length > 1) return profileBenchmark(extension, piVersion, language);
  const profile = extension.profiles[0];
  const leanTools = breakdown(profile.lean, language);
  const upstreamTools = breakdown(profile.upstream, language);
  if (language === "zh") {
    return [
      "只启用这一个扩展时，模型每轮都会读到的内容：",
      "",
      "| 版本 | 构成 | 合计 |",
      "| --- | --- | ---: |",
      `| Lean \`${extension.leanPackage}@${extension.leanVersion}\` | ${leanTools} | **${format(profile.lean.totalTokens)}** |`,
      `| 上游 \`${extension.upstreamPackage}@${extension.upstreamVersion}\` | ${upstreamTools} | **${format(profile.upstream.totalTokens)}** |`,
      "",
      methodLine(piVersion, "zh"),
    ].join("\n");
  }
  return [
    "With only this extension enabled, what the model reads on every turn:",
    "",
    "| Variant | Breakdown | Total |",
    "| --- | --- | ---: |",
    `| Lean \`${extension.leanPackage}@${extension.leanVersion}\` | ${leanTools} | **${format(profile.lean.totalTokens)}** |`,
    `| Upstream \`${extension.upstreamPackage}@${extension.upstreamVersion}\` | ${upstreamTools} | **${format(profile.upstream.totalTokens)}** |`,
    "",
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
      `对比上游 \`${extension.upstreamPackage}@${extension.upstreamVersion}\`，不同配置下的结果：`,
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
    `Against upstream \`${extension.upstreamPackage}@${extension.upstreamVersion}\`, by configuration:`,
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
      `${config.extensions.length} 个精简版合计，模型每轮都要读的常驻上下文比锁定的上游版本少 **${format(totals.savedTokens)} tokens（${totals.reductionPercent.toFixed(1)}%）**，对比图见[开头](#我的-pi-精简配置)。`,
      "",
      "<details>",
      "<summary>逐项数字和测量方式</summary>",
      "",
      "| 扩展 | 精简版 | 锁定上游 | 少 | 降幅 |",
      "| --- | ---: | ---: | ---: | ---: |",
      ...rows,
      `| **合计** | **${format(totals.leanTokens)}** | **${format(totals.upstreamTokens)}** | **${format(totals.savedTokens)}** | **${totals.reductionPercent.toFixed(1)}%** |`,
      "",
      `- 用 Pi \`${result.piVersion}\` 和仓库里的 \`npm run benchmark\` 测量。`,
      "- 每个版本在独立的临时进程里测，工作目录、Home 和 Pi Agent 目录都是空的。",
      "- 不计内置工具、Skills、上下文文件、会话历史、用户消息、其他扩展、运行时 UI 和 Slash Commands；计入 `before_agent_start` 注入的系统提示和消息。",
      "- Token 按 `ceil(字符数 / 4)` 估算，不是实际计费值。上游版本是各精简包锁定的版本，已对照 lockfile 和已安装的包核对。",
      "",
      "</details>",
    ].join("\n");
  }
  return [
    `Together, the ${config.extensions.length} Lean extensions cut the always-on context the model reads every turn by **${format(totals.savedTokens)} tokens (${totals.reductionPercent.toFixed(1)}%)** versus their pinned upstream versions; the chart is [at the top](#my-lean-pi-setup).`,
    "",
    "<details>",
    "<summary>Per-extension numbers and methodology</summary>",
    "",
    "| Extension | Lean | Pinned upstream | Saved | Reduction |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...rows,
    `| **Total** | **${format(totals.leanTokens)}** | **${format(totals.upstreamTokens)}** | **${format(totals.savedTokens)}** | **${totals.reductionPercent.toFixed(1)}%** |`,
    "",
    `- Measured with Pi \`${result.piVersion}\` and the repository's \`npm run benchmark\`.`,
    "- Each variant runs in its own temporary process with an empty working directory, home and Pi agent directory.",
    "- Built-in tools, skills, context files, session history, user messages, other extensions, runtime UI and slash commands are not counted; system-prompt and message additions from `before_agent_start` are.",
    "- Tokens are estimated as `ceil(characters / 4)`, not billed tokens. Upstream versions are the ones each Lean package pins, checked against the lockfile and the installed package.",
    "",
    "</details>",
  ].join("\n");
}

const chartText = {
  en: {
    file: "chart.svg",
    fonts: "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
    caption: (count) => `Always-on context at startup, ${count} extensions`,
    subline: (saved) => `${saved} fewer tokens per request, same features`,
    upstream: "Pinned upstream",
    lean: "Lean",
    footnote: "Tokens estimated as ceil(chars / 4).",
    extensionCaption: (upstream) => `Always-on context vs. upstream ${upstream}`,
    extensionAlt: (upstream, lean, percent) => `Always-on context: ${upstream} tokens upstream, ${lean} Lean, ${percent}% less`,
  },
  zh: {
    file: "chart.zh-CN.svg",
    fonts: "-apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif",
    caption: (count) => `启动时的常驻上下文，${count} 个扩展`,
    subline: (saved) => `每次请求少 ${saved} tokens，功能不变`,
    upstream: "锁定上游",
    lean: "精简版",
    footnote: "Token 按 ceil(字符数 / 4) 估算。",
    extensionCaption: (upstream) => `常驻上下文，对比上游 ${upstream}`,
    extensionAlt: (upstream, lean, percent) => `常驻上下文：上游 ${upstream} tokens，精简版 ${lean}，少 ${percent}%`,
  },
};

function renderCharts(result) {
  const files = new Map();
  for (const text of Object.values(chartText)) {
    files.set(path.join(setupRoot, "benchmarks", text.file), renderChart(result, text));
    for (const extension of result.extensions) {
      files.set(path.join(packagesRoot, extension.directory, EXTENSION_CHART_DIR, text.file), renderExtensionChart(extension, text));
    }
  }
  return files;
}

// Same look as the setup chart, for one extension's default profile.
function renderExtensionChart(extension, text) {
  const profile = defaultProfile(extension);
  const barX = 142;
  const maxBar = 548;
  const width = (tokens) => Math.max(1, Math.round(tokens / Math.max(1, profile.upstream.totalTokens) * maxBar * 10) / 10);
  const upW = width(profile.upstream.totalTokens);
  const leanW = width(profile.lean.totalTokens);
  const height = 220;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${height}" viewBox="0 0 800 ${height}" font-family="${text.fonts}">`,
    "  <style>",
    "    .fg{fill:#1f2328}.mu{fill:#59636e}.up{fill:#d0d7de}.ac{fill:#1a7f37}",
    "    @media (prefers-color-scheme: dark){.fg{fill:#e6edf3}.mu{fill:#9198a1}.up{fill:#3d444d}.ac{fill:#3fb950}}",
    "    .num{font-variant-numeric:tabular-nums}",
    "  </style>",
    `  <text x="24" y="34" class="mu" font-size="14">${escapeXml(text.extensionCaption(`${extension.upstreamPackage}@${extension.upstreamVersion}`))}</text>`,
    `  <text x="24" y="86" class="ac" font-size="48" font-weight="700">−${profile.reductionPercent.toFixed(1)}%</text>`,
    `  <text x="222" y="70" class="fg num" font-size="18" font-weight="600">${format(profile.upstream.totalTokens)} → ${format(profile.lean.totalTokens)} tokens</text>`,
    `  <text x="222" y="92" class="mu" font-size="14">${escapeXml(text.subline(format(profile.savedTokens)))}</text>`,
    '  <g font-size="13">',
    `    <text x="24" y="138" class="mu">${escapeXml(text.upstream)}</text>`,
    `    <rect x="${barX}" y="124" width="${upW}" height="18" class="up"/><text x="${round1(barX + upW + 8)}" y="138" class="mu num">${format(profile.upstream.totalTokens)}</text>`,
    `    <text x="24" y="172" class="fg" font-weight="600">${escapeXml(text.lean)}</text>`,
    `    <rect x="${barX}" y="158" width="${leanW}" height="18" class="ac"/><text x="${round1(barX + leanW + 8)}" y="172" class="fg num" font-weight="600">${format(profile.lean.totalTokens)}</text>`,
    "  </g>",
    `  <text x="24" y="${height - 12}" class="mu" font-size="11">${escapeXml(text.footnote)}</text>`,
    "</svg>",
    "",
  ].join("\n");
}

// One SVG serves GitHub light and dark themes through prefers-color-scheme.
function renderChart(result, text) {
  const rows = result.extensions
    .map((extension) => ({
      name: extension.directory,
      profile: extension.profiles.find((item) => item.id === "default") ?? extension.profiles[0],
    }))
    .sort((a, b) => b.profile.upstream.totalTokens - a.profile.upstream.totalTokens);
  const barX = 250;
  const maxBar = 440;
  const maxTokens = Math.max(1, ...rows.map((row) => row.profile.upstream.totalTokens));
  const width = (tokens) => Math.max(1, Math.round(tokens / maxTokens * maxBar * 10) / 10);
  const totals = result.totals;
  const height = 150 + rows.length * 50 + 30;
  const rowSvg = rows.map(({ name, profile }, index) => {
    const upW = width(profile.upstream.totalTokens);
    const leanW = width(profile.lean.totalTokens);
    return [
      `    <g transform="translate(0,${150 + index * 50})">`,
      `      <text x="24" y="22" class="fg">${escapeXml(name)}</text>`,
      `      <rect x="${barX}" y="6" width="${upW}" height="11" class="up"/><text x="${round1(barX + upW + 8)}" y="16" class="mu num">${format(profile.upstream.totalTokens)}</text>`,
      `      <rect x="${barX}" y="21" width="${leanW}" height="11" class="ac"/><text x="${round1(barX + leanW + 8)}" y="31" class="fg num" font-weight="600">${format(profile.lean.totalTokens)} <tspan class="mu" font-weight="400">−${profile.reductionPercent.toFixed(1)}%</tspan></text>`,
      "    </g>",
    ].join("\n");
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${height}" viewBox="0 0 800 ${height}" font-family="${text.fonts}">`,
    "  <style>",
    "    .fg{fill:#1f2328}.mu{fill:#59636e}.up{fill:#d0d7de}.ac{fill:#1a7f37}",
    "    @media (prefers-color-scheme: dark){.fg{fill:#e6edf3}.mu{fill:#9198a1}.up{fill:#3d444d}.ac{fill:#3fb950}}",
    "    .num{font-variant-numeric:tabular-nums}",
    "  </style>",
    `  <text x="24" y="34" class="mu" font-size="14">${escapeXml(text.caption(rows.length))}</text>`,
    `  <text x="24" y="86" class="ac" font-size="48" font-weight="700">−${totals.reductionPercent.toFixed(1)}%</text>`,
    `  <text x="222" y="70" class="fg num" font-size="18" font-weight="600">${format(totals.upstreamTokens)} → ${format(totals.leanTokens)} tokens</text>`,
    `  <text x="222" y="92" class="mu" font-size="14">${escapeXml(text.subline(format(totals.savedTokens)))}</text>`,
    `  <rect x="24" y="116" width="10" height="10" class="up"/><text x="40" y="125" class="mu" font-size="12">${escapeXml(text.upstream)}</text>`,
    `  <rect x="150" y="116" width="10" height="10" class="ac"/><text x="166" y="125" class="mu" font-size="12">${escapeXml(text.lean)}</text>`,
    '  <g font-size="13">',
    ...rowSvg,
    "  </g>",
    `  <text x="24" y="${height - 12}" class="mu" font-size="11">${escapeXml(text.footnote)}</text>`,
    "</svg>",
    "",
  ].join("\n");
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function methodLine(piVersion, language) {
  if (language === "zh") {
    return `<sub>测量方式：Pi ${piVersion}，每个版本在独立的临时进程里测，工作目录和配置都是空的。不计内置工具、Skills、上下文文件、会话历史、用户消息、其他扩展、运行时 UI 和 Slash Commands；计入 \`before_agent_start\` 注入的内容。Token 按 \`ceil(字符数 / 4)\` 估算，不是实际计费值。</sub>`;
  }
  return `<sub>Method: Pi ${piVersion}, each variant measured in its own temporary process with an empty working directory and configuration. Built-in tools, skills, context files, session history, user messages, other extensions, runtime UI and slash commands are not counted; \`before_agent_start\` additions are. Tokens are estimated as \`ceil(characters / 4)\`, not billed tokens.</sub>`;
}

function profileDisplayLabel(profile, language) {
  if (language !== "zh") return profile.label;
  if (profile.labelZh) return profile.labelZh;
  if (profile.id === "default") return "默认";
  return profile.label;
}

function breakdown(measurement, language) {
  const parts = measurement.tools.map((tool) => `\`${tool.name}\` (${format(tool.tokens)})`);
  if (measurement.promptDeltaTokens !== 0) {
    parts.push(`${language === "zh" ? "提示词注入" : "prompt additions"} (${format(measurement.promptDeltaTokens)})`);
  }
  return parts.length > 0 ? parts.join(" + ") : language === "zh" ? "无常驻内容" : "nothing always-on";
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
    for (const fileName of ["README.md", EXTENSION_ZH_README]) {
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
  // Wrappers depend on upstream at runtime; forks pin it as a devDependency for measurement only.
  const declaredVersion = leanPackage.dependencies?.[packageName] ?? leanPackage.devDependencies?.[packageName];
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

  let upstreamRoot = packageRootForDependency(packageRoot, packageName);
  if (!existsSync(path.join(upstreamRoot, "package.json")) && !leanPackage.dependencies?.[packageName]) {
    // Local runtime pruning (npm prune --omit=dev) removes dev-only upstreams; fetch the pinned version elsewhere.
    upstreamRoot = await installTemporaryUpstream(extensionConfig.id, packageName, declaredVersion, lockEntry.integrity);
  }
  const upstreamPackage = JSON.parse(await readFile(path.join(upstreamRoot, "package.json"), "utf8"));
  if (upstreamPackage.name !== packageName || upstreamPackage.version !== declaredVersion) {
    throw new Error(
      `${extensionConfig.id}: installed dependency is ${upstreamPackage.name}@${upstreamPackage.version}; expected ${packageName}@${declaredVersion}.`,
    );
  }
  return { upstreamRoot, upstreamPackage };
}

async function installTemporaryUpstream(extensionId, packageName, version, expectedIntegrity) {
  const installRoot = await mkdtemp(path.join(os.tmpdir(), `pi-token-bench-upstream-${extensionId}-`));
  temporaryUpstreamRoots.push(installRoot);
  console.log(`  (${extensionId}: ${packageName} not installed locally; fetching ${version} into a temporary directory)`);
  await writeFile(path.join(installRoot, "package.json"), '{"private":true}\n', "utf8");
  // Peers (Pi, typebox) are provided by Pi's extension loader, as in a real install.
  const args = ["install", `${packageName}@${version}`, "--ignore-scripts", "--omit=peer", "--legacy-peer-deps", "--no-audit", "--no-fund"];
  const result = await new Promise((resolve, reject) => {
    // npm is npm.cmd on Windows and needs a shell; the arguments are fixed flags plus a validated exact version.
    const child = process.platform === "win32"
      ? spawn(`npm ${args.join(" ")}`, { cwd: installRoot, shell: true, stdio: ["ignore", "pipe", "pipe"] })
      : spawn("npm", args, { cwd: installRoot, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
  });
  if (result.code !== 0) throw new Error(`${extensionId}: npm install ${packageName}@${version} failed.\n${result.output}`);
  const lockfile = JSON.parse(await readFile(path.join(installRoot, "package-lock.json"), "utf8"));
  const integrity = lockfile.packages?.[`node_modules/${packageName}`]?.integrity;
  if (integrity !== expectedIntegrity) {
    throw new Error(`${extensionId}: fetched ${packageName}@${version} integrity ${integrity} does not match package-lock.json.`);
  }
  return packageRootForDependency(installRoot, packageName);
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

