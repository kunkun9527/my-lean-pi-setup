import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeAtomically(changed, options = {}) {
  const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const states = changed.map(([filePath, content, actual]) => ({
    filePath,
    content,
    actual,
    tempPath: `${filePath}.token-benchmark-${nonce}.tmp`,
    backupPath: `${filePath}.token-benchmark-${nonce}.bak`,
    backedUp: false,
    installed: false,
  }));
  let installedCount = 0;

  try {
    for (const state of states) {
      await mkdir(path.dirname(state.filePath), { recursive: true });
      await writeFile(state.tempPath, state.content, "utf8");
      if (state.actual !== undefined) {
        const metadata = await stat(state.filePath);
        await chmod(state.tempPath, metadata.mode);
      }
      const staged = await readFile(state.tempPath, "utf8");
      if (staged !== state.content) throw new Error(`Staged content verification failed: ${state.filePath}`);
    }

    for (const state of states) {
      if (state.actual !== undefined) {
        await rename(state.filePath, state.backupPath);
        state.backedUp = true;
      }
      await rename(state.tempPath, state.filePath);
      state.installed = true;
      installedCount += 1;
      if (options.failAfterInstall === installedCount) {
        throw new Error(`Injected transaction failure after ${installedCount} install(s).`);
      }
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const state of [...states].reverse()) {
      try {
        if (state.installed) await rm(state.filePath, { force: true });
        if (state.backedUp) await rename(state.backupPath, state.filePath);
      } catch (rollbackError) {
        rollbackErrors.push(new Error(`${state.filePath}: ${rollbackError.message}`));
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "Benchmark update failed and rollback was incomplete; .bak files were preserved.",
      );
    }
    throw error;
  } finally {
    await Promise.all(states.map((state) => rm(state.tempPath, { force: true }).catch(() => {})));
  }

  const cleanupErrors = [];
  for (const state of states) {
    if (!state.backedUp) continue;
    try {
      await rm(state.backupPath, { force: true });
    } catch (error) {
      cleanupErrors.push(`${state.backupPath}: ${error.message}`);
    }
  }
  if (cleanupErrors.length > 0) {
    console.warn(`Benchmark update succeeded, but backup cleanup failed:\n${cleanupErrors.join("\n")}`);
  }
}
