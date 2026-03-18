import * as fs from 'fs';
import * as path from 'path';
import { PromptPack, PromptItem } from '../shared/types';

/**
 * Parse a markdown file into a PromptPack.
 *
 * Expected format:
 * ```markdown
 * # Pack Name
 * Optional description text
 *
 * ## Prompt Title
 * Prompt content with {{variables}}
 *
 * ## Another Prompt
 * More content here
 * ```
 */
export function parseMarkdown(filePath: string): PromptPack | null {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return parseMarkdownContent(raw, filePath);
}

export function parseMarkdownContent(raw: string, filePath: string): PromptPack | null {
  const lines = raw.split('\n');

  let packName = '';
  let packDescription = '';
  const prompts: PromptItem[] = [];

  let currentPromptName = '';
  let currentPromptLines: string[] = [];
  let inDescription = false;

  for (const line of lines) {
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      packName = line.replace(/^#\s+/, '').trim();
      inDescription = true;
      continue;
    }

    if (line.startsWith('## ')) {
      if (currentPromptName) {
        prompts.push(createPromptItem(currentPromptName, currentPromptLines.join('\n').trim()));
      }
      currentPromptName = line.replace(/^##\s+/, '').trim();
      currentPromptLines = [];
      inDescription = false;
      continue;
    }

    if (inDescription && !currentPromptName) {
      if (line.trim()) {
        packDescription += (packDescription ? '\n' : '') + line.trim();
      }
      continue;
    }

    if (currentPromptName) {
      currentPromptLines.push(line);
    }
  }

  if (currentPromptName) {
    prompts.push(createPromptItem(currentPromptName, currentPromptLines.join('\n').trim()));
  }

  if (!packName) return null;

  return {
    id: generateId(filePath),
    name: packName,
    description: packDescription || undefined,
    prompts,
    filePath,
  };
}

function createPromptItem(name: string, content: string): PromptItem {
  return {
    id: generateId(name + Date.now()),
    name,
    content,
    variables: extractVariables(content),
    useCount: 0,
    isFavorite: false,
  };
}

/** Extract {{variable}} placeholders from content */
export function extractVariables(content: string): string[] {
  const regex = /\{\{([^}]+)\}\}/g;
  const variables: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const varName = match[1].trim();
    if (!variables.includes(varName)) {
      variables.push(varName);
    }
  }
  return variables;
}

/** Replace {{variable}} placeholders with values */
export function replaceVariables(content: string, values: Record<string, string>): string {
  return content.replace(/\{\{([^}]+)\}\}/g, (_, varName) => {
    const trimmed = varName.trim();
    return values[trimmed] ?? `{{${trimmed}}}`;
  });
}

/** Convert a PromptPack back to markdown */
export function packToMarkdown(pack: PromptPack): string {
  let md = `# ${pack.name}\n`;
  if (pack.description) {
    md += `${pack.description}\n`;
  }
  md += '\n';
  for (const prompt of pack.prompts) {
    md += `## ${prompt.name}\n${prompt.content}\n\n`;
  }
  return md.trimEnd() + '\n';
}

/** Save a PromptPack as a markdown file */
export function savePackAsMarkdown(pack: PromptPack): void {
  const md = packToMarkdown(pack);
  fs.writeFileSync(pack.filePath, md, 'utf-8');
}

/** Load all markdown files from a directory */
export function loadAllPacks(dir: string): PromptPack[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  const packs: PromptPack[] = [];
  for (const file of files) {
    const filePath = path.join(dir, file);
    const pack = parseMarkdown(filePath);
    if (pack) packs.push(pack);
  }
  return packs;
}

function generateId(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36) + Date.now().toString(36);
}
