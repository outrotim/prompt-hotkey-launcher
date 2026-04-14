import { useEffect, useMemo, useRef, useState } from "react";
import type { PromptItem, PromptPack } from "../../shared/types";
import {
  getPopupListState,
  getScrollTargetId,
  resolvePopupKeyboardAction,
  sortPacksForPopupNavigation
} from "./popup-navigation.js";
import { shouldUsePrimaryConfirmShortcut } from "./prompt-helpers.js";

type SearchablePromptItem = PromptItem & {
  packName: string;
};

export function usePopupNavigation({
  packs,
  prompts,
  query,
  favoriteOnly,
  variableOnly,
  promptOrder,
  isSubmitting,
  onClearSearch,
  onEscape,
  onConfirmSelection
}: {
  packs: PromptPack[];
  prompts: PromptItem[];
  query: string;
  favoriteOnly: boolean;
  variableOnly: boolean;
  promptOrder: string[];
  isSubmitting: boolean;
  onClearSearch: () => void;
  onEscape: () => void;
  onConfirmSelection: (prompt: PromptItem | null) => void | Promise<void>;
}) {
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const promptItemRefs = useRef<Record<string, HTMLElement | null>>({});
  const previousSelectedPromptIdRef = useRef<string | null>(null);
  const onClearSearchRef = useRef(onClearSearch);
  const onEscapeRef = useRef(onEscape);
  const onConfirmSelectionRef = useRef(onConfirmSelection);

  useEffect(() => {
    onClearSearchRef.current = onClearSearch;
  }, [onClearSearch]);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    onConfirmSelectionRef.current = onConfirmSelection;
  }, [onConfirmSelection]);

  const filteredPacks = useMemo(
    () =>
      packs
        .map((pack) => ({
          ...pack,
          items: pack.items.filter((item) => {
            if (favoriteOnly && !item.favorite) {
              return false;
            }

            if (variableOnly && item.variables.length === 0) {
              return false;
            }

            return true;
          })
        }))
        .filter((pack) => pack.items.length > 0),
    [favoriteOnly, packs, variableOnly]
  );

  const packNameById = useMemo(
    () => new Map(packs.map((pack) => [pack.id, pack.name])),
    [packs]
  );

  const searchablePrompts = useMemo(
    () =>
      prompts.map((item) => ({
        ...item,
        packName: packNameById.get(item.packId) ?? item.packId
      })),
    [packNameById, prompts]
  );

  const filteredPrompts = useMemo(
    () =>
      searchablePrompts.filter((item) => {
        if (favoriteOnly && !item.favorite) {
          return false;
        }

        if (variableOnly && item.variables.length === 0) {
          return false;
        }

        return true;
      }),
    [favoriteOnly, searchablePrompts, variableOnly]
  );

  const visiblePacks = useMemo(
    () => sortPacksForPopupNavigation(filteredPacks),
    [filteredPacks]
  );

  useEffect(() => {
    setSelectedPackId((currentPackId) =>
      visiblePacks.some((pack) => pack.id === currentPackId) ? currentPackId : (visiblePacks[0]?.id ?? null)
    );
  }, [visiblePacks]);

  const selectedPack =
    visiblePacks.find((pack) => pack.id === selectedPackId) ?? visiblePacks[0] ?? null;

  const selectedPackItems = useMemo<SearchablePromptItem[]>(
    () =>
      (selectedPack?.items ?? [])
        .filter((item) => {
          if (favoriteOnly && !item.favorite) {
            return false;
          }

          if (variableOnly && item.variables.length === 0) {
            return false;
          }

          return true;
        })
        .map((item) => ({
          ...item,
          packName: packNameById.get(item.packId) ?? item.packId
        })),
    [favoriteOnly, packNameById, selectedPack, variableOnly]
  );

  const popupListState = useMemo(
    () =>
      getPopupListState(
        filteredPrompts,
        selectedPackItems,
        query,
        selectedIndex,
        promptOrder
      ),
    [filteredPrompts, promptOrder, query, selectedIndex, selectedPackItems]
  );

  const visiblePrompts = popupListState.visiblePrompts;
  const selectedPrompt = popupListState.selectedPrompt;

  useEffect(() => {
    console.info(
      `[popup-pack-nav:selected] packId=${selectedPackId ?? "null"} packName=${selectedPack ? selectedPack.name : "null"} visibleOrder=${visiblePacks
        .map((pack) => pack.name)
        .join(" > ")}`
    );
  }, [selectedPack, selectedPackId, visiblePacks]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [favoriteOnly, query, selectedPackId, variableOnly]);

  useEffect(() => {
    if (popupListState.selectedIndex !== selectedIndex) {
      setSelectedIndex(popupListState.selectedIndex);
    }
  }, [popupListState.selectedIndex, selectedIndex]);

  useEffect(() => {
    const scrollTargetId = getScrollTargetId({
      visiblePrompts,
      selectedItemId: selectedPrompt?.id ?? null,
      previousItemId: previousSelectedPromptIdRef.current
    });
    previousSelectedPromptIdRef.current = selectedPrompt?.id ?? null;

    const currentItem = scrollTargetId ? promptItemRefs.current[scrollTargetId] : null;

    if (!listContainerRef.current || !currentItem) {
      return;
    }

    currentItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedPrompt, visiblePrompts]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isPackNavigationKey = event.key === "ArrowLeft" || event.key === "ArrowRight";
      const targetKind = event.target && "dataset" in event.target
        ? ((event.target as import("./popup-navigation.js").PopupKeyboardTarget)?.dataset?.promptbarSearchField
            ? "search-field"
            : (event.target as import("./popup-navigation.js").PopupKeyboardTarget)?.dataset?.promptbarVariableField
              ? "variable-field"
              : "other")
        : "other";

      if (isPackNavigationKey) {
        console.info(
          `[popup-pack-nav:key] key=${event.key} query=${JSON.stringify(query)} target=${targetKind} currentPackId=${selectedPackId ?? "null"} currentPackName=${selectedPack ? selectedPack.name : "null"} visibleOrder=${visiblePacks
            .map((pack) => pack.name)
            .join(" > ")}`
        );
      }

      const action = resolvePopupKeyboardAction({
        eventKey: event.key,
        target: event.target as import("./popup-navigation.js").PopupKeyboardTarget,
        query,
        isSubmitting,
        currentPackId: selectedPackId,
        selectedIndex,
        selectedPrompt,
        visiblePrompts,
        visiblePacks,
        shouldUsePrimaryConfirmShortcut
      });

      if (isPackNavigationKey) {
        const nextPack =
          action.type === "select-pack"
            ? visiblePacks.find((pack) => pack.id === action.packId) ?? null
            : null;

        console.info(
          `[popup-pack-nav:action] key=${event.key} action=${action.type}${nextPack ? ` nextPackId=${nextPack.id} nextPackName=${nextPack.name}` : ""}`
        );
      }

      if (action.type === "noop") {
        return;
      }

      event.preventDefault();

      if (action.type === "escape") {
        onEscapeRef.current();
        return;
      }

      if (action.type === "clear-search") {
        onClearSearchRef.current();
        return;
      }

      if (action.type === "select-pack") {
        console.info(
          `[popup-pack-nav:set-selected] key=${event.key} nextPackId=${action.packId ?? "null"}`
        );
        setSelectedPackId(action.packId);
        return;
      }

      if (action.type === "select-index") {
        setSelectedIndex(action.index);
        return;
      }

      if (action.index !== null) {
        setSelectedIndex(action.index);
      }

      void onConfirmSelectionRef.current(action.prompt);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    isSubmitting,
    query,
    selectedIndex,
    selectedPackId,
    selectedPrompt,
    visiblePacks,
    visiblePrompts
  ]);

  return {
    listContainerRef,
    promptItemRefs,
    selectedIndex,
    setSelectedIndex,
    selectedPack,
    selectedPackId,
    setSelectedPackId,
    selectedPrompt,
    visiblePacks,
    visiblePrompts
  };
}
