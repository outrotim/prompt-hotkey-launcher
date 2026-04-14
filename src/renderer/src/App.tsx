import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type {
  PromptDeliveryMode,
  PromptFileMetadata,
  PromptItem,
  PromptLibrary,
  PromptPack,
  PromptSelectionPayload,
  Locale
} from "../../shared/types";
import { createTranslator, messages } from "../../shared/messages.js";
import {
  buildPackOrderFromReplacement,
  getPromptPackOrderKey,
  movePackBetweenFiles,
  reorderPacks,
  supportsCrossFilePackMigration,
  sortPromptPacks
} from "../../shared/pack-order.js";
import {
  buildPromptOrderFromPacks,
  buildPromptOrderFromReplacement,
  getDropPlacement,
  movePromptBetweenPacks,
  reorderPrompts,
  resolveReorderTargetIndex,
  shouldSuppressDragClick
} from "../../shared/prompt-order.js";
import {
  buildDraftPromptFilePath,
  resolveManagerDraftBaseDirectory
} from "../../shared/prompt-files.js";
import {
  createDefaultMetadata,
  createPack,
  createPrompt
} from "./prompt-helpers.js";
import {
  addDirtyPromptFiles,
  buildReloadConfirmationMessage,
  buildPromptFileSavePlan,
  removeDirtyPromptFiles,
  shouldConfirmReloadMarkdown
} from "./manager-save.js";
import {
  sortPromptItems
} from "./popup-navigation.js";
import { getNextPointerHoverEnabled } from "../../shared/pointer-hover-mode.js";
import { resolveInitialView } from "./view-mode.js";
import { usePopupNavigation } from "./usePopupNavigation.js";
import { PopupPromptList } from "./PopupPromptList.js";
import { PopupPromptChrome } from "./PopupPromptChrome.js";
import { PopupPromptFeedback } from "./PopupPromptFeedback.js";

declare global {
  interface Window {
    promptBar: {
      platform: NodeJS.Platform;
      listPrompts: () => Promise<PromptLibrary>;
      confirmSelection: (payload: PromptSelectionPayload) => Promise<{
        ok: boolean;
        renderedText: string;
        delivery?: "default" | "clipboard-fallback" | "clipboard-manual";
        message?: string;
      }>;
      quickAddPrompt: (payload: { packId: string; title: string; body: string }) => Promise<{
        ok: boolean;
        promptId: string;
      }>;
      openPromptsFolder: () => Promise<{ ok: boolean }>;
      openPromptSource: (filePath: string) => Promise<{ ok: boolean }>;
      savePromptFile: (payload: {
        sourceFile: string;
        packs: PromptPack[];
      }) => Promise<{ ok: boolean }>;
      getPermissions: () => Promise<{
        accessible: boolean;
        platform: NodeJS.Platform;
      }>;
      getSettings: () => Promise<{
        hotkey: string;
        launchAtLogin: boolean;
        locale: Locale;
        packOrder: string[];
        promptOrder: string[];
        customPromptsDirectory: string;
        settingsSectionOrder: string[];
        activeHotkey: string | null;
        hotkeyRegistered: boolean;
      }>;
      updateSettings: (partial: {
        hotkey?: string;
        launchAtLogin?: boolean;
        locale?: Locale;
        packOrder?: string[];
        promptOrder?: string[];
        customPromptsDirectory?: string;
        settingsSectionOrder?: string[];
      }) => Promise<{
        hotkey: string;
        launchAtLogin: boolean;
        locale: Locale;
        packOrder: string[];
        promptOrder: string[];
        customPromptsDirectory: string;
        settingsSectionOrder: string[];
        activeHotkey: string | null;
        hotkeyRegistered: boolean;
        registered: boolean;
      }>;
      selectPromptsDirectory: () => Promise<{
        selected: boolean;
        directory: string;
      }>;
      requestAccessibilityAccess: () => Promise<{
        accessible: boolean;
        platform: NodeJS.Platform;
      }>;
      openManager: () => Promise<{ ok: boolean }>;
      openSettings: () => Promise<{ ok: boolean }>;
      onPopupOpened: (callback: () => void) => () => void;
      hidePopup: () => void;
    };
  }
}

const shellStyle: CSSProperties = {
  margin: 0,
  minHeight: "100vh",
  display: "flex",
  alignItems: "stretch",
  justifyContent: "center",
  background:
    "radial-gradient(circle at top, rgba(253, 230, 138, 0.45), transparent 32%), linear-gradient(180deg, rgba(15, 23, 42, 0.92), rgba(15, 23, 42, 0.84))",
  color: "#e2e8f0",
  fontFamily:
    '"SF Pro Display", "SF Pro Text", -apple-system, BlinkMacSystemFont, sans-serif'
};

const panelStyle: CSSProperties = {
  width: "100%",
  padding: 16,
  borderRadius: 20,
  border: "1px solid rgba(255, 255, 255, 0.12)",
  background: "rgba(15, 23, 42, 0.82)",
  boxShadow: "0 24px 80px rgba(15, 23, 42, 0.45)",
  backdropFilter: "blur(18px)"
};

const fieldStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 12,
  padding: "10px 12px",
  background: "rgba(15, 23, 42, 0.68)",
  color: "#f8fafc",
  fontSize: 14,
  outline: "none"
};

const textareaStyle: CSSProperties = {
  ...fieldStyle,
  minHeight: 220,
  resize: "vertical",
  fontFamily: '"SF Mono", "Menlo", "Monaco", monospace'
};

const buttonStyle: CSSProperties = {
  border: "none",
  borderRadius: 12,
  padding: "10px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer"
};

const dragFeedbackTransition =
  "transform 150ms ease, opacity 150ms ease, box-shadow 150ms ease, border-color 150ms ease, background 150ms ease";

