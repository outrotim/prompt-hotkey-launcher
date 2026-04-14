import type { PromptFileMetadata, PromptPack } from "../shared/types";

export function serializePromptFile(packs: PromptPack[]) {
  if (packs.length === 0) {
    return "";
  }

  const metadata = packs[0]?.metadata ?? {
    favorite: false,
    tags: [],
    aliases: []
  };

  const chunks = [
    serializeFrontmatter(metadata),
    ...packs.flatMap((pack) => {
      const lines = [`# ${pack.name}`, ""];

      for (const item of pack.items) {
        lines.push(`<!-- promptbar:id=${item.id} -->`);
        lines.push(`## ${item.title}`);
        lines.push(item.body.trim());
        lines.push("");
      }

      return lines;
    })
  ];

  return `${chunks.join("\n").trim()}\n`;
}

function serializeFrontmatter(metadata: PromptFileMetadata) {
  const lines = [
    "---",
    `tags: [${metadata.tags.map(quoteValue).join(", ")}]`,
    `aliases: [${metadata.aliases.map(quoteValue).join(", ")}]`,
    `favorite: ${metadata.favorite ? "true" : "false"}`
  ];

  if (metadata.output && metadata.output !== "paste") {
    lines.push(`output: ${metadata.output}`);
  }

  if (metadata.outputFile) {
    lines.push(`outputFile: ${quoteValue(metadata.outputFile)}`);
  }

  if (metadata.after?.type === "shell" && metadata.after.command) {
    lines.push(`after: shell`);
    lines.push(`command: ${quoteValue(metadata.after.command)}`);
  }

  lines.push("---", "");
  return lines.join("\n");
}

function quoteValue(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
