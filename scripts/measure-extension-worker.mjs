import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: node measure-extension-worker.mjs <input.json>");

const input = JSON.parse(await readFile(inputPath, "utf8"));
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

try {
  await session.bindExtensions({ mode: "print" });

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
  const finalSystemPrompt = eventResult?.systemPrompt ?? initialSystemPrompt;
  const promptDeltaChars = finalSystemPrompt.length - initialSystemPrompt.length;
  const promptDeltaTokens = Math.ceil(finalSystemPrompt.length / 4) - Math.ceil(initialSystemPrompt.length / 4);
  const toolTokens = tools.reduce((sum, tool) => sum + tool.tokens, 0);

  const piPackagePath = path.resolve(path.dirname(piModulePath), "..", "package.json");
  const piPackage = JSON.parse(await readFile(piPackagePath, "utf8"));

  await writeFile(input.resultPath, `${JSON.stringify({
    extensionPath: input.extensionPath,
    loaded: extensionsResult.extensions?.map((extension) => extension.path ?? extension.name ?? "unknown") ?? [],
    activeToolNames: [...activeAtBind],
    tools,
    toolTokens,
    promptDeltaChars,
    promptDeltaTokens,
    totalTokens: toolTokens + promptDeltaTokens,
    piVersion: piPackage.version ?? "unknown",
  }, null, 2)}\n`, "utf8");
} finally {
  session.dispose();
}

function resolveGlobalNodeModules() {
  if (process.platform === "win32" && process.env.APPDATA) {
    return path.join(process.env.APPDATA, "npm", "node_modules");
  }
  return execFileSync("npm", ["root", "-g"], { encoding: "utf8", shell: process.platform === "win32" }).trim();
}