export function App() {
  const view = resolveInitialView(window.location.search, window.location.hash);
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    let active = true;

    void window.promptBar
      .getSettings()
      .then((settings) => {
        if (active) {
          setLocale(settings.locale);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  if (view === "settings") {
    return <SettingsView locale={locale} setLocale={setLocale} />;
  }

  if (view === "manager") {
    return <ManagerView locale={locale} />;
  }

  return <PopupView locale={locale} />;
}

function sortPacksForDisplay(
  packs: PromptPack[],
  packOrder: string[] = [],
  promptOrder: string[] = []
) {
  return sortPromptPacks(
    packs.map((pack) => ({
      ...pack,
      items: sortPromptItems(pack.items, promptOrder)
    })),
    packOrder
  );
}

function PopupView(props: { locale: Locale }) {
  const t = createTranslator(props.locale);
  const [packs, setPacks] = useState<PromptPack[]>([]);
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [query, setQuery] = useState("");
  const [confirmedPromptTitle, setConfirmedPromptTitle] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [valuesByPrompt, setValuesByPrompt] = useState<
    Record<string, Record<string, string>>
  >({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectionDeliveryMode, setSelectionDeliveryMode] = useState<PromptDeliveryMode>("auto");
  const [activeHotkey, setActiveHotkey] = useState<string | null>(null);
  const [promptOrder, setPromptOrder] = useState<string[]>([]);
  const [popupHoverEnabled, setPopupHoverEnabled] = useState(false);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [variableOnly, setVariableOnly] = useState(false);
  const [draggedPopupPackId, setDraggedPopupPackId] = useState<string | null>(null);
  const [dragOverPopupPackId, setDragOverPopupPackId] = useState<string | null>(null);
  const [dragOverPopupPackPlacement, setDragOverPopupPackPlacement] = useState<"before" | "after">("before");
  const [dragOverPopupPackEnd, setDragOverPopupPackEnd] = useState(false);
  const [draggedPopupPromptId, setDraggedPopupPromptId] = useState<string | null>(null);
  const [dragOverPopupPromptId, setDragOverPopupPromptId] = useState<string | null>(null);
  const [dragOverPopupPromptPlacement, setDragOverPopupPromptPlacement] = useState<"before" | "after">("before");
  const [dragOverPopupPromptEnd, setDragOverPopupPromptEnd] = useState(false);
  const [suppressPopupClickUntil, setSuppressPopupClickUntil] = useState(0);
  const [quickAddMode, setQuickAddMode] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddBody, setQuickAddBody] = useState("");
  const [quickAddPackId, setQuickAddPackId] = useState<string | null>(null);
  const [quickAddSaving, setQuickAddSaving] = useState(false);

  const loadPrompts = async () => {
    setLoading(true);
    setQuickAddMode(false);
    setQuickAddTitle("");
    setQuickAddBody("");

    try {
      const library = await window.promptBar.listPrompts();
      const settings = await window.promptBar.getSettings().catch(() => null);

      const nextPackOrder = settings?.packOrder ?? [];
      setPacks(sortPacksForDisplay(library.packs, nextPackOrder, settings?.promptOrder ?? []));
      setPrompts(sortPromptItems(library.items, settings?.promptOrder ?? []));
      setActiveHotkey(settings?.activeHotkey ?? null);
      setPromptOrder(settings?.promptOrder ?? []);
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : t("Failed to load Markdown prompts.", "加载 Markdown 提示词失败。")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPrompts();
    const unsubscribe = window.promptBar.onPopupOpened(() => {
      setPopupHoverEnabled((current) => getNextPointerHoverEnabled(current, "popup-opened"));
      void loadPrompts();
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const isSearching = query.trim() !== "";
  const canReorderPopupPacks = !isSearching && !favoriteOnly && !variableOnly;
  const {
    listContainerRef,
    promptItemRefs,
    selectedIndex,
    setSelectedIndex,
    selectedPack,
    setSelectedPackId,
    selectedPrompt,
    visiblePacks,
    visiblePrompts
  } = usePopupNavigation({
    packs,
    prompts,
    query,
    favoriteOnly,
    variableOnly,
    promptOrder,
    isSubmitting,
    onClearSearch: () => {
      setQuery("");
      setConfirmedPromptTitle(null);
      setActionError(null);
      setActionMessage(null);
    },
    onEscape: () => {
      setQuery("");
      setConfirmedPromptTitle(null);
      setActionError(null);
      setActionMessage(null);
      window.promptBar.hidePopup();
    },
    onConfirmSelection: (prompt) => {
      void confirmSelection(prompt);
    }
  });

  useEffect(() => {
    if (!selectedPrompt || selectedPrompt.variables.length === 0) {
      return;
    }

    setValuesByPrompt((current) => {
      if (current[selectedPrompt.id]) {
        return current;
      }

      const initialValues = Object.fromEntries(
        selectedPrompt.variables.map((variable) => [
          variable.key,
          selectedPrompt.lastValues?.[variable.key] ?? variable.defaultValue ?? ""
        ])
      );

      return {
        ...current,
        [selectedPrompt.id]: initialValues
      };
    });
  }, [selectedPrompt]);

  const updateVariable = (promptId: string, key: string, value: string) => {
    setValuesByPrompt((current) => ({
      ...current,
      [promptId]: {
        ...(current[promptId] ?? {}),
        [key]: value
      }
    }));
  };

  const validatePrompt = (prompt: PromptItem) => {
    const values = valuesByPrompt[prompt.id] ?? {};
    const missingVariable = prompt.variables.find(
      (variable) => variable.required && !(values[variable.key] ?? "").trim()
    );

      return missingVariable
        ? t(`Please fill "${missingVariable.key}" before inserting.`, `插入前请填写“${missingVariable.key}”。`)
        : null;
  };

  const confirmSelection = async (prompt: PromptItem | null) => {
    if (!prompt) {
      return;
    }

    const validationError = validatePrompt(prompt);

    if (validationError) {
      setActionError(validationError);
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    setActionMessage(null);
    setConfirmedPromptTitle(prompt.title);

    try {
      const result = await window.promptBar.confirmSelection({
        promptId: prompt.id,
        variables: valuesByPrompt[prompt.id] ?? {},
        deliveryMode: selectionDeliveryMode
      });

      if (
        (result.delivery === "clipboard-fallback" || result.delivery === "clipboard-manual") &&
        result.message
      ) {
        setActionMessage(result.message);
      }
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : t("Failed to insert the selected prompt.", "插入选中的提示词失败。")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const canReorderPopupPrompts =
    !isSearching &&
    !favoriteOnly &&
    !variableOnly &&
    !isSubmitting &&
    !!selectedPack &&
    visiblePrompts.length > 0;

  const persistPackOrder = async (nextOrder: string[]) => {
    try {
      await window.promptBar.updateSettings({ packOrder: nextOrder });
      setLoadError(null);
    } catch (nextError) {
      setLoadError(
        nextError instanceof Error
          ? nextError.message
          : t("Failed to save pack order.", "保存分组顺序失败。")
      );
    }
  };

  const persistPromptOrder = async (nextOrder: string[]) => {
    setPromptOrder(nextOrder);

    try {
      const nextSettings = await window.promptBar.updateSettings({ promptOrder: nextOrder });
      setPromptOrder(nextSettings.promptOrder);
      setLoadError(null);
    } catch (nextError) {
      setLoadError(
        nextError instanceof Error
          ? nextError.message
          : t("Failed to save prompt order.", "保存提示词顺序失败。")
      );
    }
  };

  const movePopupPack = (targetPackId: string, placement: "before" | "after" = "before") => {
    if (!canReorderPopupPacks || !draggedPopupPackId || draggedPopupPackId === targetPackId) {
      return;
    }

    const fromIndex = packs.findIndex((pack) => pack.id === draggedPopupPackId);
    const toIndex = packs.findIndex((pack) => pack.id === targetPackId);

    if (fromIndex === -1 || toIndex === -1) {
      return;
    }

    let nextIndex = toIndex;

    if (placement === "before") {
      nextIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    } else {
      nextIndex = fromIndex < toIndex ? toIndex : toIndex + 1;
    }

    nextIndex = Math.max(0, Math.min(packs.length - 1, nextIndex));

    const nextPacks = reorderPacks(packs, fromIndex, nextIndex);
    const nextOrder = nextPacks.map((pack) => getPromptPackOrderKey(pack));

    setPacks(sortPacksForDisplay(nextPacks, nextOrder, promptOrder));
    void persistPackOrder(nextOrder);
    setSuppressPopupClickUntil(Date.now() + 180);
    setDraggedPopupPackId(null);
    setDragOverPopupPackId(null);
    setDragOverPopupPackPlacement("before");
    setDragOverPopupPackEnd(false);
    setSelectedPackId(draggedPopupPackId);
  };

  const movePopupPrompt = (
    targetPromptId?: string,
    placement: "before" | "after" = "before"
  ) => {
    if (!canReorderPopupPrompts || !selectedPack || !draggedPopupPromptId) {
      return;
    }

    const sourceItems = selectedPack.items;
    const fromIndex = sourceItems.findIndex((item) => item.id === draggedPopupPromptId);

    if (fromIndex === -1) {
      return;
    }

    const targetIndex =
      targetPromptId == null
        ? sourceItems.length - 1
        : sourceItems.findIndex((item) => item.id === targetPromptId);

    if (targetIndex === -1) {
      return;
    }

    const nextItems = reorderPrompts(
      sourceItems,
      fromIndex,
      Math.min(
        sourceItems.length - 1,
        resolveReorderTargetIndex(fromIndex, targetIndex, placement)
      )
    );

    const didChange = nextItems.some((item, index) => item.id !== sourceItems[index]?.id);

    if (!didChange) {
      return;
    }

    const nextPromptOrder = buildPromptOrderFromReplacement(
      prompts,
      selectedPack.id,
      nextItems
    );
    const nextPacks = packs.map((pack) =>
      pack.id === selectedPack.id
        ? {
            ...pack,
            items: nextItems
          }
        : pack
    );

    setPacks(nextPacks);
    setPrompts(sortPromptItems(nextPacks.flatMap((pack) => pack.items), nextPromptOrder));
    void persistPromptOrder(nextPromptOrder);
    setSuppressPopupClickUntil(Date.now() + 180);
    setDraggedPopupPromptId(null);
    setDragOverPopupPromptId(null);
    setDragOverPopupPromptPlacement("before");
    setDragOverPopupPromptEnd(false);
    setSelectedIndex(nextItems.findIndex((item) => item.id === draggedPopupPromptId));
  };

  return (
    <main style={shellStyle}>
      <section
        style={panelStyle}
        onMouseMove={() => {
          setPopupHoverEnabled((current) => {
            if (current) {
              return current;
            }

            return getNextPointerHoverEnabled(current, "pointer-moved");
          });
        }}
      >
        <Header
          title={t("Quick Insert", "快速插入")}
          subtitle="PROMPTBAR"
          rightLabel={activeHotkey ?? t("Shortcut unavailable", "快捷键不可用")}
        />

        <PopupPromptChrome
          query={query}
          isSearching={isSearching}
          favoriteOnly={favoriteOnly}
          variableOnly={variableOnly}
          deliveryMode={selectionDeliveryMode}
          visiblePacks={visiblePacks}
          selectedPackId={selectedPack?.id ?? null}
          canReorderPacks={canReorderPopupPacks}
          draggedPackId={draggedPopupPackId}
          dragOverPackId={dragOverPopupPackId}
          dragOverPackPlacement={dragOverPopupPackPlacement}
          dragOverPackEnd={dragOverPopupPackEnd}
          t={t}
          onChangeQuery={(value) => {
            setQuery(value);
            setConfirmedPromptTitle(null);
            setActionError(null);
          }}
          onToggleFavoriteFilter={() => {
            setFavoriteOnly((current) => !current);
            setConfirmedPromptTitle(null);
            setActionError(null);
          }}
          onToggleVariableFilter={() => {
            setVariableOnly((current) => !current);
            setConfirmedPromptTitle(null);
            setActionError(null);
          }}
          onSetDeliveryMode={(mode) => {
            setSelectionDeliveryMode(mode);
            setConfirmedPromptTitle(null);
            setActionError(null);
            setActionMessage(null);
          }}
          onSelectPack={(packId) => {
            if (Date.now() < suppressPopupClickUntil) {
              return;
            }

            setSelectedPackId(packId);
            setSelectedIndex(0);
          }}
          onDragPackStart={(packId) => {
            setDraggedPopupPackId(packId);
            setDragOverPopupPackId(packId);
          }}
          onDragPackOver={(packId, placement) => {
            setDragOverPopupPackId(packId);
            setDragOverPopupPackPlacement(placement);
            setDragOverPopupPackEnd(false);
          }}
          onDropPack={(packId, placement) => {
            movePopupPack(packId, placement);
          }}
          onDragPackEndZoneOver={() => {
            setDragOverPopupPackId(null);
            setDragOverPopupPackPlacement("before");
            setDragOverPopupPackEnd(true);
          }}
          onDropPackToEnd={() => {
            const lastPackId = packs[packs.length - 1]?.id;

            if (lastPackId) {
              movePopupPack(lastPackId, "after");
            }
          }}
          onDragPackEnd={() => {
            setSuppressPopupClickUntil(Date.now() + 180);
            setDraggedPopupPackId(null);
            setDragOverPopupPackId(null);
            setDragOverPopupPackPlacement("before");
            setDragOverPopupPackEnd(false);
          }}
        />

        <div
          ref={listContainerRef}
          style={{ display: "grid", gap: 10, maxHeight: 336, overflowY: "auto", paddingRight: 4 }}
        >
          <PopupPromptFeedback
            loading={loading}
            loadError={loadError}
            isSearching={isSearching}
            favoriteOnly={favoriteOnly}
            variableOnly={variableOnly}
            visiblePromptCount={visiblePrompts.length}
            t={t}
            onClearFilters={
              favoriteOnly || variableOnly
                ? () => {
                    setFavoriteOnly(false);
                    setVariableOnly(false);
                    setConfirmedPromptTitle(null);
                    setActionError(null);
                  }
                : undefined
            }
          />
          {!loading && !loadError && visiblePrompts.length > 0 ? (
            <PopupPromptList
              prompts={visiblePrompts}
              packs={visiblePacks}
              selectedIndex={selectedIndex}
              canReorderPrompts={canReorderPopupPrompts}
              draggedPromptId={draggedPopupPromptId}
              dragOverPromptId={dragOverPopupPromptId}
              dragOverPromptPlacement={dragOverPopupPromptPlacement}
              dragOverPromptEnd={dragOverPopupPromptEnd}
              onHoverPrompt={(index) => {
                if (!popupHoverEnabled) {
                  return;
                }

                setSelectedIndex(index);
              }}
              onSelectPrompt={(prompt) => {
                if (Date.now() < suppressPopupClickUntil) {
                  return;
                }

                void confirmSelection(prompt);
              }}
              onDragPromptStart={(promptId) => {
                setDraggedPopupPromptId(promptId);
                setDragOverPopupPromptId(promptId);
              }}
              onDragPromptOver={(promptId, placement) => {
                setDragOverPopupPromptId(promptId);
                setDragOverPopupPromptPlacement(placement);
                setDragOverPopupPromptEnd(false);
              }}
              onDropPrompt={(promptId, placement) => {
                movePopupPrompt(promptId, placement);
              }}
              onDragPromptEndZoneOver={() => {
                setDragOverPopupPromptId(null);
                setDragOverPopupPromptPlacement("before");
                setDragOverPopupPromptEnd(true);
              }}
              onDropPromptToEnd={() => {
                movePopupPrompt(undefined, "after");
              }}
              onDragPromptEnd={() => {
                setSuppressPopupClickUntil(Date.now() + 180);
                setDraggedPopupPromptId(null);
                setDragOverPopupPromptId(null);
                setDragOverPopupPromptPlacement("before");
                setDragOverPopupPromptEnd(false);
              }}
              promptItemRefs={promptItemRefs}
              t={t}
            />
          ) : null}
        </div>

        <section style={sectionCardStyle}>
          <SectionLabel>{t("Preview", "预览")}</SectionLabel>
          <div style={previewStyle}>{renderPromptTemplate(selectedPrompt, valuesByPrompt)}</div>

          {selectedPrompt?.variables.length ? (
            <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
              {selectedPrompt.variables.map((variable) => {
                const promptValues = valuesByPrompt[selectedPrompt.id] ?? {};
                const currentValue = promptValues[variable.key] ?? "";

                return (
                  <label key={variable.key} style={fieldLabelStyle}>
                    <span>{variable.key}</span>
                    {variable.kind === "enum" ? (
                      <select
                        data-promptbar-variable-field="true"
                        style={fieldStyle}
                        value={currentValue}
                        onChange={(event) => {
                          updateVariable(selectedPrompt.id, variable.key, event.target.value);
                          setActionError(null);
                          setActionMessage(null);
                        }}
                      >
                        {variable.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        data-promptbar-variable-field="true"
                        style={fieldStyle}
                        value={currentValue}
                        placeholder={`Fill ${variable.key}`}
                        onChange={(event) => {
                          updateVariable(selectedPrompt.id, variable.key, event.target.value);
                          setActionError(null);
                          setActionMessage(null);
                        }}
                      />
                    )}
                  </label>
                );
              })}
            </div>
          ) : null}

          <div style={footerMetaStyle}>
            <span>
              {selectionDeliveryMode === "auto"
                ? t(
                    "Arrow up/down to move, left/right to switch packs, 1 or Enter to auto insert.",
                    "上下键移动，左右键切换分组，1 或 Enter 自动写入。"
                  )
                : t(
                    "Arrow up/down to move, left/right to switch packs, 1 or Enter to copy.",
                    "上下键移动，左右键切换分组，1 或 Enter 复制到剪贴板。"
                  )}
            </span>
            <span>{confirmedPromptTitle ? t(`Selected: ${confirmedPromptTitle}`, `已选择：${confirmedPromptTitle}`) : t("Ready", "就绪")}</span>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <ActionButton
              tone="blue"
              onClick={() => {
                void window.promptBar.openPromptsFolder();
              }}
            >
              {t("Open Prompts Folder", "打开 Prompts 文件夹")}
            </ActionButton>
            <ActionButton
              tone="muted"
              disabled={!selectedPrompt}
              onClick={() => {
                if (selectedPrompt) {
                  void window.promptBar.openPromptSource(selectedPrompt.sourceFile);
                }
              }}
            >
              {t("Edit Current File", "编辑当前文件")}
            </ActionButton>
            <ActionButton
              tone="blue"
              onClick={() => {
                void window.promptBar.openManager();
              }}
            >
              {t("Open Manager", "打开管理器")}
            </ActionButton>
            <ActionButton
              tone="accent"
              onClick={() => {
                setQuickAddMode(!quickAddMode);
                setQuickAddTitle("");
                setQuickAddBody("");
                setQuickAddPackId(packs[0]?.id ?? null);
              }}
            >
              {quickAddMode ? t("Close", "关闭") : t("+ New", "+ 新建")}
            </ActionButton>
            <ActionButton
              tone="muted"
              onClick={() => {
                void window.promptBar.openSettings();
              }}
            >
              {t(messages.openSettings)}
            </ActionButton>
          </div>

          {quickAddMode ? (
            <div style={{ marginTop: 12, padding: "12px 14px", backgroundColor: "#1e293b", borderRadius: 8, display: "grid", gap: 10 }}>
              <select
                style={{ ...fieldStyle, fontSize: 13, padding: "6px 8px" }}
                value={quickAddPackId ?? ""}
                onChange={(e) => setQuickAddPackId(e.target.value)}
              >
                {packs.map((pack) => (
                  <option key={pack.id} value={pack.id}>{pack.name}</option>
                ))}
              </select>
              <input
                style={{ ...fieldStyle, fontSize: 13, padding: "6px 8px" }}
                placeholder={t("Prompt title", "提示词标题")}
                value={quickAddTitle}
                onChange={(e) => setQuickAddTitle(e.target.value)}
                autoFocus
              />
              <textarea
                style={{ ...fieldStyle, fontSize: 12, padding: "6px 8px", minHeight: 60, resize: "vertical", fontFamily: '"SF Mono", "Menlo", monospace' }}
                placeholder={t("Prompt body (supports {{variables}})", "提示词正文（支持 {{变量}}）")}
                value={quickAddBody}
                onChange={(e) => setQuickAddBody(e.target.value)}
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <ActionButton
                  tone="muted"
                  onClick={() => setQuickAddMode(false)}
                >
                  {t("Cancel", "取消")}
                </ActionButton>
                <ActionButton
                  tone="accent"
                  disabled={!quickAddPackId || !quickAddTitle.trim() || quickAddSaving}
                  onClick={() => {
                    if (!quickAddPackId || !quickAddTitle.trim()) {
                      return;
                    }

                    setQuickAddSaving(true);
                    void window.promptBar
                      .quickAddPrompt({
                        packId: quickAddPackId,
                        title: quickAddTitle.trim(),
                        body: quickAddBody.trim()
                      })
                      .then(() => {
                        setQuickAddMode(false);
                        setQuickAddTitle("");
                        setQuickAddBody("");
                        return loadPrompts();
                      })
                      .catch((err: unknown) => {
                        setActionError(
                          err instanceof Error ? err.message : t("Failed to create prompt.", "创建提示词失败。")
                        );
                      })
                      .finally(() => {
                        setQuickAddSaving(false);
                      });
                  }}
                >
                  {quickAddSaving ? t("Creating...", "创建中...") : t("Create", "创建")}
                </ActionButton>
              </div>
            </div>
          ) : null}

          {actionMessage ? <SuccessText>{actionMessage}</SuccessText> : null}
          {actionError ? <ErrorText>{actionError}</ErrorText> : null}

          <div style={{ marginTop: 14, display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <ActionButton
              tone="muted"
              onClick={() => {
                setQuery("");
                setConfirmedPromptTitle(null);
                setActionError(null);
                setActionMessage(null);
                window.promptBar.hidePopup();
              }}
            >
              {t("Cancel", "取消")}
            </ActionButton>
            <ActionButton
              tone="accent"
              disabled={!selectedPrompt || isSubmitting}
              onClick={() => {
                void confirmSelection(selectedPrompt);
              }}
            >
              {isSubmitting ? t("Inserting...", "正在插入...") : t("Insert Prompt", "插入提示词")}
            </ActionButton>
          </div>
        </section>
      </section>
    </main>
  );
}

const DEFAULT_SETTINGS_SECTION_ORDER = [
  "hotkey", "accessibility", "launchAtLogin", "language", "promptsDirectory", "workspace"
];

function SettingsSectionGrid(props: {
  sectionOrder: string[];
  sections: Record<string, React.ReactNode>;
  onReorder: (order: string[]) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const orderedKeys = props.sectionOrder.filter((key) => key in props.sections);

  for (const key of Object.keys(props.sections)) {
    if (!orderedKeys.includes(key)) {
      orderedKeys.push(key);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {orderedKeys.map((key) => (
        <div
          key={key}
          draggable
          onDragStart={() => {
            setDraggedId(key);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverId(key);
          }}
          onDragLeave={() => {
            if (dragOverId === key) {
              setDragOverId(null);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();

            if (draggedId && draggedId !== key) {
              const next = [...orderedKeys];
              const fromIndex = next.indexOf(draggedId);
              const toIndex = next.indexOf(key);

              next.splice(fromIndex, 1);
              next.splice(toIndex, 0, draggedId);

              props.onReorder(next);
            }

            setDraggedId(null);
            setDragOverId(null);
          }}
          onDragEnd={() => {
            setDraggedId(null);
            setDragOverId(null);
          }}
          style={{
            opacity: draggedId === key ? 0.4 : 1,
            borderTop: dragOverId === key && draggedId !== key ? "2px solid #3b82f6" : "2px solid transparent",
            transition: "opacity 0.15s",
            cursor: "grab"
          }}
        >
          {props.sections[key]}
        </div>
      ))}
    </div>
  );
}

function SettingsView(props: { locale: Locale; setLocale: (locale: Locale) => void }) {
  const t = createTranslator(props.locale);
  const [settings, setSettings] = useState<{
    hotkey: string;
    launchAtLogin: boolean;
    locale: Locale;
    packOrder: string[];
    promptOrder: string[];
    customPromptsDirectory: string;
    settingsSectionOrder: string[];
    activeHotkey: string | null;
    hotkeyRegistered: boolean;
  } | null>(null);
  const [permissions, setPermissions] = useState<{
    accessible: boolean;
    platform: NodeJS.Platform;
  } | null>(null);
  const [hotkeyDraft, setHotkeyDraft] = useState("");
  const [sectionOrder, setSectionOrder] = useState<string[]>(DEFAULT_SETTINGS_SECTION_ORDER);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void Promise.all([
      window.promptBar.getSettings(),
      window.promptBar.getPermissions()
    ])
      .then(([nextSettings, nextPermissions]) => {
        if (!active) {
          return;
        }

        setSettings(nextSettings);
        setPermissions(nextPermissions);
        setHotkeyDraft(nextSettings.hotkey);
        if (nextSettings.settingsSectionOrder && nextSettings.settingsSectionOrder.length > 0) {
          setSectionOrder(nextSettings.settingsSectionOrder);
        }
      })
      .catch((nextError: unknown) => {
        if (!active) {
          return;
        }

        setError(nextError instanceof Error ? nextError.message : t("Failed to load settings.", "加载设置失败。"));
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const refreshPermissions = async () => {
    const nextPermissions = await window.promptBar.getPermissions();
    setPermissions(nextPermissions);
  };

  return (
    <main style={shellStyle}>
      <section style={{ ...panelStyle, maxWidth: 880 }}>
        <Header title={t("Settings", "设置")} subtitle="PROMPTBAR" rightLabel={t("Desktop App", "桌面应用")} />

        {loading ? <MessageCard tone="muted">{t("Loading settings...", "正在加载设置...")}</MessageCard> : null}
        {error ? <MessageCard tone="danger">{error}</MessageCard> : null}

        <SettingsSectionGrid
          sectionOrder={sectionOrder}
          onReorder={(nextOrder) => {
            setSectionOrder(nextOrder);
            void window.promptBar.updateSettings({ settingsSectionOrder: nextOrder });
          }}
          sections={{
            hotkey: (
              <section style={sectionCardStyle}>
                <SectionLabel>{t("Global Hotkey", "全局快捷键")}</SectionLabel>
                <label style={fieldLabelStyle}>
                  <span>{t("Shortcut string", "快捷键字符串")}</span>
                  <input
                    style={fieldStyle}
                    value={hotkeyDraft}
                    onChange={(event) => {
                      setHotkeyDraft(event.target.value);
                      setMessage(null);
                      setError(null);
                    }}
                    placeholder={t("Control+Q", "Control+Q")}
                  />
                </label>
                <div style={{ marginTop: 10, fontSize: 13, color: "#94a3b8" }}>
                  {t("Active shortcut", "当前生效快捷键")}:
                  {" "}
                  {settings?.hotkeyRegistered
                    ? settings.activeHotkey
                    : t("Unavailable", "不可用")}
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <ActionButton
                    tone="accent"
                    onClick={() => {
                      void window.promptBar
                        .updateSettings({ hotkey: hotkeyDraft.trim() || "Control+Q" })
                        .then((nextSettings) => {
                          setSettings(nextSettings);
                          setHotkeyDraft(nextSettings.hotkey);
                          setMessage(
                            nextSettings.registered
                              ? t(`Shortcut updated to ${nextSettings.activeHotkey}.`, `快捷键已更新为 ${nextSettings.activeHotkey}。`)
                              : t("Shortcut registration failed. The previous shortcut is still active.", "快捷键注册失败，仍保留之前的有效快捷键。")
                          );
                          setError(null);
                        })
                        .catch((nextError: unknown) => {
                          setError(
                            nextError instanceof Error
                              ? nextError.message
                              : t("Failed to update the shortcut.", "更新快捷键失败。")
                          );
                        });
                    }}
                  >
                    {t("Save Shortcut", "保存快捷键")}
                  </ActionButton>
                  <ActionButton
                    tone="muted"
                    onClick={() => {
                      setHotkeyDraft("Control+Q");
                    }}
                  >
                    {t("Reset Draft", "重置草稿")}
                  </ActionButton>
                </div>
              </section>
            ),
            accessibility: (
              <section style={sectionCardStyle}>
                <SectionLabel>{t("Accessibility Permission", "辅助功能权限")}</SectionLabel>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "#cbd5e1" }}>
                  {t("Status", "状态")}:
                  {" "}
                  <strong style={{ color: permissions?.accessible ? "#86efac" : "#fda4af" }}>
                    {permissions?.accessible ? t("Granted", "已授予") : t("Not granted", "未授予")}
                  </strong>
                </div>
                <div style={{ marginTop: 8, fontSize: 13, color: "#94a3b8" }}>
                  {t(messages.autoPastePermissionHelp)}
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <ActionButton
                    tone="blue"
                    onClick={() => {
                      void window.promptBar
                        .requestAccessibilityAccess()
                        .then((nextPermissions) => {
                          setPermissions(nextPermissions);
                          setMessage(
                            nextPermissions.accessible
                              ? t("Accessibility access is available.", "辅助功能权限已可用。")
                              : t("System prompt opened. If access is still off, enable PromptBar in System Settings.", "系统授权提示已打开。如果仍未生效，请在系统设置中启用 PromptBar。")
                          );
                        })
                        .catch((nextError: unknown) => {
                          setError(
                            nextError instanceof Error
                              ? nextError.message
                              : t("Failed to request accessibility access.", "请求辅助功能权限失败。")
                          );
                        });
                    }}
                  >
                    {t("Request Access", "请求权限")}
                  </ActionButton>
                  <ActionButton
                    tone="muted"
                    onClick={() => {
                      void refreshPermissions();
                    }}
                  >
                    {t("Refresh Status", "刷新状态")}
                  </ActionButton>
                </div>
              </section>
            ),
            launchAtLogin: (
              <section style={sectionCardStyle}>
                <SectionLabel>{t("Launch at Login", "登录时启动")}</SectionLabel>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 14,
                    color: "#cbd5e1"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(settings?.launchAtLogin)}
                    onChange={(event) => {
                      void window.promptBar
                        .updateSettings({ launchAtLogin: event.target.checked })
                        .then((nextSettings) => {
                          setSettings(nextSettings);
                          setMessage(
                            nextSettings.launchAtLogin
                              ? t(messages.launchAtLoginEnabled)
                              : t("PromptBar will no longer launch at login.", "PromptBar 将不再在登录时自动启动。")
                          );
                          setError(null);
                        })
                        .catch((nextError: unknown) => {
                          setError(
                            nextError instanceof Error
                              ? nextError.message
                              : t(messages.launchAtLoginUpdateFailed)
                          );
                        });
                    }}
                  />
                  <span>{t("Open PromptBar automatically after signing in", "登录后自动打开 PromptBar")}</span>
                </label>
              </section>
            ),
            language: (
              <section style={sectionCardStyle}>
                <SectionLabel>{t("Language", "语言")}</SectionLabel>
                <label style={fieldLabelStyle}>
                  <span>{t("Interface language", "界面语言")}</span>
                  <select
                    style={fieldStyle}
                    value={settings?.locale ?? props.locale}
                    onChange={(event) => {
                      const nextLocale = event.target.value as Locale;

                      void window.promptBar
                        .updateSettings({ locale: nextLocale })
                        .then((nextSettings) => {
                          setSettings(nextSettings);
                          props.setLocale(nextLocale);
                          setMessage(
                            nextLocale === "zh-CN"
                              ? "界面语言已切换为中文。"
                              : t(messages.interfaceLanguageSwitchedToEnglish)
                          );
                          setError(null);
                        })
                        .catch((nextError: unknown) => {
                          setError(
                            nextError instanceof Error
                              ? nextError.message
                              : t("Failed to update language.", "更新语言失败。")
                          );
                        });
                    }}
                  >
                    <option value="en">English</option>
                    <option value="zh-CN">中文</option>
                  </select>
                </label>
              </section>
            ),
            promptsDirectory: (
              <section style={sectionCardStyle}>
                <SectionLabel>{t("Prompts Directory", "Prompts 目录")}</SectionLabel>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "#cbd5e1" }}>
                  {t("Current directory", "当前目录")}:
                  {" "}
                  <span style={{ fontFamily: '"SF Mono", "Menlo", monospace', fontSize: 12, color: "#94a3b8" }}>
                    {settings?.customPromptsDirectory || t("(Default)", "（默认）")}
                  </span>
                </div>
                <div style={{ marginTop: 8, fontSize: 13, color: "#94a3b8" }}>
                  {t(
                    "Choose a custom folder to load prompts from (e.g., a Git repo or iCloud Drive folder). Leave empty to use the default location.",
                    "选择自定义文件夹来加载 Prompts（例如 Git 仓库或 iCloud Drive 文件夹）。留空则使用默认位置。"
                  )}
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <ActionButton
                    tone="blue"
                    onClick={() => {
                      void window.promptBar
                        .selectPromptsDirectory()
                        .then((result) => {
                          if (!result.selected) {
                            return;
                          }

                          return window.promptBar
                            .updateSettings({ customPromptsDirectory: result.directory })
                            .then((nextSettings) => {
                              setSettings(nextSettings);
                              setMessage(t(`Prompts directory set to ${result.directory}`, `Prompts 目录已设为 ${result.directory}`));
                              setError(null);
                            });
                        })
                        .catch((nextError: unknown) => {
                          setError(
                            nextError instanceof Error
                              ? nextError.message
                              : t("Failed to select directory.", "选择目录失败。")
                          );
                        });
                    }}
                  >
                    {t("Choose Folder", "选择文件夹")}
                  </ActionButton>
                  <ActionButton
                    tone="muted"
                    onClick={() => {
                      void window.promptBar
                        .updateSettings({ customPromptsDirectory: "" })
                        .then((nextSettings) => {
                          setSettings(nextSettings);
                          setMessage(t("Prompts directory reset to default.", "Prompts 目录已重置为默认。"));
                          setError(null);
                        })
                        .catch((nextError: unknown) => {
                          setError(
                            nextError instanceof Error
                              ? nextError.message
                              : t("Failed to reset directory.", "重置目录失败。")
                          );
                        });
                    }}
                  >
                    {t("Reset to Default", "重置为默认")}
                  </ActionButton>
                </div>
              </section>
            ),
            workspace: (
              <section style={sectionCardStyle}>
                <SectionLabel>{t("Workspace Actions", "工作区操作")}</SectionLabel>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <ActionButton
                    tone="blue"
                    onClick={() => {
                      void window.promptBar.openManager();
                    }}
                  >
                    {t("Open Manager", "打开管理器")}
                  </ActionButton>
                  <ActionButton
                    tone="muted"
                    onClick={() => {
                      void window.promptBar.openPromptsFolder();
                    }}
                  >
                    {t("Open Prompts Folder", "打开 Prompts 文件夹")}
                  </ActionButton>
                </div>
              </section>
            )
          }}
        />
        <div style={{ marginTop: 16 }}>
          {message ? <SuccessText>{message}</SuccessText> : null}
        </div>
      </section>
    </main>
  );
}

function UsageStatsBar(props: { packs: PromptPack[]; locale: Locale }) {
  const t = createTranslator(props.locale);
  const [expanded, setExpanded] = useState(false);

  const allItems = props.packs.flatMap((pack) => pack.items);
  const usedItems = allItems
    .filter((item) => (item.useCount ?? 0) > 0)
    .sort((a, b) => (b.useCount ?? 0) - (a.useCount ?? 0));

  const totalUses = usedItems.reduce((sum, item) => sum + (item.useCount ?? 0), 0);
  const topItems = usedItems.slice(0, 10);

  if (totalUses === 0) {
    return null;
  }

  return (
    <section style={{ ...sectionCardStyle, marginBottom: 16, padding: "10px 14px" }}>
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{ fontSize: 13, color: "#94a3b8" }}>
          {t(
            `${totalUses} total uses across ${usedItems.length} prompts`,
            `共 ${totalUses} 次使用，涉及 ${usedItems.length} 个提示词`
          )}
        </span>
        <span style={{ fontSize: 12, color: "#64748b" }}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>
      {expanded ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>
            {t("Most Used", "最常用")}
          </div>
          {topItems.map((item) => {
            const barWidth = Math.round(((item.useCount ?? 0) / (topItems[0]?.useCount ?? 1)) * 100);

            return (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ flex: "0 0 140px", fontSize: 12, color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.title}
                </span>
                <div style={{ flex: 1, height: 6, backgroundColor: "#1e293b", borderRadius: 3 }}>
                  <div style={{ width: `${barWidth}%`, height: "100%", backgroundColor: "#3b82f6", borderRadius: 3 }} />
                </div>
                <span style={{ flex: "0 0 32px", fontSize: 11, color: "#64748b", textAlign: "right" }}>
                  {item.useCount}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function ManagerView(props: { locale: Locale }) {
  const t = createTranslator(props.locale);
  const [packs, setPacks] = useState<PromptPack[]>([]);
  const [selectedSourceFile, setSelectedSourceFile] = useState<string | null>(null);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [packOrder, setPackOrder] = useState<string[]>([]);
  const [promptOrder, setPromptOrder] = useState<string[]>([]);
  const [draggedPackId, setDraggedPackId] = useState<string | null>(null);
  const [dragOverPackId, setDragOverPackId] = useState<string | null>(null);
  const [dragOverPackPlacement, setDragOverPackPlacement] = useState<"before" | "after">("before");
  const [draggedPromptId, setDraggedPromptId] = useState<string | null>(null);
  const [dragOverPromptId, setDragOverPromptId] = useState<string | null>(null);
  const [dragOverPromptPlacement, setDragOverPromptPlacement] = useState<"before" | "after">("before");
  const [dragOverFileSourceFile, setDragOverFileSourceFile] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState("提示词集合");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [suppressManagerClickUntil, setSuppressManagerClickUntil] = useState(0);
  const [hoveredPackId, setHoveredPackId] = useState<string | null>(null);
  const [hoveredPromptId, setHoveredPromptId] = useState<string | null>(null);
  const [managerHoverEnabled, setManagerHoverEnabled] = useState(false);
  const [dirtySourceFiles, setDirtySourceFiles] = useState<Set<string>>(new Set());
  const [customPromptsDirectory, setCustomPromptsDirectory] = useState("");

  const refreshLibrary = async () => {
    setLoading(true);

    try {
      const [library, settings] = await Promise.all([
        window.promptBar.listPrompts(),
        window.promptBar.getSettings()
      ]);
      setPackOrder(settings.packOrder);
      setPromptOrder(settings.promptOrder);
      setCustomPromptsDirectory(settings.customPromptsDirectory);
      setPacks(sortPacksForDisplay(library.packs, settings.packOrder, settings.promptOrder));
      setDirtySourceFiles(new Set());
      setError(null);

      if (!selectedSourceFile && library.packs[0]) {
        setSelectedSourceFile(
          sortPacksForDisplay(library.packs, settings.packOrder, settings.promptOrder)[0]?.sourceFile ?? null
        );
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t("Failed to load prompt files.", "加载提示词文件失败。"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshLibrary();
  }, []);

  useEffect(() => {
    const resetManagerHover = () => {
      setManagerHoverEnabled((current) => getNextPointerHoverEnabled(current, "popup-opened"));
      setHoveredPackId(null);
      setHoveredPromptId(null);
    };

    resetManagerHover();
    window.addEventListener("focus", resetManagerHover);

    return () => {
      window.removeEventListener("focus", resetManagerHover);
    };
  }, []);

  const files = useMemo(() => {
    const uniqueFiles = new Map<string, PromptPack[]>();

    for (const pack of packs) {
      const filePacks = uniqueFiles.get(pack.sourceFile) ?? [];
      filePacks.push(pack);
      uniqueFiles.set(pack.sourceFile, filePacks);
    }

    return [...uniqueFiles.entries()].map(([sourceFile, filePacks]) => ({
      sourceFile,
      packs: filePacks,
      metadata: filePacks[0]?.metadata ?? createDefaultMetadata()
    }));
  }, [packs]);

  useEffect(() => {
    if (!selectedSourceFile && files[0]) {
      setSelectedSourceFile(files[0].sourceFile);
    }
  }, [files, selectedSourceFile]);

  const currentFile = files.find((file) => file.sourceFile === selectedSourceFile) ?? null;
  const currentFilePacks = currentFile?.packs ?? [];
  const dirtyFileCount = dirtySourceFiles.size;
  const displayPacks = draggedPromptId || draggedPackId ? packs : currentFilePacks;
  const currentPack =
    currentFilePacks.find((pack) => pack.id === selectedPackId) ?? currentFilePacks[0] ?? null;
  const currentPrompt =
    currentPack?.items.find((item) => item.id === selectedPromptId) ?? currentPack?.items[0] ?? null;

  useEffect(() => {
    if (currentPack && currentPack.id !== selectedPackId) {
      setSelectedPackId(currentPack.id);
    }
  }, [currentPack, selectedPackId]);

  useEffect(() => {
    if (currentPrompt && currentPrompt.id !== selectedPromptId) {
      setSelectedPromptId(currentPrompt.id);
    }
  }, [currentPrompt, selectedPromptId]);

  const updatePacksForFile = (
    sourceFile: string,
    updater: (filePacks: PromptPack[]) => PromptPack[],
    nextOrder = packOrder,
    nextPromptOrder = promptOrder
  ) => {
    setPacks((current) => {
      const before = current.filter((pack) => pack.sourceFile !== sourceFile);
      const filePacks = current.filter((pack) => pack.sourceFile === sourceFile);
      return sortPacksForDisplay([...before, ...updater(filePacks)], nextOrder, nextPromptOrder);
    });
  };

  const markDirtyFiles = (...sourceFiles: string[]) => {
    setDirtySourceFiles((current) => addDirtyPromptFiles(current, ...sourceFiles));
  };

  const clearDirtyFiles = (...sourceFiles: string[]) => {
    setDirtySourceFiles((current) => removeDirtyPromptFiles(current, ...sourceFiles));
  };

  const persistPackOrder = async (nextOrder: string[]) => {
    setPackOrder(nextOrder);

    try {
      const nextSettings = await window.promptBar.updateSettings({ packOrder: nextOrder });
      setPackOrder(nextSettings.packOrder);
      setError(null);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : t("Failed to save pack order.", "保存分组顺序失败。")
      );
    }
  };

  const persistPromptOrder = async (nextOrder: string[]) => {
    setPromptOrder(nextOrder);

    try {
      const nextSettings = await window.promptBar.updateSettings({ promptOrder: nextOrder });
      setPromptOrder(nextSettings.promptOrder);
      setError(null);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : t("Failed to save prompt order.", "保存提示词顺序失败。")
      );
    }
  };

  const saveCurrentFile = async () => {
    const savePlan = buildPromptFileSavePlan(packs, dirtySourceFiles);

    if (savePlan.length === 0) {
      setError(t("There are no unsaved prompt file changes.", "当前没有未保存的提示词文件变更。"));
      return;
    }

    try {
      for (const payload of savePlan) {
        await window.promptBar.savePromptFile(payload);
      }

      clearDirtyFiles(...savePlan.map((payload) => payload.sourceFile));
      setMessage(
        savePlan.length === 1
          ? t("Prompt file saved.", "提示词文件已保存。")
          : t("All prompt file changes saved.", "所有提示词文件变更已保存。")
      );
      setError(null);
      await refreshLibrary();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t("Failed to save prompt file.", "保存提示词文件失败。"));
    }
  };

  const addPack = () => {
    if (!currentFile) {
      setError(t("Select or create a file first.", "请先选择或创建一个文件。"));
      return;
    }

    const nextPack = createPack(currentFile.sourceFile, `新分组 ${currentFilePacks.length + 1}`);
    const nextFilePacks = [
      ...currentFilePacks,
      {
        ...nextPack,
        metadata: currentFilePacks[0]?.metadata ?? createDefaultMetadata()
      }
    ];

    const nextOrder = buildPackOrderFromReplacement(packs, currentFile.sourceFile, nextFilePacks);
    updatePacksForFile(currentFile.sourceFile, () => nextFilePacks, nextOrder);
    markDirtyFiles(currentFile.sourceFile);
    setSelectedPackId(nextPack.id);
    setSelectedPromptId(null);
    void persistPackOrder(nextOrder);
  };

  const addPrompt = () => {
    let targetPack = currentPack;

    if (!currentFile) {
      setError(t("Select a file before adding a prompt.", "请先选择一个文件，再添加提示词。"));
      return;
    }

    if (!targetPack) {
      const filePacks = packs.filter((p) => p.sourceFile === currentFile.sourceFile);

      if (filePacks.length > 0) {
        targetPack = filePacks[0];
        setSelectedPackId(targetPack.id);
      } else {
        setError(t("No pack found in this file.", "此文件中没有分组。"));
        return;
      }
    }

    const nextPrompt = createPrompt(targetPack);
    const nextPackItems = [...targetPack.items, nextPrompt];
    const nextPromptOrder = buildPromptOrderFromReplacement(
      packs.flatMap((pack) => pack.items),
      targetPack.id,
      nextPackItems
    );

    updatePacksForFile(currentFile.sourceFile, (filePacks) =>
      filePacks.map((pack) =>
        pack.id === targetPack.id
          ? {
              ...pack,
              items: nextPackItems
            }
          : pack
      ),
      packOrder,
      nextPromptOrder
    );
    markDirtyFiles(currentFile.sourceFile);
    void persistPromptOrder(nextPromptOrder);
    setSelectedPromptId(nextPrompt.id);
  };

  const deletePrompt = () => {
    if (!currentFile || !currentPack || !currentPrompt) {
      return;
    }

    const nextPackItems = currentPack.items.filter((item) => item.id !== currentPrompt.id);
    const nextPromptOrder = buildPromptOrderFromReplacement(
      packs.flatMap((pack) => pack.items),
      currentPack.id,
      nextPackItems
    );

    updatePacksForFile(currentFile.sourceFile, (filePacks) =>
      filePacks
        .map((pack) =>
          pack.id === currentPack.id
            ? {
              ...pack,
                items: nextPackItems
              }
            : pack
        )
        .filter((pack) => pack.items.length > 0),
      packOrder,
      nextPromptOrder
    );
    markDirtyFiles(currentFile.sourceFile);
    void persistPromptOrder(nextPromptOrder);
    setSelectedPromptId(null);
  };

  const deletePack = () => {
    if (!currentFile || !currentPack) {
      return;
    }

    const nextFilePacks = currentFilePacks.filter((pack) => pack.id !== currentPack.id);

    const nextOrder = buildPackOrderFromReplacement(packs, currentFile.sourceFile, nextFilePacks);
    updatePacksForFile(currentFile.sourceFile, () => nextFilePacks, nextOrder);
    markDirtyFiles(currentFile.sourceFile);
    void persistPackOrder(nextOrder);
    setSelectedPackId(null);
    setSelectedPromptId(null);
  };

  const updateCurrentFileMetadata = (partial: Partial<PromptFileMetadata>) => {
    if (!currentFile) {
      return;
    }

    updatePacksForFile(currentFile.sourceFile, (filePacks) =>
      filePacks.map((pack) => ({
        ...pack,
        metadata: {
          ...pack.metadata,
          ...partial
        }
      }))
    );
    markDirtyFiles(currentFile.sourceFile);
  };

  const updatePackName = (name: string) => {
    if (!currentFile || !currentPack) {
      return;
    }

    const nextFilePacks = currentFilePacks.map((pack) =>
        pack.id === currentPack.id
          ? {
              ...pack,
              name
            }
          : pack
      );

    const nextOrder = buildPackOrderFromReplacement(packs, currentFile.sourceFile, nextFilePacks);
    updatePacksForFile(currentFile.sourceFile, () => nextFilePacks, nextOrder);
    markDirtyFiles(currentFile.sourceFile);
    void persistPackOrder(nextOrder);
  };

  const updatePrompt = (partial: Partial<PromptItem>) => {
    if (!currentFile || !currentPack || !currentPrompt) {
      return;
    }

    updatePacksForFile(currentFile.sourceFile, (filePacks) =>
      filePacks.map((pack) =>
        pack.id === currentPack.id
          ? {
              ...pack,
              items: pack.items.map((item) =>
                item.id === currentPrompt.id
                  ? {
                      ...item,
                      ...partial
                    }
                  : item
              )
            }
          : pack
      )
    );
    markDirtyFiles(currentFile.sourceFile);
  };

  const createNewFile = () => {
    const baseDirectory = resolveManagerDraftBaseDirectory(
      files.map((file) => file.sourceFile),
      customPromptsDirectory
    );

    if (!baseDirectory) {
      setError(t("A base prompts directory is not available yet.", "当前还没有可用的 prompts 基础目录。"));
      return;
    }

    const nextSourceFile = buildDraftPromptFilePath(
      baseDirectory,
      newFileName || "untitled",
      files.map((file) => file.sourceFile)
    );
    const nextPack = createPack(nextSourceFile, "新分组");

    const nextPackWithMetadata = {
      ...nextPack,
      metadata: createDefaultMetadata()
    };

    const nextOrder = buildPackOrderFromReplacement(packs, nextSourceFile, [
      nextPackWithMetadata
    ]);

    setPacks((current) =>
      sortPromptPacks(
        [
          ...current,
          nextPackWithMetadata
        ],
        nextOrder
      )
    );
    markDirtyFiles(nextSourceFile);
    void persistPackOrder(nextOrder);
    setSelectedSourceFile(nextSourceFile);
    setSelectedPackId(nextPack.id);
    setSelectedPromptId(null);
      setMessage(t(`Created draft file ${nextSourceFile}. Save to write it to disk.`, `已创建草稿文件 ${nextSourceFile}，保存后会写入磁盘。`));
  };

  const moveCurrentPack = (
    targetPackId: string,
    placement: "before" | "after" = "before"
  ) => {
    if (!draggedPackId || draggedPackId === targetPackId) {
      return;
    }

    const fromIndex = packs.findIndex((pack) => pack.id === draggedPackId);
    const toIndex = packs.findIndex((pack) => pack.id === targetPackId);
    const draggedPack = packs.find((pack) => pack.id === draggedPackId) ?? null;
    const targetPack = packs.find((pack) => pack.id === targetPackId) ?? null;

    if (fromIndex === -1 || toIndex === -1 || !draggedPack || !targetPack) {
      return;
    }

    if (
      draggedPack.sourceFile !== targetPack.sourceFile &&
      !supportsCrossFilePackMigration(draggedPack.sourceFile, targetPack.sourceFile)
    ) {
      setError(
        t(
          "Cross-file pack moves are only supported between Markdown prompt files.",
          "分组跨文件迁移目前只支持在 Markdown 提示词文件之间进行。"
        )
      );
      return;
    }

    const nextGlobalPacks =
      draggedPack.sourceFile === targetPack.sourceFile
        ? reorderPacks(
            packs,
            fromIndex,
            Math.max(
              0,
              Math.min(
                packs.length - 1,
                placement === "before"
                  ? fromIndex < toIndex
                    ? toIndex - 1
                    : toIndex
                  : fromIndex < toIndex
                    ? toIndex
                    : toIndex + 1
              )
            )
          )
        : movePackBetweenFiles(packs, draggedPackId, targetPackId, placement);
    const nextOrder = nextGlobalPacks.map((pack) => getPromptPackOrderKey(pack));

    setPacks(sortPacksForDisplay(nextGlobalPacks, nextOrder, promptOrder));
    markDirtyFiles(draggedPack.sourceFile, targetPack.sourceFile);
    void persistPackOrder(nextOrder);
    const movedPack = nextGlobalPacks.find((pack) => pack.id === draggedPackId) ?? null;
    setSuppressManagerClickUntil(Date.now() + 180);
    setSelectedSourceFile(movedPack?.sourceFile ?? null);
    setSelectedPackId(movedPack?.id ?? null);
    setSelectedPromptId(movedPack?.items[0]?.id ?? null);
    setDragOverPackId(null);
    setDragOverPackPlacement("before");
    setDragOverFileSourceFile(null);
  };

  const moveCurrentPrompt = (
    targetPackId: string,
    targetPromptId?: string,
    placement: "before" | "after" = "before"
  ) => {
    if (!draggedPromptId) {
      return;
    }

    const sourcePack = packs.find((pack) =>
      pack.items.some((item) => item.id === draggedPromptId)
    );
    const targetPack = packs.find((pack) => pack.id === targetPackId);

    const nextGlobalPacks = movePromptBetweenPacks(
      packs,
      draggedPromptId,
      targetPackId,
      targetPromptId,
      placement
    );

    const didChange = nextGlobalPacks.some((pack, index) => pack.items !== packs[index]?.items);

    if (!didChange) {
      return;
    }

    const nextPromptOrder = buildPromptOrderFromPacks(nextGlobalPacks);
    setPacks(sortPacksForDisplay(nextGlobalPacks, packOrder, nextPromptOrder));
    if (sourcePack && targetPack) {
      markDirtyFiles(sourcePack.sourceFile, targetPack.sourceFile);
    }
    void persistPromptOrder(nextPromptOrder);
    const nextTargetPack = nextGlobalPacks.find((pack) => pack.id === targetPackId) ?? null;
    setSuppressManagerClickUntil(Date.now() + 180);
    setSelectedSourceFile(nextTargetPack?.sourceFile ?? null);
    setSelectedPackId(nextTargetPack?.id ?? null);
    setSelectedPromptId(draggedPromptId);
    setDragOverPromptId(null);
    setDragOverPromptPlacement("before");
    setDragOverPackId(null);
    setDragOverPackPlacement("before");
  };

  const moveCurrentPromptToFile = (targetSourceFile: string) => {
    if (!draggedPromptId) {
      return;
    }

    const sourcePack = packs.find((pack) =>
      pack.items.some((item) => item.id === draggedPromptId)
    );
    const targetFile = files.find((file) => file.sourceFile === targetSourceFile) ?? null;
    const targetPack = targetFile?.packs[0] ?? null;

    if (!sourcePack || !targetFile || !targetPack) {
      setError(t("The target file does not have a pack that can receive prompts yet.", "目标文件还没有可接收提示词的分组。"));
      return;
    }

    if (sourcePack.sourceFile === targetSourceFile) {
      setDragOverFileSourceFile(null);
      return;
    }

    const nextGlobalPacks = movePromptBetweenPacks(
      packs,
      draggedPromptId,
      targetPack.id
    );
    const didChange = nextGlobalPacks.some((pack, index) => pack.items !== packs[index]?.items);

    if (!didChange) {
      return;
    }

    const nextPromptOrder = buildPromptOrderFromPacks(nextGlobalPacks);
    setPacks(sortPacksForDisplay(nextGlobalPacks, packOrder, nextPromptOrder));
    markDirtyFiles(sourcePack.sourceFile, targetSourceFile);
    void persistPromptOrder(nextPromptOrder);
    setSuppressManagerClickUntil(Date.now() + 180);
    setSelectedSourceFile(targetSourceFile);
    setSelectedPackId(targetPack.id);
    setSelectedPromptId(draggedPromptId);
    setDragOverFileSourceFile(null);
    setDragOverPackId(null);
    setDragOverPackPlacement("before");
    setDragOverPromptId(null);
    setDragOverPromptPlacement("before");
  };

  return (
    <main style={shellStyle}>
      <section
        style={{ ...panelStyle, maxWidth: 1280 }}
        onMouseMove={() => {
          setManagerHoverEnabled((current) => {
            if (current) {
              return current;
            }

            return getNextPointerHoverEnabled(current, "pointer-moved");
          });
        }}
      >
        <Header title={t("Prompt Manager", "提示词管理器")} subtitle="PROMPTBAR" rightLabel={t("GUI Editor", "图形编辑器")} />

        <UsageStatsBar packs={packs} locale={props.locale} />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <ActionButton
            tone="accent"
            onClick={() => {
              void saveCurrentFile();
            }}
          >
            {dirtyFileCount > 0
              ? t(`Save All Changes (${dirtyFileCount})`, `保存所有变更（${dirtyFileCount}）`)
              : t("Save All Changes", "保存所有变更")}
          </ActionButton>
          <ActionButton
            tone="blue"
            onClick={() => {
              if (
                shouldConfirmReloadMarkdown(dirtySourceFiles) &&
                !window.confirm(
                  buildReloadConfirmationMessage(dirtySourceFiles, t)
                )
              ) {
                return;
              }

              void refreshLibrary();
            }}
          >
            {t("重新加载 Markdown", "重新加载 Markdown")}
          </ActionButton>
          <ActionButton
            tone="muted"
            onClick={() => {
              void window.promptBar.openPromptsFolder();
            }}
          >
            {t("Open Prompts Folder", "打开 Prompts 文件夹")}
          </ActionButton>
          <ActionButton
            tone="muted"
            onClick={() => {
              if (currentFile) {
                void window.promptBar.openPromptSource(currentFile.sourceFile);
              }
            }}
            disabled={!currentFile}
          >
            {t("Edit Source File", "编辑源文件")}
          </ActionButton>
          <ActionButton
            tone="muted"
            onClick={() => {
              void window.promptBar.openSettings();
            }}
          >
            {t("Open Settings", "打开设置")}
          </ActionButton>
        </div>

        {loading ? <MessageCard tone="muted">{t("Loading prompt files...", "正在加载提示词文件...")}</MessageCard> : null}
        {error ? <MessageCard tone="danger">{error}</MessageCard> : null}
        {message ? <SuccessText>{message}</SuccessText> : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "260px 320px 1fr",
            gap: 16,
            alignItems: "start"
          }}
        >
          <section style={sectionCardStyle}>
            <SectionLabel>{t("Files", "文件")}</SectionLabel>
            <div style={{ display: "grid", gap: 10 }}>
              {files.map((file) => (
                <button
                  key={file.sourceFile}
                  type="button"
                  onDragOver={(event) => {
                    if (!draggedPromptId) {
                      return;
                    }

                    event.preventDefault();
                    setDragOverFileSourceFile(file.sourceFile);
                  }}
                  onDragLeave={(event) => {
                    if (!draggedPromptId) {
                      return;
                    }

                    const relatedTarget = event.relatedTarget as Node | null;

                    if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
                      return;
                    }

                    setDragOverFileSourceFile((current) =>
                      current === file.sourceFile ? null : current
                    );
                  }}
                  onDrop={(event) => {
                    if (!draggedPromptId) {
                      return;
                    }

                    event.preventDefault();
                    moveCurrentPromptToFile(file.sourceFile);
                  }}
                  onClick={() => {
                    if (shouldSuppressDragClick(suppressManagerClickUntil)) {
                      return;
                    }

                    setSelectedSourceFile(file.sourceFile);
                    setSelectedPackId(file.packs[0]?.id ?? null);
                    setSelectedPromptId(file.packs[0]?.items[0]?.id ?? null);
                  }}
                  style={{
                    ...listButtonStyle,
                    transition: dragFeedbackTransition,
                    background:
                      file.sourceFile === selectedSourceFile
                        ? "rgba(59, 130, 246, 0.18)"
                        : dragOverFileSourceFile === file.sourceFile
                          ? "rgba(250, 204, 21, 0.16)"
                          : "rgba(30, 41, 59, 0.72)",
                    border:
                      dragOverFileSourceFile === file.sourceFile
                        ? "1px dashed rgba(250, 204, 21, 0.42)"
                        : undefined,
                    boxShadow:
                      dragOverFileSourceFile === file.sourceFile
                        ? "0 0 0 1px rgba(250, 204, 21, 0.12), 0 0 18px rgba(250, 204, 21, 0.14)"
                        : undefined
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{getBaseName(file.sourceFile)}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: "#94a3b8" }}>
                    {props.locale === "zh-CN" ? `${file.packs.length} 个分组` : `${file.packs.length} pack(s)`}
                  </div>
                  {draggedPromptId && dragOverFileSourceFile === file.sourceFile ? (
                    <div
                      style={{
                        marginTop: 8,
                        minHeight: 36,
                        borderRadius: 10,
                        border: "1px dashed rgba(250, 204, 21, 0.42)",
                        background:
                          "linear-gradient(135deg, rgba(250, 204, 21, 0.12), rgba(253, 224, 71, 0.08))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fde68a",
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: 0.2
                      }}
                    >
                      {t("Drop here to move into this file", "拖到这里移动到此文件")}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
              <label style={fieldLabelStyle}>
                <span>{t("New file name", "新文件名")}</span>
                <input
                  style={fieldStyle}
                  value={newFileName}
                  onChange={(event) => {
                    setNewFileName(event.target.value);
                  }}
                />
              </label>
              <ActionButton
                tone="blue"
                onClick={() => {
                  createNewFile();
                }}
              >
                {t("Create Draft File", "创建草稿文件")}
              </ActionButton>
            </div>
          </section>

          <section style={sectionCardStyle}>
            <SectionLabel>{t("Packs & Prompts", "分组与提示词")}</SectionLabel>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <ActionButton tone="blue" onClick={addPack} disabled={!currentFile}>
                {t("Add Pack", "添加分组")}
              </ActionButton>
              <ActionButton tone="blue" onClick={addPrompt} disabled={!currentFile}>
                {t("Add Prompt", "添加提示词")}
              </ActionButton>
              <ActionButton tone="muted" onClick={deletePrompt} disabled={!currentPrompt}>
                {t("Delete Prompt", "删除提示词")}
              </ActionButton>
              <ActionButton tone="muted" onClick={deletePack} disabled={!currentPack}>
                {t("Delete Pack", "删除分组")}
              </ActionButton>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {displayPacks.map((pack, index) => (
                <div key={pack.id}>
                  {draggedPromptId &&
                  (index === 0 || displayPacks[index - 1]?.sourceFile !== pack.sourceFile) ? (
                    <div
                      style={{
                        marginBottom: 8,
                        color: "#94a3b8",
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: 0.6,
                        textTransform: "uppercase"
                      }}
                    >
                      {getBaseName(pack.sourceFile)}
                    </div>
                  ) : null}
                  <div
                  style={{ position: "relative" }}
                  draggable={!draggedPromptId}
                  onDragStart={() => {
                    setDraggedPackId(pack.id);
                    setDragOverPackId(pack.id);
                  }}
                  onMouseEnter={() => {
                    if (!managerHoverEnabled) {
                      return;
                    }

                    setHoveredPackId(pack.id);
                  }}
                  onMouseLeave={() => {
                    setHoveredPackId((current) => (current === pack.id ? null : current));
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (draggedPromptId) {
                      setDragOverPackId(pack.id);
                      setDragOverPackPlacement("after");
                      return;
                    }

                    setDragOverPackId(pack.id);
                    const rect = event.currentTarget.getBoundingClientRect();
                    setDragOverPackPlacement(
                      getDropPlacement(rect.top, rect.height, event.clientY)
                    );
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggedPromptId) {
                      moveCurrentPrompt(pack.id);
                      return;
                    }

                    moveCurrentPack(pack.id, dragOverPackPlacement);
                  }}
                  onDragEnd={() => {
                    setSuppressManagerClickUntil(Date.now() + 180);
                    setDraggedPackId(null);
                    setDragOverPackId(null);
                    setDragOverPackPlacement("before");
                    setDraggedPromptId(null);
                    setDragOverPromptId(null);
                    setDragOverPromptPlacement("before");
                    setDragOverFileSourceFile(null);
                  }}
                >
                  {draggedPackId && dragOverPackId === pack.id ? (
                    <div
                      style={{
                        position: "absolute",
                        top: dragOverPackPlacement === "before" ? -6 : undefined,
                        bottom: dragOverPackPlacement === "after" ? -6 : undefined,
                        left: 8,
                        right: 8,
                        height: 3,
                        borderRadius: 999,
                        background: "linear-gradient(90deg, rgba(96, 165, 250, 0.95), rgba(191, 219, 254, 0.95))",
                        boxShadow: "0 0 0 1px rgba(96, 165, 250, 0.12), 0 0 18px rgba(96, 165, 250, 0.28)"
                      }}
                    />
                  ) : null}
                  <button
                    type="button"
                    style={{
                      ...listButtonStyle,
                      width: "100%",
                      transition: dragFeedbackTransition,
                      position: "relative",
                      paddingRight: 44,
                      cursor: draggedPromptId
                        ? "default"
                        : draggedPackId === pack.id
                          ? "grabbing"
                          : "grab",
                      opacity: draggedPackId === pack.id ? 0.48 : 1,
                      transform: draggedPackId === pack.id ? "scale(0.985)" : "scale(1)",
                      boxShadow:
                        draggedPackId === pack.id
                          ? "0 0 0 1px rgba(251, 191, 36, 0.28), 0 18px 36px rgba(15, 23, 42, 0.35)"
                          : "none",
                      border:
                        draggedPackId === pack.id
                          ? "1px dashed rgba(251, 191, 36, 0.45)"
                          : dragOverPackId === pack.id
                            ? "1px solid rgba(96, 165, 250, 0.35)"
                            : undefined,
                      background:
                        pack.id === currentPack?.id
                          ? "rgba(251, 191, 36, 0.18)"
                          : dragOverPackId === pack.id
                            ? "rgba(59, 130, 246, 0.16)"
                            : "rgba(30, 41, 59, 0.72)"
                    }}
                    onClick={() => {
                      if (shouldSuppressDragClick(suppressManagerClickUntil)) {
                        return;
                      }

                      setSelectedPackId(pack.id);
                      setSelectedPromptId(pack.items[0]?.id ?? null);
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{pack.name}</div>
                    <div
                      style={getManagerDragHandleStyle(
                        draggedPackId === pack.id || hoveredPackId === pack.id,
                        "pack"
                      )}
                    >
                      <div style={dragHandleGripStyle} />
                    </div>
                  </button>
                  <div style={{ display: "grid", gap: 8, marginTop: 8, paddingLeft: 10, position: "relative" }}>
                    {pack.items.map((item) => (
                      <div key={item.id} style={{ position: "relative" }}>
                        {draggedPromptId && dragOverPromptId === item.id ? (
                          <div
                            style={{
                              position: "absolute",
                              top: dragOverPromptPlacement === "before" ? -5 : undefined,
                              bottom: dragOverPromptPlacement === "after" ? -5 : undefined,
                              left: 8,
                              right: 8,
                              height: 3,
                              borderRadius: 999,
                              background: "linear-gradient(90deg, rgba(250, 204, 21, 0.95), rgba(253, 224, 71, 0.95))",
                              boxShadow: "0 0 0 1px rgba(250, 204, 21, 0.12), 0 0 16px rgba(250, 204, 21, 0.22)",
                              zIndex: 1
                            }}
                          />
                        ) : null}
                        <button
                          type="button"
                          draggable
                          style={{
                            ...listButtonStyle,
                            width: "100%",
                            transition: dragFeedbackTransition,
                            position: "relative",
                            paddingRight: 44,
                            cursor:
                              draggedPromptId === item.id ? "grabbing" : "grab",
                            opacity: draggedPromptId === item.id ? 0.52 : 1,
                            transform: draggedPromptId === item.id ? "scale(0.99)" : "scale(1)",
                            boxShadow:
                              draggedPromptId === item.id
                                ? "0 0 0 1px rgba(96, 165, 250, 0.28), 0 14px 28px rgba(15, 23, 42, 0.28)"
                                : "none",
                            border:
                              draggedPromptId === item.id
                                ? "1px dashed rgba(96, 165, 250, 0.38)"
                                : dragOverPromptId === item.id
                                  ? "1px solid rgba(191, 219, 254, 0.35)"
                                  : undefined,
                            background:
                              item.id === currentPrompt?.id
                                ? "rgba(59, 130, 246, 0.18)"
                                : dragOverPromptId === item.id
                                  ? "rgba(96, 165, 250, 0.18)"
                                  : "rgba(15, 23, 42, 0.55)"
                          }}
                          onDragStart={(event) => {
                            event.stopPropagation();
                            setDraggedPromptId(item.id);
                            setDragOverPromptId(item.id);
                          }}
                          onMouseEnter={() => {
                            if (!managerHoverEnabled) {
                              return;
                            }

                            setHoveredPromptId(item.id);
                          }}
                          onMouseLeave={() => {
                            setHoveredPromptId((current) =>
                              current === item.id ? null : current
                            );
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setDragOverPromptId(item.id);
                            const rect = event.currentTarget.getBoundingClientRect();
                            setDragOverPromptPlacement(
                              getDropPlacement(rect.top, rect.height, event.clientY)
                            );
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            moveCurrentPrompt(pack.id, item.id, dragOverPromptPlacement);
                          }}
                          onDragEnd={() => {
                            setSuppressManagerClickUntil(Date.now() + 180);
                            setDraggedPromptId(null);
                            setDragOverPromptId(null);
                            setDragOverPromptPlacement("before");
                            setDragOverPackId(null);
                            setDragOverPackPlacement("before");
                            setDragOverFileSourceFile(null);
                          }}
                          onClick={() => {
                            if (shouldSuppressDragClick(suppressManagerClickUntil)) {
                              return;
                            }

                            setSelectedPackId(pack.id);
                            setSelectedPromptId(item.id);
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>{item.title}</div>
                          <div
                            style={getManagerDragHandleStyle(
                              draggedPromptId === item.id || hoveredPromptId === item.id,
                              "prompt"
                            )}
                          >
                            <div style={dragHandleGripStyle} />
                          </div>
                          <div style={{ marginTop: 4, fontSize: 12, color: "#94a3b8" }}>
                            {item.description}
                          </div>
                        </button>
                      </div>
                    ))}
                    {draggedPromptId && dragOverPackId === pack.id && !dragOverPromptId ? (
                      <div
                        style={{
                          marginTop: 2,
                          marginLeft: 8,
                          marginRight: 8,
                          minHeight: 42,
                          borderRadius: 12,
                          border: "1px dashed rgba(250, 204, 21, 0.42)",
                          background:
                            "linear-gradient(135deg, rgba(250, 204, 21, 0.12), rgba(253, 224, 71, 0.08))",
                          boxShadow: "0 0 0 1px rgba(250, 204, 21, 0.08), 0 0 16px rgba(250, 204, 21, 0.16)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#fde68a",
                          fontSize: 12,
                          fontWeight: 700,
                          letterSpacing: 0.2
                        }}
                      >
                        {t("Drop here to append to the end", "拖到这里追加到末尾")}
                      </div>
                    ) : null}
                  </div>
                  </div>
                </div>
              ))}
              {draggedPackId ? (
                <div
                  style={{
                    minHeight: 52,
                    borderRadius: 14,
                    border: "1px dashed rgba(96, 165, 250, 0.42)",
                    background:
                      "linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(191, 219, 254, 0.08))",
                    boxShadow: "0 0 0 1px rgba(96, 165, 250, 0.08), 0 0 16px rgba(96, 165, 250, 0.16)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#bfdbfe",
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 0.2
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOverPackId(displayPacks[displayPacks.length - 1]?.id ?? null);
                    setDragOverPackPlacement("after");
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const lastPackId = displayPacks[displayPacks.length - 1]?.id;

                    if (lastPackId) {
                      moveCurrentPack(lastPackId, "after");
                    }
                  }}
                >
                  {t("Drop here to append the pack to the end", "拖到这里追加分组到末尾")}
                </div>
              ) : null}
            </div>
          </section>

          <section style={sectionCardStyle}>
            <SectionLabel>{t("Editor", "编辑器")}</SectionLabel>
            {currentFile ? (
              <div style={{ display: "grid", gap: 14 }}>
                <label style={fieldLabelStyle}>
                  <span>{t("File tags", "文件标签")}</span>
                  <input
                    style={fieldStyle}
                    value={currentFile.metadata.tags.join(", ")}
                    onChange={(event) => {
                      updateCurrentFileMetadata({
                        tags: splitCommaValues(event.target.value)
                      });
                    }}
                  />
                </label>
                <label style={fieldLabelStyle}>
                  <span>{t("File aliases", "文件别名")}</span>
                  <input
                    style={fieldStyle}
                    value={currentFile.metadata.aliases.join(", ")}
                    onChange={(event) => {
                      updateCurrentFileMetadata({
                        aliases: splitCommaValues(event.target.value)
                      });
                    }}
                  />
                </label>
                <label style={{ ...fieldLabelStyle, display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={currentFile.metadata.favorite}
                    onChange={(event) => {
                      updateCurrentFileMetadata({
                        favorite: event.target.checked
                      });
                    }}
                  />
                  <span>{t("Mark file as favorite", "将文件标记为收藏")}</span>
                </label>

                {currentPack ? (
                  <label style={fieldLabelStyle}>
                    <span>{t("Pack name", "分组名称")}</span>
                    <input
                      style={fieldStyle}
                      value={currentPack.name}
                      onChange={(event) => {
                        updatePackName(event.target.value);
                      }}
                    />
                  </label>
                ) : null}

                {currentPrompt ? (
                  <>
                    <label style={fieldLabelStyle}>
                      <span>{t("Prompt title", "提示词标题")}</span>
                      <input
                        style={fieldStyle}
                        value={currentPrompt.title}
                        onChange={(event) => {
                          updatePrompt({
                            title: event.target.value,
                            description: event.target.value
                          });
                        }}
                      />
                    </label>
                    <label style={fieldLabelStyle}>
                      <span>{t("Prompt body", "提示词正文")}</span>
                      <textarea
                        style={textareaStyle}
                        value={currentPrompt.body}
                        onChange={(event) => {
                          updatePrompt({
                            body: event.target.value,
                            description: event.target.value.split("\n").find(Boolean)?.trim() ?? ""
                          });
                        }}
                      />
                    </label>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>
                      {t("Variables", "变量")}：{" "}
                      {currentPrompt.variables.length > 0
                        ? currentPrompt.variables.map((variable) => variable.key).join(", ")
                        : t("None", "无")}
                    </div>
                  </>
                ) : (
                  <MessageCard tone="muted">{t("Select or create a prompt to edit it here.", "请选择或创建一个提示词以在此编辑。")}</MessageCard>
                )}
              </div>
            ) : (
              <MessageCard tone="muted">{t("Create or select a prompt file to begin editing.", "请创建或选择一个提示词文件后开始编辑。")}</MessageCard>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function Header(props: {
  title: string;
  subtitle: string;
  rightLabel: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 16
      }}
    >
      <div>
        <div style={{ fontSize: 12, letterSpacing: 1.4, color: "#fbbf24" }}>{props.subtitle}</div>
        <h1 style={{ margin: "6px 0 0", fontSize: 28 }}>{props.title}</h1>
      </div>
      <div
        style={{
          padding: "8px 10px",
          borderRadius: 999,
          fontSize: 12,
          background: "rgba(251, 191, 36, 0.14)",
          color: "#fde68a"
        }}
      >
        {props.rightLabel}
      </div>
    </div>
  );
}

function MessageCard(props: { tone: "muted" | "danger"; children: string }) {
  const palette =
    props.tone === "danger"
      ? {
          background: "rgba(127, 29, 29, 0.42)",
          border: "1px solid rgba(248, 113, 113, 0.2)",
          color: "#fecaca"
        }
      : {
          background: "rgba(30, 41, 59, 0.72)",
          border: "1px solid rgba(148, 163, 184, 0.1)",
          color: "#94a3b8"
        };

  return (
    <article
      style={{
        padding: "18px 16px",
        borderRadius: 16,
        lineHeight: 1.5,
        ...palette
      }}
    >
      {props.children}
    </article>
  );
}

function ActionButton(props: {
  tone: "accent" | "muted" | "blue";
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  const palette =
    props.tone === "accent"
      ? {
          background: "linear-gradient(135deg, #f59e0b, #fbbf24)",
          color: "#111827"
        }
      : props.tone === "blue"
        ? {
            background: "rgba(59, 130, 246, 0.14)",
            color: "#bfdbfe"
          }
        : {
            background: "rgba(148, 163, 184, 0.14)",
            color: "#e2e8f0"
          };

  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      style={{
        ...buttonStyle,
        ...palette,
        opacity: props.disabled ? 0.45 : 1,
        cursor: props.disabled ? "not-allowed" : "pointer"
      }}
    >
      {props.children}
    </button>
  );
}

function SectionLabel(props: { children: string }) {
  return (
    <div
      style={{
        fontSize: 12,
        letterSpacing: 1.2,
        color: "#94a3b8",
        textTransform: "uppercase",
        marginBottom: 10
      }}
    >
      {props.children}
    </div>
  );
}

function SuccessText(props: { children: string }) {
  return (
    <div style={{ marginTop: 12, color: "#86efac", fontSize: 12 }}>{props.children}</div>
  );
}

function ErrorText(props: { children: string }) {
  return (
    <div style={{ marginTop: 12, color: "#fca5a5", fontSize: 12 }}>{props.children}</div>
  );
}

function renderPromptTemplate(
  prompt: PromptItem | null,
  valuesByPrompt: Record<string, Record<string, string>>
) {
  if (!prompt) {
    return "Select a prompt to preview the final text.";
  }

  const values = valuesByPrompt[prompt.id] ?? {};

  return prompt.body.replace(/{{\s*([^}]+?)\s*}}/g, (_, expression: string) => {
    const [keyPart, optionsPart] = expression.split("|");
    const key = keyPart?.trim();

    if (!key) {
      return "";
    }

    const explicitValue = values[key]?.trim();

    if (explicitValue) {
      return explicitValue;
    }

    if (optionsPart) {
      return (
        optionsPart
          .split(",")
          .map((option) => option.trim())
          .find(Boolean) ?? ""
      );
    }

    return `[${key}]`;
  });
}

function splitCommaValues(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getBaseName(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

const sectionCardStyle: CSSProperties = {
  marginTop: 14,
  padding: "14px 16px",
  borderRadius: 16,
  background: "rgba(15, 23, 42, 0.5)",
  border: "1px solid rgba(148, 163, 184, 0.1)"
};

const previewStyle: CSSProperties = {
  marginTop: 8,
  fontSize: 14,
  lineHeight: 1.6,
  color: "#e2e8f0",
  minHeight: 68,
  whiteSpace: "pre-wrap"
};

const fieldLabelStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 13,
  color: "#cbd5e1"
};

const footerMetaStyle: CSSProperties = {
  marginTop: 12,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  fontSize: 12,
  color: "#94a3b8"
};

const listButtonStyle: CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.12)",
  borderRadius: 14,
  padding: "12px 12px",
  textAlign: "left",
  color: "#e2e8f0",
  cursor: "pointer"
};

const dragHandleGripStyle: CSSProperties = {
  width: 10,
  height: 14,
  borderRadius: 999,
  background:
    "radial-gradient(circle, rgba(255,255,255,0.72) 1px, transparent 1.6px) 0 0 / 4px 4px"
};

function getManagerDragHandleStyle(
  isActive: boolean,
  tone: "pack" | "prompt"
): CSSProperties {
  const palette =
    tone === "pack"
      ? {
          background: "rgba(96, 165, 250, 0.14)",
          border: "1px solid rgba(96, 165, 250, 0.3)",
          shadow: "0 0 0 1px rgba(96, 165, 250, 0.08), 0 8px 18px rgba(59, 130, 246, 0.12)"
        }
      : {
          background: "rgba(250, 204, 21, 0.12)",
          border: "1px solid rgba(250, 204, 21, 0.28)",
          shadow: "0 0 0 1px rgba(250, 204, 21, 0.08), 0 8px 18px rgba(250, 204, 21, 0.12)"
        };

  return {
    position: "absolute",
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: isActive ? 1 : 0.36,
    transform: isActive ? "scale(1)" : "scale(0.96)",
    transition: dragFeedbackTransition,
    pointerEvents: "none",
    background: palette.background,
    border: palette.border,
    boxShadow: isActive ? palette.shadow : "none"
  };
}
