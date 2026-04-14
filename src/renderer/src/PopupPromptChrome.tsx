import type { CSSProperties } from "react";
import type { PromptPack } from "../../shared/types";
import { getDropPlacement } from "../../shared/prompt-order.js";

const highFrequencyPackNames = new Set(["日常写作", "编程", "常用工具"]);
const quickEntryPackNames = new Set(["写作前快启", "修稿投稿快启", "投稿包与格式化"]);
const workflowPackNames = new Set(["00 通用底座", "01 写作前阶段", "02 修稿投稿阶段", "03 专项模块"]);
const secondaryPackNames = new Set(["论文引擎基础", "研究画像", "修稿步骤", "实用模块"]);
type PackTier = "high-frequency" | "quick-entry" | "workflow" | "secondary" | "other";

export function PopupPromptChrome(props: {
  query: string;
  isSearching: boolean;
  favoriteOnly: boolean;
  variableOnly: boolean;
  deliveryMode: "auto" | "clipboard";
  visiblePacks: PromptPack[];
  selectedPackId: string | null;
  canReorderPacks: boolean;
  draggedPackId: string | null;
  dragOverPackId: string | null;
  dragOverPackPlacement: "before" | "after";
  dragOverPackEnd: boolean;
  t: (english: string, chinese?: string) => string;
  onChangeQuery: (value: string) => void;
  onSelectPack: (packId: string) => void;
  onToggleFavoriteFilter: () => void;
  onToggleVariableFilter: () => void;
  onSetDeliveryMode: (mode: "auto" | "clipboard") => void;
  onDragPackStart: (packId: string) => void;
  onDragPackOver: (packId: string, placement: "before" | "after") => void;
  onDropPack: (packId: string, placement: "before" | "after") => void;
  onDragPackEndZoneOver: () => void;
  onDropPackToEnd: () => void;
  onDragPackEnd: () => void;
}) {
  const packsByTier: Record<PackTier, PromptPack[]> = {
    "high-frequency": [],
    "quick-entry": [],
    workflow: [],
    secondary: [],
    other: []
  };

  for (const pack of props.visiblePacks) {
    packsByTier[getPackTier(pack.name)].push(pack);
  }

  return (
    <>
      <input
        data-promptbar-search-field="true"
        style={inputStyle}
        placeholder={props.t("Search prompts, aliases, or packages...", "搜索提示词、别名或分类...")}
        autoFocus
        value={props.query}
        onChange={(event) => {
          props.onChangeQuery(event.target.value);
        }}
      />

      <div style={chipRowStyle}>
        <Chip label={props.t("Markdown", "Markdown")} />
        <Chip
          label={props.t("Favorites", "收藏")}
          active={props.favoriteOnly}
          interactive
          onClick={props.onToggleFavoriteFilter}
        />
        <Chip
          label={props.t("Variables", "变量")}
          active={props.variableOnly}
          interactive
          onClick={props.onToggleVariableFilter}
        />
        <Chip
          label={props.t("Auto insert", "自动写入")}
          active={props.deliveryMode === "auto"}
          interactive
          onClick={() => {
            props.onSetDeliveryMode("auto");
          }}
        />
        <Chip
          label={props.t("Copy only", "仅复制")}
          active={props.deliveryMode === "clipboard"}
          interactive
          onClick={() => {
            props.onSetDeliveryMode("clipboard");
          }}
        />
        <Chip
          label={props.t(
            props.isSearching ? "Search mode" : "Pack mode",
            props.isSearching ? "搜索模式" : "分组模式"
          )}
          active
        />
      </div>

      {!props.isSearching && props.visiblePacks.length > 0 ? (
        <section style={{ ...sectionCardStyle, marginTop: 0, marginBottom: 14 }}>
          <SectionLabel>{props.t("Packs", "分组")}</SectionLabel>
          <div style={packStackStyle}>
            {renderPackTierRow({
              packs: packsByTier["high-frequency"],
              tier: "high-frequency",
              props
            })}
            {renderPackTierRow({
              packs: packsByTier["quick-entry"],
              tier: "quick-entry",
              props
            })}
            {renderPackTierRow({
              packs: packsByTier.workflow,
              tier: "workflow",
              props
            })}
            {renderPackTierRow({
              packs: packsByTier.other,
              tier: "other",
              props
            })}
            {renderPackTierRow({
              packs: packsByTier.secondary,
              tier: "secondary",
              props
            })}
            {props.canReorderPacks && props.draggedPackId ? (
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  props.onDragPackEndZoneOver();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  props.onDropPackToEnd();
                }}
                style={{
                  minHeight: 42,
                  minWidth: 140,
                  padding: "0 12px",
                  borderRadius: 12,
                  border: "1px dashed rgba(250, 204, 21, 0.42)",
                  background: props.dragOverPackEnd
                    ? "linear-gradient(135deg, rgba(250, 204, 21, 0.18), rgba(253, 224, 71, 0.12))"
                    : "linear-gradient(135deg, rgba(250, 204, 21, 0.1), rgba(253, 224, 71, 0.06))",
                  boxShadow: props.dragOverPackEnd
                    ? "0 0 0 1px rgba(250, 204, 21, 0.12), 0 0 16px rgba(250, 204, 21, 0.16)"
                    : undefined,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fde68a",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 0.2
                }}
              >
                {props.t("Drop here to append to the end", "拖到这里追加到末尾")}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  );
}

function renderPackTierRow(input: {
  packs: PromptPack[];
  tier: PackTier;
  props: {
    selectedPackId: string | null;
    canReorderPacks: boolean;
    draggedPackId: string | null;
    dragOverPackId: string | null;
    dragOverPackPlacement: "before" | "after";
    onSelectPack: (packId: string) => void;
    onDragPackStart: (packId: string) => void;
    onDragPackOver: (packId: string, placement: "before" | "after") => void;
    onDropPack: (packId: string, placement: "before" | "after") => void;
    onDragPackEnd: () => void;
  };
}) {
  if (input.packs.length === 0) {
    return null;
  }

  return (
    <div style={packRowStyle}>
      {input.packs.map((pack) => renderPackButton(pack, input.props, input.tier))}
    </div>
  );
}

function renderPackButton(
  pack: PromptPack,
  props: {
    selectedPackId: string | null;
    canReorderPacks: boolean;
    draggedPackId: string | null;
    dragOverPackId: string | null;
    dragOverPackPlacement: "before" | "after";
    onSelectPack: (packId: string) => void;
    onDragPackStart: (packId: string) => void;
    onDragPackOver: (packId: string, placement: "before" | "after") => void;
    onDropPack: (packId: string, placement: "before" | "after") => void;
    onDragPackEnd: () => void;
  },
  tier: PackTier
) {
  const selected = pack.id === props.selectedPackId;
  const dragging = props.draggedPackId === pack.id;
  const dragOver = props.dragOverPackId === pack.id;
  const isSecondary = tier === "secondary";
  const isWorkflow = tier === "workflow";
  const isQuickEntry = tier === "quick-entry";
  const isOther = tier === "other";

  return (
    <div key={pack.id} style={{ position: "relative" }}>
      {props.canReorderPacks && dragOver ? (
        <div
          style={{
            position: "absolute",
            top: props.dragOverPackPlacement === "before" ? -5 : undefined,
            bottom: props.dragOverPackPlacement === "after" ? -5 : undefined,
            left: 4,
            right: 4,
            height: 3,
            borderRadius: 999,
            background:
              isSecondary
                ? "linear-gradient(90deg, rgba(148, 163, 184, 0.9), rgba(191, 219, 254, 0.9))"
                : isWorkflow
                  ? "linear-gradient(90deg, rgba(96, 165, 250, 0.95), rgba(191, 219, 254, 0.95))"
                : "linear-gradient(90deg, rgba(250, 204, 21, 0.95), rgba(253, 224, 71, 0.95))",
            boxShadow:
              isSecondary
                ? "0 0 0 1px rgba(148, 163, 184, 0.12), 0 0 12px rgba(148, 163, 184, 0.18)"
                : isWorkflow
                  ? "0 0 0 1px rgba(96, 165, 250, 0.14), 0 0 14px rgba(96, 165, 250, 0.2)"
                : "0 0 0 1px rgba(250, 204, 21, 0.12), 0 0 16px rgba(250, 204, 21, 0.22)"
          }}
        />
      ) : null}
      <button
        type="button"
        draggable={props.canReorderPacks}
        onDragStart={() => {
          if (!props.canReorderPacks) {
            return;
          }

          props.onDragPackStart(pack.id);
        }}
        onDragOver={(event) => {
          if (!props.canReorderPacks) {
            return;
          }

          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          props.onDragPackOver(
            pack.id,
            getDropPlacement(rect.top, rect.height, event.clientY)
          );
        }}
        onDrop={(event) => {
          if (!props.canReorderPacks) {
            return;
          }

          event.preventDefault();
          props.onDropPack(pack.id, props.dragOverPackPlacement);
        }}
        onDragEnd={() => {
          props.onDragPackEnd();
        }}
        onClick={() => {
          props.onSelectPack(pack.id);
        }}
        style={{
          ...buttonStyle,
          padding: isSecondary ? "7px 11px" : isWorkflow ? "8px 13px" : "8px 12px",
          opacity: dragging ? 0.55 : isSecondary ? 0.76 : 1,
          transform: dragging ? "scale(0.985)" : "scale(1)",
          background: selected
            ? isSecondary
              ? "linear-gradient(135deg, rgba(148, 163, 184, 0.2), rgba(96, 165, 250, 0.12))"
              : isWorkflow
                ? "linear-gradient(135deg, rgba(96, 165, 250, 0.24), rgba(191, 219, 254, 0.18))"
                : isQuickEntry
                  ? "linear-gradient(135deg, rgba(251, 191, 36, 0.24), rgba(125, 211, 252, 0.18))"
                  : "linear-gradient(135deg, rgba(251, 191, 36, 0.24), rgba(59, 130, 246, 0.18))"
            : dragOver
              ? isSecondary
                ? "rgba(148, 163, 184, 0.16)"
                : isWorkflow
                  ? "rgba(96, 165, 250, 0.16)"
                  : isQuickEntry
                    ? "rgba(251, 191, 36, 0.16)"
                    : "rgba(250, 204, 21, 0.14)"
              : isSecondary
                ? "rgba(15, 23, 42, 0.44)"
                : isWorkflow
                  ? "rgba(18, 40, 68, 0.82)"
                  : isQuickEntry
                    ? "rgba(54, 45, 22, 0.68)"
                    : isOther
                      ? "rgba(22, 34, 51, 0.66)"
                      : "rgba(30, 41, 59, 0.72)",
          color: selected
            ? isSecondary
              ? "#dbeafe"
              : isWorkflow
                ? "#dbeafe"
                : "#fde68a"
            : isSecondary
              ? "#7f8ea3"
              : isWorkflow
                ? "#dbeafe"
                : isQuickEntry
                  ? "#f8fafc"
                  : isOther
                    ? "#bfdbfe"
                    : "#cbd5e1",
          border: dragging
            ? isSecondary
              ? "1px dashed rgba(148, 163, 184, 0.42)"
              : isWorkflow
                ? "1px dashed rgba(96, 165, 250, 0.42)"
                : "1px dashed rgba(250, 204, 21, 0.45)"
            : dragOver
              ? isSecondary
                ? "1px solid rgba(148, 163, 184, 0.28)"
                : isWorkflow
                  ? "1px solid rgba(96, 165, 250, 0.35)"
                  : isQuickEntry
                    ? "1px solid rgba(251, 191, 36, 0.34)"
                    : "1px solid rgba(250, 204, 21, 0.35)"
              : isSecondary
                ? "1px solid rgba(100, 116, 139, 0.12)"
                : isWorkflow
                  ? "1px solid rgba(96, 165, 250, 0.22)"
                  : isQuickEntry
                    ? "1px solid rgba(251, 191, 36, 0.18)"
                    : isOther
                      ? "1px solid rgba(148, 163, 184, 0.1)"
                      : "1px solid rgba(148, 163, 184, 0.12)",
          boxShadow: dragging
            ? isSecondary
              ? "0 0 0 1px rgba(148, 163, 184, 0.12), 0 0 12px rgba(148, 163, 184, 0.16)"
              : isWorkflow
                ? "0 0 0 1px rgba(96, 165, 250, 0.14), 0 0 16px rgba(96, 165, 250, 0.2)"
                : "0 0 0 1px rgba(250, 204, 21, 0.12), 0 0 18px rgba(250, 204, 21, 0.18)"
            : undefined,
          cursor: props.canReorderPacks ? "grab" : "pointer"
        }}
      >
        {pack.name}
      </button>
    </div>
  );
}

function getPackTier(packName: string): PackTier {
  if (highFrequencyPackNames.has(packName)) {
    return "high-frequency";
  }

  if (quickEntryPackNames.has(packName)) {
    return "quick-entry";
  }

  if (workflowPackNames.has(packName)) {
    return "workflow";
  }

  if (secondaryPackNames.has(packName)) {
    return "secondary";
  }

  return "other";
}

function Chip(props: {
  label: string;
  active?: boolean;
  interactive?: boolean;
  onClick?: () => void;
}) {
  const contentStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    background: props.active ? "rgba(251, 191, 36, 0.18)" : "rgba(59, 130, 246, 0.12)",
    color: props.active ? "#fde68a" : "#bfdbfe",
    fontSize: 12,
    fontWeight: 600,
    border: props.interactive ? "1px solid rgba(148, 163, 184, 0.16)" : "1px solid transparent",
    cursor: props.interactive ? "pointer" : "default"
  };

  if (props.interactive && props.onClick) {
    return (
      <button type="button" onClick={props.onClick} style={{ ...chipButtonStyle, ...contentStyle }}>
        {props.label}
      </button>
    );
  }

  return (
    <span
      style={contentStyle}
    >
      {props.label}
    </span>
  );
}

function SectionLabel(props: { children: string }) {
  return (
    <div
      style={{
        color: "#94a3b8",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        marginBottom: 10
      }}
    >
      {props.children}
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid rgba(148, 163, 184, 0.22)",
  borderRadius: 14,
  padding: "12px 14px",
  background: "rgba(15, 23, 42, 0.65)",
  color: "#f8fafc",
  fontSize: 15,
  outline: "none"
};

const chipRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 12,
  marginBottom: 14,
  flexWrap: "wrap"
};

const buttonStyle: CSSProperties = {
  border: "none",
  borderRadius: 12,
  padding: "10px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  transition:
    "transform 140ms ease, opacity 140ms ease, background 140ms ease, border-color 140ms ease, box-shadow 140ms ease"
};

const chipButtonStyle: CSSProperties = {
  border: "none",
  outline: "none"
};

const sectionCardStyle: CSSProperties = {
  marginTop: 14,
  padding: "12px 16px 14px",
  borderRadius: 16,
  background: "rgba(15, 23, 42, 0.5)",
  border: "1px solid rgba(148, 163, 184, 0.1)"
};

const packStackStyle: CSSProperties = {
  display: "grid",
  gap: 10
};

const packRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap"
};
