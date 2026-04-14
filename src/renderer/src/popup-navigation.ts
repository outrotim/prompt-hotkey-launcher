import { sortPromptItems as sortPromptItemsByOrder } from "../../shared/prompt-order.js";
import { getPinyinInitials } from "../../shared/pinyin-initials.js";
import { getNextPointerHoverEnabled } from "../../shared/pointer-hover-mode.js";

export type PackReference = {
  id: string;
};

export type NamedPackReference = PackReference & {
  name: string;
};

export type SearchableItem = {
  id?: string;
  title: string;
  description: string;
  body: string;
  packId: string;
  packName?: string;
  aliases: string[];
  tags: string[];
  favorite: boolean;
  useCount?: number;
  lastUsedAt?: string;
};

export type PopupKeyboardTarget = {
  dataset?: {
    promptbarVariableField?: string;
    promptbarSearchField?: string;
  };
} | null;

type SelectableItem = SearchableItem & {
  id: string;
};

export type PopupListState<T extends SelectableItem> = {
  visiblePrompts: T[];
  selectedIndex: number;
  selectedPrompt: T | null;
};

export type PopupKeyboardActionContext<T extends SelectableItem, P extends PackReference> = {
  eventKey: string;
  target: PopupKeyboardTarget;
  query: string;
  isSubmitting: boolean;
  currentPackId: string | null;
  selectedIndex: number;
  selectedPrompt: T | null;
  visiblePrompts: T[];
  visiblePacks: P[];
  shouldUsePrimaryConfirmShortcut: (
    eventKey: string,
    query: string,
    selectedPrompt: T | null
  ) => boolean;
};

export type PopupKeyboardAction<T extends SelectableItem> =
  | { type: "escape" }
  | { type: "clear-search" }
  | { type: "noop" }
  | { type: "select-pack"; packId: string | null }
  | { type: "select-index"; index: number }
  | { type: "confirm"; prompt: T | null; index: number | null };

export const getNextPopupPointerHoverState = getNextPointerHoverEnabled;

const highFrequencyPackNames = new Set(["日常写作", "编程", "常用工具"]);
const quickEntryPackNames = new Set(["写作前快启", "修稿投稿快启", "投稿包与格式化"]);
const workflowPackNames = new Set(["00 通用底座", "01 写作前阶段", "02 修稿投稿阶段", "03 专项模块"]);
const secondaryPackNames = new Set(["论文引擎基础", "研究画像", "修稿步骤", "实用模块"]);

type PopupPackTier = "high-frequency" | "quick-entry" | "workflow" | "secondary" | "other";

function getPopupPackTier(name: string): PopupPackTier {
  if (highFrequencyPackNames.has(name)) {
    return "high-frequency";
  }

  if (quickEntryPackNames.has(name)) {
    return "quick-entry";
  }

  if (workflowPackNames.has(name)) {
    return "workflow";
  }

  if (secondaryPackNames.has(name)) {
    return "secondary";
  }

  return "other";
}

export function sortPacksForPopupNavigation<P extends NamedPackReference>(packs: P[]): P[] {
  const packsByTier: Record<PopupPackTier, P[]> = {
    "high-frequency": [],
    "quick-entry": [],
    workflow: [],
    other: [],
    secondary: []
  };

  for (const pack of packs) {
    packsByTier[getPopupPackTier(pack.name)].push(pack);
  }

  return [
    ...packsByTier["high-frequency"],
    ...packsByTier["quick-entry"],
    ...packsByTier.workflow,
    ...packsByTier.other,
    ...packsByTier.secondary
  ];
}

export function getNextPackSelection(
  currentPackId: string | null,
  visiblePacks: PackReference[],
  direction: "left" | "right"
) {
  if (visiblePacks.length === 0) {
    return currentPackId;
  }

  const currentIndex = visiblePacks.findIndex((pack) => pack.id === currentPackId);

  if (direction === "right") {
    const nextIndex =
      currentIndex === -1 ? 0 : Math.min(currentIndex + 1, visiblePacks.length - 1);
    return visiblePacks[nextIndex]?.id ?? currentPackId;
  }

  const nextIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
  return visiblePacks[nextIndex]?.id ?? currentPackId;
}

