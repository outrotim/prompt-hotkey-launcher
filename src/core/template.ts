import type { PromptItem } from "../shared/types";

const VARIABLE_PATTERN = /{{\s*([^}]+?)\s*}}/g;
const PROMPT_REF_PATTERN = /{{\s*@([^}]+?)\s*}}/g;
const MAX_NESTING_DEPTH = 3;

function resolveDateVariable(key: string): string | null {
  if (key === "today") {
    return formatDate(new Date());
  }

  if (key === "yesterday") {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return formatDate(date);
  }

  if (key === "tomorrow") {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return formatDate(date);
  }

  if (key === "now") {
    return new Date().toISOString().slice(0, 16).replace("T", " ");
  }

  return null;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function resolvePromptReferences(
  text: string,
  libraryItems: PromptItem[],
  depth: number,
  visited: Set<string>
): string {
  if (depth >= MAX_NESTING_DEPTH) {
    return text;
  }

  return text.replace(PROMPT_REF_PATTERN, (match, ref: string) => {
    const refTrimmed = ref.trim();

    const referencedPrompt = libraryItems.find(
      (item) => item.id === refTrimmed || item.title === refTrimmed
    );

    if (!referencedPrompt) {
      return match;
    }

    if (visited.has(referencedPrompt.id)) {
      return match;
    }

    const childVisited = new Set(visited);
    childVisited.add(referencedPrompt.id);

    return resolvePromptReferences(
      referencedPrompt.body,
      libraryItems,
      depth + 1,
      childVisited
    );
  });
}

export function renderPromptBody(
  prompt: PromptItem,
  values: Record<string, string>,
  libraryItems?: PromptItem[]
) {
  let body = prompt.body;

  if (libraryItems && libraryItems.length > 0) {
    const visited = new Set<string>([prompt.id]);
    body = resolvePromptReferences(body, libraryItems, 0, visited);
  }

  return body.replace(VARIABLE_PATTERN, (_, expression: string) => {
    const [keyPart, optionsPart] = expression.split("|");
    const key = keyPart?.trim();

    if (!key) {
      return "";
    }

    if (key.startsWith("@")) {
      return _;
    }

    const explicitValue = values[key];

    if (explicitValue !== undefined) {
      return explicitValue;
    }

    const dateValue = resolveDateVariable(key);

    if (dateValue !== null) {
      return dateValue;
    }

    if (optionsPart) {
      const fallbackOption = optionsPart
        .split(",")
        .map((option) => option.trim())
        .find(Boolean);

      return fallbackOption ?? "";
    }

    return "";
  });
}
