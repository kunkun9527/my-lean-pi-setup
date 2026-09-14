import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: node measure-extension-worker.mjs <input.json>");

const input = JSON.parse(await readFile(inputPath, "utf8"));
if (path.resolve(process.cwd()) !== path.resolve(input.cwd)) {
  throw new Error(`Worker cwd isolation failed: ${process.cwd()} !== ${input.cwd}`);
}
const globalRoot = process.env.PI_GLOBAL_NODE_MODULES ?? resolveGlobalNodeModules();
const piModulePath = process.env.PI_CODING_AGENT_MODULE
  ?? path.join(globalRoot, "@earendil-works", "pi-coding-agent", "dist", "index.js");
const {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
} = await import(pathToFileURL(piModulePath).href);

const settingsManager = SettingsManager.create(input.cwd, input.agentDir);
const loader = new DefaultResourceLoader({
  cwd: input.cwd,
  agentDir: input.agentDir,
  settingsManager,
  additionalExtensionPaths: [input.extensionPath],
  noExtensions: true,
  noSkills: true,
  noPromptTemplates: true,
  noThemes: true,
  noContextFiles: true,
});

await loader.reload();
const loaded = loader.getExtensions();
if (loaded.errors?.length) {
  throw new Error(`Extension load failed: ${JSON.stringify(loaded.errors)}`);
}

const { session, extensionsResult } = await createAgentSession({
  cwd: input.cwd,
  agentDir: input.agentDir,
  settingsManager,
  resourceLoader: loader,
  sessionManager: SessionManager.inMemory(),
  noTools: "builtin",
});
const extensionErrors = [];
const removeErrorListener = session._extensionRunner.onError((error) => extensionErrors.push(error));

try {
  await session.bindExtensions({ mode: "print" });
  if (extensionErrors.length > 0) {
    throw new Error(`Extension bind failed: ${JSON.stringify(extensionErrors)}`);
  }

  const activeAtBind = new Set(session.getActiveToolNames());
  const snippets = session._baseSystemPromptOptions?.toolSnippets ?? {};
  const tools = session.getAllTools()
    .filter((tool) => activeAtBind.has(tool.name))
    .map((tool) => {
      const guidelines = Array.isArray(tool.promptGuidelines)
        ? tool.promptGuidelines
        : tool.promptGuidelines
          ? [tool.promptGuidelines]
          : [];
      const parametersJson = JSON.stringify(tool.parameters ?? {});
      const definitionChars = `${tool.name}: ${tool.description}\n${parametersJson}`.length;
      const snippetChars = snippets[tool.name] ? `\n- ${tool.name}: ${snippets[tool.name]}`.length : 0;
      const guidelineChars = guidelines.reduce((sum, guideline) => sum + `\n- ${guideline.trim()}`.length, 0);
      const chars = definitionChars + snippetChars + guidelineChars;
      return {
        name: tool.name,
        chars,
        tokens: Math.ceil(chars / 4),
        descriptionChars: tool.description.length,
        schemaChars: parametersJson.length,
        snippetChars,
        guidelineChars,
        source: tool.sourceInfo?.source ?? "extension",
      };
    });

  const initialSystemPrompt = session.systemPrompt;
  const eventResult = await session._extensionRunner.emitBeforeAgentStart(
    "",
    undefined,
    initialSystemPrompt,
    session._baseSystemPromptOptions,
  );
  if (extensionErrors.length > 0) {
    throw new Error(`Extension event failed: ${JSON.stringify(extensionErrors)}`);
  }
  const finalSystemPrompt = eventResult?.systemPrompt ?? initialSystemPrompt;
  const eventMessagesJson = JSON.stringify(eventResult?.messages ?? []);
  const eventMessageChars = eventResult?.messages?.length ? eventMessagesJson.length : 0;
  const promptDeltaChars = finalSystemPrompt.length - initialSystemPrompt.length + eventMessageChars;
  const promptDeltaTokens = Math.ceil(finalSystemPrompt.length / 4) - Math.ceil(initialSystemPrompt.length / 4)
    + Math.ceil(eventMessageChars / 4);
  const toolTokens = tools.reduce((sum, tool) => sum + tool.tokens, 0);

  const piPackagePath = path.resolve(path.dirname(piModulePath), "..", "package.json");
  const piPackage = JSON.parse(await readFile(piPackagePath, "utf8"));

  const loadedPaths = extensionsResult.extensions?.map((extension) => extension.path ?? extension.name ?? "unknown") ?? [];
  const expectedPath = path.resolve(input.extensionPath);
  if (!loadedPaths.some((loadedPath) => typeof loadedPath === "string" && path.resolve(loadedPath) === expectedPath)) {
    throw new Error(`Expected extension was not loaded: ${expectedPath}; loaded=${JSON.stringify(loadedPaths)}`);
  }

  await writeFile(input.resultPath, `${JSON.stringify({
    extensionPath: input.extensionPath,
    loaded: loadedPaths,
    cwd: process.cwd(),
    activeToolNames: [...activeAtBind],
    tools,
    toolTokens,
    promptDeltaChars,
    promptDeltaTokens,
    eventMessageChars,
    totalTokens: toolTokens + promptDeltaTokens,
    piVersion: piPackage.version ?? "unknown",
  }, null, 2)}\n`, "utf8");
} finally {
  removeErrorListener();
  session.dispose();
}

function resolveGlobalNodeModules() {
  try {
    if (process.platform === "win32") {
      const command = process.env.ComSpec ?? "cmd.exe";
      return execFileSync(command, ["/d", "/s", "/c", "npm root -g"], { encoding: "utf8" }).trim();
    }
    return execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
  } catch (error) {
    if (process.platform === "win32" && process.env.APPDATA) {
      return path.join(process.env.APPDATA, "npm", "node_modules");
    }
    throw error;
  }
}
