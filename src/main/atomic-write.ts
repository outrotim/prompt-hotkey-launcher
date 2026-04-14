import { mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function writeFileAtomically(filePath: string, content: string) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempFilePath = `${filePath}.tmp`;

  try {
    writeFileSync(tempFilePath, content);
    renameSync(tempFilePath, filePath);
  } catch (error) {
    try {
      unlinkSync(tempFilePath);
    } catch {
      // Temp file doesn't exist or already deleted
    }

    throw error;
  }
}
