/** A single prompt template */
export interface PromptItem {
  id: string;
  name: string;
  content: string;
  variables: string[];
  /** Number of times used */
  useCount: number;
  /** Whether user marked as favorite */
  isFavorite: boolean;
  /** Last used timestamp */
  lastUsedAt?: number;
}

/** A collection of prompts */
export interface PromptPack {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  prompts: PromptItem[];
  /** Source markdown file path */
  filePath: string;
}

/** Variable fill history */
export interface VariableHistory {
  [variableName: string]: string[];
}

/** App settings */
export interface AppSettings {
  /** Global shortcut key combination */
  shortcut: string;
  /** Max recent items to show */
  maxRecentItems: number;
  /** Prompts directory path */
  promptsDir: string;
  /** Theme: light or dark */
  theme: 'light' | 'dark' | 'system';
}

/** IPC channel names */
export const IPC_CHANNELS = {
  // Popup
  SHOW_POPUP: 'show-popup',
  HIDE_POPUP: 'hide-popup',
  GET_PACKS: 'get-packs',
  SEARCH_PROMPTS: 'search-prompts',
  INSERT_PROMPT: 'insert-prompt',
  GET_RECENT: 'get-recent',
  TOGGLE_FAVORITE: 'toggle-favorite',

  // Variables
  GET_VARIABLE_HISTORY: 'get-variable-history',
  SAVE_VARIABLE_HISTORY: 'save-variable-history',

  // Settings
  GET_SETTINGS: 'get-settings',
  SAVE_SETTINGS: 'save-settings',

  // Manager
  GET_ALL_PACKS: 'get-all-packs',
  SAVE_PACK: 'save-pack',
  DELETE_PACK: 'delete-pack',
  SAVE_PROMPT: 'save-prompt',
  DELETE_PROMPT: 'delete-prompt',
  IMPORT_MARKDOWN: 'import-markdown',
  EXPORT_MARKDOWN: 'export-markdown',

  // Window
  OPEN_MANAGER: 'open-manager',
  OPEN_SETTINGS: 'open-settings',
  CURSOR_POSITION: 'cursor-position',
} as const;

export const DEFAULT_SETTINGS: AppSettings = {
  shortcut: 'Control+Space',
  maxRecentItems: 10,
  promptsDir: '',
  theme: 'system',
};