export function shouldHandlePackNavigation(eventKey: string, isSearching: boolean) {
  return !isSearching && (eventKey === "ArrowLeft" || eventKey === "ArrowRight");
}

export function shouldIgnorePopupHotkeys(
  eventKey: string,
  target: PopupKeyboardTarget,
  query = ""
) {
  if (target?.dataset?.promptbarSearchField) {
    return query.trim() !== "" && (eventKey === "ArrowLeft" || eventKey === "ArrowRight");
  }

  if (!target?.dataset?.promptbarVariableField) {
    return false;
  }

  return (
    eventKey === "ArrowUp" ||
    eventKey === "ArrowDown" ||
    eventKey === "ArrowLeft" ||
    eventKey === "ArrowRight" ||
    eventKey === "Enter" ||
    /^[1-9]$/.test(eventKey)
  );
}

export function resolvePopupKeyboardAction<
  T extends SelectableItem,
  P extends PackReference
>(context: PopupKeyboardActionContext<T, P>): PopupKeyboardAction<T> {
  const {
    eventKey,
    target,
    query,
    isSubmitting,
    currentPackId,
    selectedIndex,
    selectedPrompt,
    visiblePrompts,
    visiblePacks,
    shouldUsePrimaryConfirmShortcut
  } = context;

  const isSearching = query.trim() !== "";

  if (eventKey === "Escape") {
    if (target?.dataset?.promptbarSearchField && isSearching) {
      return { type: "clear-search" };
    }

    return { type: "escape" };
  }

  if (shouldIgnorePopupHotkeys(eventKey, target, query)) {
    return { type: "noop" };
  }

  if (visiblePrompts.length === 0 || isSubmitting) {
    return { type: "noop" };
  }

  if (shouldHandlePackNavigation(eventKey, isSearching) && eventKey === "ArrowRight") {
    return {
      type: "select-pack",
      packId: getNextPackSelection(currentPackId, visiblePacks, "right")
    };
  }

  if (shouldHandlePackNavigation(eventKey, isSearching) && eventKey === "ArrowLeft") {
    return {
      type: "select-pack",
      packId: getNextPackSelection(currentPackId, visiblePacks, "left")
    };
  }

  if (eventKey === "ArrowDown") {
    return {
      type: "select-index",
      index: getNextSelectedIndex(selectedIndex, "down", visiblePrompts.length)
    };
  }

  if (eventKey === "ArrowUp") {
    return {
      type: "select-index",
      index: getNextSelectedIndex(selectedIndex, "up", visiblePrompts.length)
    };
  }

  if (/^[1-9]$/.test(eventKey) && query.trim() === "" && eventKey !== "1") {
    const nextIndex = Number(eventKey) - 1;

    if (nextIndex < visiblePrompts.length) {
      return {
        type: "confirm",
        prompt: visiblePrompts[nextIndex] ?? null,
        index: nextIndex
      };
    }

    return { type: "noop" };
  }

  if (shouldUsePrimaryConfirmShortcut(eventKey, query, selectedPrompt)) {
    return {
      type: "confirm",
      prompt: visiblePrompts[selectedIndex] ?? null,
      index: selectedIndex
    };
  }

  if (eventKey === "1" && query.trim() === "") {
    return {
      type: "confirm",
      prompt: visiblePrompts[0] ?? null,
      index: 0
    };
  }

  return { type: "noop" };
}

/**
 * Compute the next selected index after an ArrowUp or ArrowDown keypress.
 * Clamps to [0, listLength - 1].
 */
export function getNextSelectedIndex(
  currentIndex: number,
  direction: "up" | "down",
  listLength: number
): number {
  if (listLength <= 0) {
    return 0;
  }

  if (direction === "down") {
    return Math.min(currentIndex + 1, listLength - 1);
  }

  return Math.max(currentIndex - 1, 0);
}

