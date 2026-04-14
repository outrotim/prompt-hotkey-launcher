export type Locale = "en" | "zh-CN";

export const RESERVED_VARIABLE_KEYS = ["clipboard"] as const;

export const VALID_OUTPUT_MODES = ["paste", "clipboard", "file"] as const;
export type PromptOutputMode = (typeof VALID_OUTPUT_MODES)[number];
export type PromptDeliveryMode = "auto" | "clipboard";

export type PromptVariableKind = "text" | "enum";

export type PromptVariable = {
  key: string;
  kind: PromptVariableKind;
  required: boolean;
  options: string[];
  defaultValue?: string;
};

export type PromptAfterAction = {
  type: "shell";
  command: string;
};

export type PromptFileMetadata = {
  favorite: boolean;
  tags: string[];
  aliases: string[];
  output?: PromptOutputMode;
  outputFile?: string;
  after?: PromptAfterAction;
};

export type PromptItem = {
  id: string;
  packId: string;
  title: string;
  body: string;
  description: string;
  favorite: boolean;
  tags: string[];
  aliases: string[];
  variables: PromptVariable[];
  sourceFile: string;
  output?: PromptOutputMode;
  outputFile?: string;
  after?: PromptAfterAction;
  useCount?: number;
  lastUsedAt?: string;
  lastValues?: Record<string, string>;
};

export type PromptPack = {
  id: string;
  name: string;
  sourceFile: string;
  metadata: PromptFileMetadata;
  items: PromptItem[];
};

export type PromptLibrary = {
  packs: PromptPack[];
  items: PromptItem[];
};

export type PromptSelectionPayload = {
  promptId: string;
  variables: Record<string, string>;
  deliveryMode?: PromptDeliveryMode;
};

export type PromptUsageRecord = {
  promptId: string;
  usedAt: string;
  values: Record<string, string>;
};
