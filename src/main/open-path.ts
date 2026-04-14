export async function openPathOrThrow(
  openPath: (targetPath: string) => Promise<string>,
  targetPath: string
) {
  const result = await openPath(targetPath);

  if (result) {
    throw new Error(`Failed to open path: ${result}`);
  }
}
