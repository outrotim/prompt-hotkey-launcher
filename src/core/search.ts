import Fuse from 'fuse.js';
import { PromptItem, PromptPack } from '../shared/types';

interface SearchablePrompt {
  packId: string;
  packName: string;
  prompt: PromptItem;
}

let fuse: Fuse<SearchablePrompt> | null = null;

export function buildSearchIndex(packs: PromptPack[]): void {
  const items: SearchablePrompt[] = [];
  for (const pack of packs) {
    for (const prompt of pack.prompts) {
      items.push({
        packId: pack.id,
        packName: pack.name,
        prompt,
      });
    }
  }

  fuse = new Fuse(items, {
    keys: [
      { name: 'prompt.name', weight: 0.6 },
      { name: 'prompt.content', weight: 0.2 },
      { name: 'packName', weight: 0.2 },
    ],
    threshold: 0.4,
    includeScore: true,
    minMatchCharLength: 1,
  });
}

export interface SearchResult {
  packId: string;
  packName: string;
  prompt: PromptItem;
  score: number;
}

export function searchPrompts(query: string): SearchResult[] {
  if (!fuse || !query.trim()) return [];
  const results = fuse.search(query, { limit: 20 });
  return results.map(r => ({
    packId: r.item.packId,
    packName: r.item.packName,
    prompt: r.item.prompt,
    score: r.score ?? 1,
  }));
}
