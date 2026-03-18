import Store from 'electron-store';
import { VariableHistory } from '../shared/types';

interface HistoryData {
  recentPrompts: RecentPromptEntry[];
  favorites: string[];
  variableHistory: VariableHistory;
}

export interface RecentPromptEntry {
  promptId: string;
  packId: string;
  usedAt: number;
}

const store = new Store<HistoryData>({
  name: 'history',
  defaults: {
    recentPrompts: [],
    favorites: [],
    variableHistory: {},
  },
});

const MAX_RECENT = 50;
const MAX_VARIABLE_HISTORY = 10;

/** Record a prompt usage */
export function recordUsage(promptId: string, packId: string): void {
  const recent = store.get('recentPrompts', []);
  const filtered = recent.filter(r => r.promptId !== promptId);
  filtered.unshift({ promptId, packId, usedAt: Date.now() });
  store.set('recentPrompts', filtered.slice(0, MAX_RECENT));
}

/** Get recent prompt IDs */
export function getRecentPrompts(limit = 10): RecentPromptEntry[] {
  return store.get('recentPrompts', []).slice(0, limit);
}

/** Toggle favorite */
export function toggleFavorite(promptId: string): boolean {
  const favorites = store.get('favorites', []);
  const index = favorites.indexOf(promptId);
  if (index >= 0) {
    favorites.splice(index, 1);
    store.set('favorites', favorites);
    return false;
  } else {
    favorites.push(promptId);
    store.set('favorites', favorites);
    return true;
  }
}

/** Check if a prompt is favorited */
export function isFavorite(promptId: string): boolean {
  return store.get('favorites', []).includes(promptId);
}

/** Get all favorite prompt IDs */
export function getFavorites(): string[] {
  return store.get('favorites', []);
}

/** Save variable fill history */
export function saveVariableValue(variableName: string, value: string): void {
  const history = store.get('variableHistory', {});
  const existing = history[variableName] || [];
  const filtered = existing.filter(v => v !== value);
  filtered.unshift(value);
  history[variableName] = filtered.slice(0, MAX_VARIABLE_HISTORY);
  store.set('variableHistory', history);
}

/** Get previous values for a variable */
export function getVariableHistory(variableName: string): string[] {
  const history = store.get('variableHistory', {});
  return history[variableName] || [];
}

/** Get all variable history */
export function getAllVariableHistory(): VariableHistory {
  return store.get('variableHistory', {});
}
