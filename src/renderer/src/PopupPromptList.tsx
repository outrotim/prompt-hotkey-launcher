import type { CSSProperties, MutableRefObject } from "react";
import type { PromptItem, PromptPack } from "../../shared/types";
import { getDropPlacement } from "../../shared/prompt-order.js";

export function PopupPromptList(props: {
  prompts: PromptItem[];
  packs: PromptPack[];
  selectedIndex: number;
  canReorderPrompts: boolean;
  draggedPromptId: string | null;
  dragOverPromptId: string | null;
  dragOverPromptPlacement: "before" | "after";
  dragOverPromptEnd: boolean;
  onHoverPrompt: (index: number) => void;
  onSelectPrompt: (prompt: PromptItem) => void;
  onDragPromptStart: (promptId: string) => void;
  onDragPromptOver: (promptId: string, placement: "before" | "after") => void;
  onDropPrompt: (promptId: string, placement: "before" | "after") => void;
  onDragPromptEndZoneOver: () => void;
  onDropPromptToEnd: () => void;
  onDragPromptEnd: () => void;
  promptItemRefs: MutableRefObject<Record<string, HTMLElement | null>>;
  t: (english: string, chinese?: string) => string;
}) {
  const packNameById = new Map(props.packs.map((pack) => [pack.id, pack.name]));

  return (
    <>
      {props.prompts.map((prompt, index) => (
        <article
          key={prompt.id}
          draggable={props.canReorderPrompts}
          ref={(element) => {
            props.promptItemRefs.current[prompt.id] = element;
          }}
          onDragStart={() => {
            if (!props.canReorderPrompts) {
              return;
            }

            props.onDragPromptStart(prompt.id);
          }}
          onDragOver={(event) => {
            if (!props.canReorderPrompts) {
              return;
            }

            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            props.onDragPromptOver(
              prompt.id,
              getDropPlacement(rect.top, rect.height, event.clientY)
            );
          }}
          onDrop={(event) => {
            if (!props.canReorderPrompts) {
              return;
            }

            event.preventDefault();
            props.onDropPrompt(prompt.id, props.dragOverPromptPlacement);
          }}
          onDragEnd={() => {
            props.onDragPromptEnd();
          }}
          onMouseEnter={() => {
            props.onHoverPrompt(index);
          }}
          onClick={() => {
            props.onSelectPrompt(prompt);
          }}
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "32px 1fr",
            gap: 12,
            alignItems: "start",
            padding: "12px 12px 12px 10px",
            borderRadius: 16,
            opacity: props.draggedPromptId === prompt.id ? 0.55 : 1,
            transform: props.draggedPromptId === prompt.id ? "scale(0.99)" : "scale(1)",
            background:
              index === props.selectedIndex
                ? "linear-gradient(135deg, rgba(251, 191, 36, 0.18), rgba(59, 130, 246, 0.12))"
                : props.dragOverPromptId === prompt.id
                  ? "rgba(96, 165, 250, 0.18)"
                : "rgba(30, 41, 59, 0.72)",
            border:
              props.draggedPromptId === prompt.id
                ? "1px dashed rgba(96, 165, 250, 0.38)"
                : index === props.selectedIndex
                ? "1px solid rgba(251, 191, 36, 0.28)"
                : props.dragOverPromptId === prompt.id
                  ? "1px solid rgba(191, 219, 254, 0.35)"
                : "1px solid rgba(148, 163, 184, 0.1)",
            cursor: props.canReorderPrompts ? "grab" : "pointer",
            transition:
              "transform 140ms ease, opacity 140ms ease, background 140ms ease, border-color 140ms ease, box-shadow 140ms ease",
            boxShadow:
              props.draggedPromptId === prompt.id
                ? "0 0 0 1px rgba(96, 165, 250, 0.28), 0 14px 28px rgba(15, 23, 42, 0.28)"
                : undefined
          }}
        >
          {props.canReorderPrompts && props.dragOverPromptId === prompt.id ? (
            <div
              style={{
                position: "absolute",
                top: props.dragOverPromptPlacement === "before" ? -5 : undefined,
                bottom: props.dragOverPromptPlacement === "after" ? -5 : undefined,
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
          <div style={indexBadgeStyle}>{index + 1}</div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{prompt.title}</div>
              {prompt.favorite ? (
                <span style={{ fontSize: 11, color: "#fbbf24" }}>{props.t("Favorite", "收藏")}</span>
              ) : null}
            </div>
            <div style={itemDescriptionStyle}>{prompt.description}</div>
            <div style={itemMetaStyle}>
              <span>{packNameById.get(prompt.packId) ?? prompt.packId}</span>
              {prompt.variables.length > 0 ? (
                <span>{props.t(`${prompt.variables.length} variable(s)`, `${prompt.variables.length} 个变量`)}</span>
              ) : (
                <span>{props.t("Instant insert", "即时插入")}</span>
              )}
              {(prompt.useCount ?? 0) > 0 ? (
                <span>{props.t(`${prompt.useCount} recent use(s)`, `${prompt.useCount} 次最近使用`)}</span>
              ) : null}
            </div>
          </div>
        </article>
      ))}
      {props.canReorderPrompts && props.draggedPromptId ? (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            props.onDragPromptEndZoneOver();
          }}
          onDrop={(event) => {
            event.preventDefault();
            props.onDropPromptToEnd();
          }}
          style={{
            minHeight: 46,
            borderRadius: 14,
            border: "1px dashed rgba(250, 204, 21, 0.42)",
            background: props.dragOverPromptEnd
              ? "linear-gradient(135deg, rgba(250, 204, 21, 0.18), rgba(253, 224, 71, 0.12))"
              : "linear-gradient(135deg, rgba(250, 204, 21, 0.1), rgba(253, 224, 71, 0.06))",
            boxShadow: props.dragOverPromptEnd
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
    </>
  );
}

const indexBadgeStyle: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 10,
  display: "grid",
  placeItems: "center",
  background: "rgba(15, 23, 42, 0.55)",
  color: "#f8fafc",
  fontWeight: 700
};

const itemDescriptionStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#94a3b8",
  lineHeight: 1.45
};

const itemMetaStyle: CSSProperties = {
  marginTop: 6,
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  fontSize: 12,
  color: "#64748b"
};
