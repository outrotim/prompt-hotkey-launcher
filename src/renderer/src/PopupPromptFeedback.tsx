export function PopupPromptFeedback(props: {
  loading: boolean;
  loadError: string | null;
  isSearching: boolean;
  favoriteOnly: boolean;
  variableOnly: boolean;
  visiblePromptCount: number;
  t: (english: string, chinese?: string) => string;
  onClearFilters?: () => void;
}) {
  if (props.loading) {
    return (
      <MessageCard tone="muted">
        {props.t("Loading prompts from Markdown files...", "正在从 Markdown 文件加载提示词...")}
      </MessageCard>
    );
  }

  if (props.loadError) {
    return <MessageCard tone="danger">{props.loadError}</MessageCard>;
  }

  if (props.visiblePromptCount === 0) {
    const filtersActive = props.favoriteOnly || props.variableOnly;

    if (filtersActive) {
      const activeFilterLabel = props.favoriteOnly && props.variableOnly
        ? props.t("Favorites + Variables", "收藏 + 变量")
        : props.favoriteOnly
          ? props.t("Favorites", "收藏")
          : props.t("Variables", "变量");

      return (
        <MessageCard tone="muted">
          <div>
            {props.t(
              props.isSearching
                ? `No prompt matches the current ${activeFilterLabel} filter. Try turning off the filter or broadening the search.`
                : `No prompt matches the current ${activeFilterLabel} filter in this view. Try turning off the filter.`,
              props.isSearching
                ? `当前没有提示词匹配“${activeFilterLabel}”过滤条件。可以关闭过滤器，或试试更宽泛的搜索词。`
                : `当前视图下没有提示词匹配“${activeFilterLabel}”过滤条件。可以先关闭过滤器再查看。`
            )}
          </div>
          {props.onClearFilters ? (
            <button type="button" onClick={props.onClearFilters} style={clearButtonStyle}>
              {props.t("Clear filters", "清除过滤器")}
            </button>
          ) : null}
        </MessageCard>
      );
    }

    return (
      <MessageCard tone="muted">
        {props.t(
          props.isSearching
            ? "No prompt matches this query yet. Try a broader keyword or clear the search with Esc."
            : "This pack has no prompts yet. Switch packs or add prompts in the manager.",
          props.isSearching
            ? "当前没有匹配的提示词。试试更宽泛的关键词，或按 Esc 清空搜索。"
            : "当前分组还没有提示词。可以切换分组，或去管理器中添加。"
        )}
      </MessageCard>
    );
  }

  return null;
}

function MessageCard(props: { tone: "muted" | "danger"; children: ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 16,
        padding: "14px 16px",
        background:
          props.tone === "danger"
            ? "rgba(127, 29, 29, 0.48)"
            : "rgba(15, 23, 42, 0.5)",
        border:
          props.tone === "danger"
            ? "1px solid rgba(248, 113, 113, 0.18)"
            : "1px solid rgba(148, 163, 184, 0.12)",
        color: props.tone === "danger" ? "#fecaca" : "#cbd5e1",
        fontSize: 14,
        lineHeight: 1.55,
        display: "grid",
        gap: 10
      }}
    >
      {props.children}
    </div>
  );
}

const clearButtonStyle = {
  justifySelf: "start",
  border: "1px solid rgba(148, 163, 184, 0.16)",
  borderRadius: 10,
  padding: "8px 12px",
  background: "rgba(59, 130, 246, 0.16)",
  color: "#bfdbfe",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer"
} as const;
import type { ReactNode } from "react";
