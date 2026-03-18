import * as fs from 'fs';
import * as path from 'path';
import * as chokidar from 'chokidar';
import { app } from 'electron';
import { PromptPack } from '../shared/types';
import { loadAllPacks, parseMarkdown, savePackAsMarkdown } from './parser';
import { buildSearchIndex } from './search';

let packs: PromptPack[] = [];
let watcher: chokidar.FSWatcher | null = null;
let promptsDir: string = '';
let onChangeCallback: (() => void) | null = null;

/** Initialize the store with a prompts directory */
export function initStore(dir?: string): void {
  promptsDir = dir || path.join(app.getPath('userData'), 'prompts');
  if (!fs.existsSync(promptsDir)) {
    fs.mkdirSync(promptsDir, { recursive: true });
  }
  reloadPacks();
  watchDirectory();
}

/** Reload all packs from disk */
export function reloadPacks(): void {
  packs = loadAllPacks(promptsDir);
  buildSearchIndex(packs);
}

/** Get all loaded packs */
export function getPacks(): PromptPack[] {
  return packs;
}

/** Get prompts directory */
export function getPromptsDir(): string {
  return promptsDir;
}

/** Watch for file changes */
function watchDirectory(): void {
  if (watcher) {
    watcher.close();
  }
  watcher = chokidar.watch(path.join(promptsDir, '*.md'), {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500 },
  });
  watcher.on('all', () => {
    reloadPacks();
    onChangeCallback?.();
  });
}

/** Set callback for when packs change */
export function onPacksChange(callback: () => void): void {
  onChangeCallback = callback;
}

/** Save a pack (create or update) */
export function savePack(pack: PromptPack): void {
  if (!pack.filePath) {
    const safeName = pack.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
    pack.filePath = path.join(promptsDir, `${safeName}.md`);
  }
  savePackAsMarkdown(pack);
  reloadPacks();
}

/** Delete a pack */
export function deletePack(packId: string): boolean {
  const pack = packs.find(p => p.id === packId);
  if (!pack) return false;
  if (fs.existsSync(pack.filePath)) {
    fs.unlinkSync(pack.filePath);
  }
  reloadPacks();
  return true;
}

/** Import a markdown file into the prompts directory */
export function importMarkdownFile(sourcePath: string): PromptPack | null {
  const fileName = path.basename(sourcePath);
  const destPath = path.join(promptsDir, fileName);
  fs.copyFileSync(sourcePath, destPath);
  const pack = parseMarkdown(destPath);
  if (pack) {
    reloadPacks();
  }
  return pack;
}

/** Cleanup on app quit */
export function cleanup(): void {
  watcher?.close();
}