const pinyinInitialsCache = new WeakMap<SearchableItem, string>();

function getCachedPinyinInitials(prompt: SearchableItem): string {
  let cached = pinyinInitialsCache.get(prompt);

  if (cached === undefined) {
    cached = getPinyinInitials(
      `${prompt.title} ${prompt.aliases.join(" ")} ${prompt.tags.join(" ")}`.toLowerCase()
    );
    pinyinInitialsCache.set(prompt, cached);
  }

  return cached;
}

/**
 * Filter prompts by a search query across title, description, body, pack name/id, aliases, and tags.
 * When the query is empty, returns items from the selected pack sorted by relevance.
 */
export function getVisiblePrompts<T extends SearchableItem>(
  allPrompts: T[],
  packItems: T[],
  query: string,
  persistedOrder: string[] = []
): T[] {
  const trimmed = query.trim();

  if (trimmed === "") {
    return sortPromptItems(packItems, persistedOrder);
  }

  const needle = trimmed.toLowerCase();

  return sortPromptItems(allPrompts.filter((prompt) => {
    const haystack =
      `${prompt.title} ${prompt.description} ${prompt.body} ${prompt.packName ?? ""} ${prompt.packId} ${prompt.aliases.join(" ")} ${prompt.tags.join(" ")}`.toLowerCase();

    if (haystack.includes(needle)) {
      return true;
    }

    return getCachedPinyinInitials(prompt).includes(needle);
  }), persistedOrder);
}

export function getPopupListState<T extends SelectableItem>(
  allPrompts: T[],
  packItems: T[],
  query: string,
  requestedIndex: number,
  persistedOrder: string[] = []
): PopupListState<T> {
  const visiblePrompts = getVisiblePrompts(allPrompts, packItems, query, persistedOrder);
  const selectedIndex =
    visiblePrompts.length === 0 ? 0 : Math.min(Math.max(requestedIndex, 0), visiblePrompts.length - 1);

  return {
    visiblePrompts,
    selectedIndex,
    selectedPrompt: visiblePrompts[selectedIndex] ?? null
  };
}

/**
 * Sort prompt items: favorites first, then by use count (desc), then by last used (desc),
 * then alphabetically by title.
 */
export function sortPromptItems<T extends SearchableItem>(
  items: T[],
  persistedOrder: string[] = []
): T[] {
  if (items.every((item) => typeof item.id === "string")) {
    return sortPromptItemsByOrder(
      items as Array<T & { id: string }>,
      persistedOrder
    ) as T[];
  }

  return [...items].sort((left, right) => {
    if (left.favorite !== right.favorite) {
      return left.favorite ? -1 : 1;
    }

    if ((left.useCount ?? 0) !== (right.useCount ?? 0)) {
      return (right.useCount ?? 0) - (left.useCount ?? 0);
    }

    if ((left.lastUsedAt ?? "") !== (right.lastUsedAt ?? "")) {
      return (right.lastUsedAt ?? "").localeCompare(left.lastUsedAt ?? "");
    }

    return left.title.localeCompare(right.title, "zh-CN");
  });
}

/**
 * Determine whether a scroll-into-view action is needed.
 * Returns true when a valid selected item id exists and is different from the previous one.
 */
export function shouldScrollToItem(
  selectedItemId: string | null,
  previousItemId: string | null
): boolean {
  return selectedItemId !== null && selectedItemId !== previousItemId;
}

export function getScrollTargetId<T extends SelectableItem>({
  visiblePrompts,
  selectedItemId,
  previousItemId
}: {
  visiblePrompts: T[];
  selectedItemId: string | null;
  previousItemId: string | null;
}): string | null {
  if (!shouldScrollToItem(selectedItemId, previousItemId)) {
    return null;
  }

  return visiblePrompts.some((prompt) => prompt.id === selectedItemId) ? selectedItemId : null;
}
