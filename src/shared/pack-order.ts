import type { PromptPack } from "./types";

export const DEFAULT_PACK_DISPLAY_ORDER = [
  "日常写作",
  "编程",
  "常用工具",
  "写作前快启",
  "修稿投稿快启",
  "投稿包与格式化",
  "00 通用底座",
  "01 写作前阶段",
  "02 修稿投稿阶段",
  "03 专项模块",
  "论文引擎基础",
  "研究画像",
  "修稿步骤",
  "实用模块"
] as const;

export type PackOrderSubject = Pick<PromptPack, "name" | "sourceFile" | "metadata">;

export function getPromptPackOrderKey(pack: Pick<PromptPack, "name" | "sourceFile">) {
  return `${pack.sourceFile}::${pack.name}`;
}

export function sortPromptPacks<T extends PackOrderSubject>(
  packs: T[],
  persistedOrder: string[] = []
) {
  const persistedOrderIndex = new Map(
    persistedOrder.map((key, index) => [key, index] as const)
  );

  return [...packs].sort((left, right) => {
    const leftPersistedIndex = persistedOrderIndex.get(getPromptPackOrderKey(left));
    const rightPersistedIndex = persistedOrderIndex.get(getPromptPackOrderKey(right));

    if (leftPersistedIndex !== undefined || rightPersistedIndex !== undefined) {
      if (leftPersistedIndex === undefined) {
        return 1;
      }

      if (rightPersistedIndex === undefined) {
        return -1;
      }

      return leftPersistedIndex - rightPersistedIndex;
    }

    const leftDefaultIndex = DEFAULT_PACK_DISPLAY_ORDER.indexOf(left.name as never);
    const rightDefaultIndex = DEFAULT_PACK_DISPLAY_ORDER.indexOf(right.name as never);
    const leftHasDefaultOrder = leftDefaultIndex !== -1;
    const rightHasDefaultOrder = rightDefaultIndex !== -1;

    if (leftHasDefaultOrder || rightHasDefaultOrder) {
      if (!leftHasDefaultOrder) {
        return 1;
      }

      if (!rightHasDefaultOrder) {
        return -1;
      }

      return leftDefaultIndex - rightDefaultIndex;
    }

    if (left.metadata.favorite !== right.metadata.favorite) {
      return left.metadata.favorite ? -1 : 1;
    }

    return left.name.localeCompare(right.name, "zh-CN");
  });
}

export function reorderPacks<T>(packs: T[], fromIndex: number, toIndex: number) {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= packs.length ||
    toIndex >= packs.length
  ) {
    return [...packs];
  }

  const nextPacks = [...packs];
  const [movedPack] = nextPacks.splice(fromIndex, 1);
  nextPacks.splice(toIndex, 0, movedPack);
  return nextPacks;
}

export function movePackBetweenFiles<T extends PromptPack>(
  packs: T[],
  draggedPackId: string,
  targetPackId: string,
  placement: "before" | "after" = "before"
) {
  const fromIndex = packs.findIndex((pack) => pack.id === draggedPackId);
  const targetIndex = packs.findIndex((pack) => pack.id === targetPackId);
  const draggedPack = packs.find((pack) => pack.id === draggedPackId) ?? null;
  const targetPack = packs.find((pack) => pack.id === targetPackId) ?? null;

  if (!draggedPack || !targetPack || fromIndex === -1 || targetIndex === -1) {
    return [...packs];
  }

  const targetSourceFile = targetPack.sourceFile;
  const targetMetadata = {
    ...targetPack.metadata,
    tags: [...targetPack.metadata.tags],
    aliases: [...targetPack.metadata.aliases],
    ...(targetPack.metadata.after
      ? {
          after: {
            ...targetPack.metadata.after
          }
        }
      : {})
  };
  const migratedPack = {
    ...draggedPack,
    sourceFile: targetSourceFile,
    metadata: targetMetadata,
    items: draggedPack.items.map((item) => {
      const nextItem = {
        ...item
      };

      delete nextItem.output;
      delete nextItem.outputFile;
      delete nextItem.after;

      return {
        ...nextItem,
        sourceFile: targetSourceFile,
        favorite: targetMetadata.favorite,
        tags: [...targetMetadata.tags],
        aliases: [...targetMetadata.aliases],
        ...(targetMetadata.output ? { output: targetMetadata.output } : {}),
        ...(targetMetadata.outputFile ? { outputFile: targetMetadata.outputFile } : {}),
        ...(targetMetadata.after ? { after: { ...targetMetadata.after } } : {})
      };
    })
  };

  const withoutDraggedPack = packs.filter((pack) => pack.id !== draggedPackId);
  const insertionBaseIndex = withoutDraggedPack.findIndex((pack) => pack.id === targetPackId);

  if (insertionBaseIndex === -1) {
    return [...packs];
  }

  const insertionIndex =
    placement === "before" ? insertionBaseIndex : insertionBaseIndex + 1;

  const nextPacks = [...withoutDraggedPack];
  nextPacks.splice(insertionIndex, 0, migratedPack);
  return nextPacks;
}

export function supportsCrossFilePackMigration(
  sourceFile: string,
  targetFile: string
) {
  return isMarkdownPromptFile(sourceFile) && isMarkdownPromptFile(targetFile);
}

function isMarkdownPromptFile(filePath: string) {
  return filePath.toLowerCase().endsWith(".md");
}

export function buildPackOrderFromReplacement(
  currentOrderedPacks: Pick<PromptPack, "name" | "sourceFile">[],
  sourceFile: string,
  nextFilePacks: Pick<PromptPack, "name" | "sourceFile">[]
) {
  const nextFileOrder = nextFilePacks.map(getPromptPackOrderKey);
  const nextOrder: string[] = [];
  let inserted = false;

  for (const pack of currentOrderedPacks) {
    if (pack.sourceFile === sourceFile) {
      if (!inserted) {
        nextOrder.push(...nextFileOrder);
        inserted = true;
      }

      continue;
    }

    nextOrder.push(getPromptPackOrderKey(pack));
  }

  if (!inserted) {
    nextOrder.push(...nextFileOrder);
  }

  return nextOrder;
}

export function appendPackOrderKey(
  currentOrderedPacks: Pick<PromptPack, "name" | "sourceFile">[],
  nextPack: Pick<PromptPack, "name" | "sourceFile">
) {
  return [
    ...currentOrderedPacks.map(getPromptPackOrderKey),
    getPromptPackOrderKey(nextPack)
  ];
}
