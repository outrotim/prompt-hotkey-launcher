import type { PromptItem, PromptPack } from "./types";

export type DropPlacement = "before" | "after";

export type PromptOrderSubject = Pick<
  PromptItem,
  "id" | "packId" | "favorite" | "title" | "useCount" | "lastUsedAt"
>;

export function sortPromptItems<T extends PromptOrderSubject>(
  items: T[],
  persistedOrder: string[] = []
) {
  const persistedOrderIndex = new Map(
    persistedOrder.map((id, index) => [id, index] as const)
  );

  return [...items].sort((left, right) => {
    const leftPersistedIndex = persistedOrderIndex.get(left.id);
    const rightPersistedIndex = persistedOrderIndex.get(right.id);

    if (leftPersistedIndex !== undefined || rightPersistedIndex !== undefined) {
      if (leftPersistedIndex === undefined) {
        return 1;
      }

      if (rightPersistedIndex === undefined) {
        return -1;
      }

      return leftPersistedIndex - rightPersistedIndex;
    }

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

export function reorderPrompts<T>(items: T[], fromIndex: number, toIndex: number) {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return [...items];
  }

  const nextItems = [...items];
  const [moved] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, moved);
  return nextItems;
}

export function getDropPlacement(
  top: number,
  height: number,
  clientY: number
): DropPlacement {
  return clientY < top + height / 2 ? "before" : "after";
}

export function shouldSuppressDragClick(
  suppressUntil: number,
  now = Date.now()
) {
  return now < suppressUntil;
}

export function resolveReorderTargetIndex(
  fromIndex: number,
  targetIndex: number,
  placement: DropPlacement
) {
  if (fromIndex === targetIndex) {
    return placement === "before" ? targetIndex : targetIndex + 1;
  }

  if (placement === "before") {
    return fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
  }

  return fromIndex < targetIndex ? targetIndex : targetIndex + 1;
}

export function buildPromptOrderFromReplacement(
  currentOrderedItems: Pick<PromptItem, "id" | "packId">[],
  packId: string,
  nextPackItems: Pick<PromptItem, "id">[]
) {
  const nextPackOrder = nextPackItems.map((item) => item.id);
  const nextOrder: string[] = [];
  let inserted = false;

  for (const item of currentOrderedItems) {
    if (item.packId === packId) {
      if (!inserted) {
        nextOrder.push(...nextPackOrder);
        inserted = true;
      }

      continue;
    }

    nextOrder.push(item.id);
  }

  if (!inserted) {
    nextOrder.push(...nextPackOrder);
  }

  return nextOrder;
}

export function buildPromptOrderFromPacks<
  T extends { items: Array<Pick<PromptItem, "id">> }
>(packs: T[]) {
  return packs.flatMap((pack) => pack.items.map((item) => item.id));
}

export function movePromptBetweenPacks<
  T extends Pick<PromptItem, "id">,
  P extends { id: string; items: T[]; sourceFile?: string }
>(
  packs: P[],
  promptId: string,
  targetPackId: string,
  targetPromptId?: string,
  placement: DropPlacement = "before"
) {
  const sourcePack = packs.find((pack) =>
    pack.items.some((item) => item.id === promptId)
  );
  const targetPack = packs.find((pack) => pack.id === targetPackId);

  if (!sourcePack || !targetPack) {
    return [...packs];
  }

  const sourceIndex = sourcePack.items.findIndex((item) => item.id === promptId);

  if (sourceIndex === -1) {
    return [...packs];
  }

  const movedPrompt = sourcePack.items[sourceIndex];

  if (sourcePack.id === targetPack.id) {
    const targetIndex =
      targetPromptId == null
        ? targetPack.items.length - 1
        : targetPack.items.findIndex((item) => item.id === targetPromptId);

    if (targetIndex === -1) {
      return [...packs];
    }

    return packs.map((pack) =>
      pack.id === sourcePack.id
        ? {
            ...pack,
            items: reorderPrompts(
              pack.items,
              sourceIndex,
              Math.min(
                pack.items.length - 1,
                resolveReorderTargetIndex(sourceIndex, targetIndex, placement)
              )
            )
          }
        : pack
    );
  }

  const nextSourceItems = sourcePack.items.filter((item) => item.id !== promptId);
  const nextTargetItems = [...targetPack.items];
  const insertIndex =
    targetPromptId == null
      ? nextTargetItems.length
      : nextTargetItems.findIndex((item) => item.id === targetPromptId);

  if (insertIndex === -1) {
    return [...packs];
  }

  nextTargetItems.splice(
    targetPromptId == null || placement === "before" ? insertIndex : insertIndex + 1,
    0,
    syncMovedPromptOwnership(movedPrompt, targetPack)
  );

  return packs.map((pack) => {
    if (pack.id === sourcePack.id) {
      return {
        ...pack,
        items: nextSourceItems
      };
    }

    if (pack.id === targetPack.id) {
      return {
        ...pack,
        items: nextTargetItems
      };
    }

    return pack;
  });
}

function syncMovedPromptOwnership<
  T extends Pick<PromptItem, "id">,
  P extends { id: string; sourceFile?: string; metadata?: PromptPack["metadata"] }
>(
  prompt: T,
  targetPack: P
) {
  const nextPrompt = {
    ...prompt
  };

  if ("packId" in prompt) {
    Object.assign(nextPrompt, {
      packId: targetPack.id
    });
  }

  if ("sourceFile" in prompt && targetPack.sourceFile) {
    Object.assign(nextPrompt, {
      sourceFile: targetPack.sourceFile
    });
  }

  if ("favorite" in prompt && targetPack.metadata) {
    Object.assign(nextPrompt, {
      favorite: targetPack.metadata.favorite,
      tags: [...targetPack.metadata.tags],
      aliases: [...targetPack.metadata.aliases],
      output: targetPack.metadata.output,
      outputFile: targetPack.metadata.outputFile,
      after: targetPack.metadata.after ? { ...targetPack.metadata.after } : undefined
    });
  }

  return nextPrompt as T;
}
