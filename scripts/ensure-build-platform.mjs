const expectedPlatform = process.argv[2];

if (!expectedPlatform) {
  throw new Error("Expected target platform argument, e.g. `win32`.");
}

if (process.platform !== expectedPlatform) {
  const targetLabel = expectedPlatform === "win32" ? "Windows" : expectedPlatform;
  throw new Error(
    `${targetLabel} packaging must run on a ${targetLabel} host (or CI runner). ` +
    `PromptBar currently ships a native addon, and node-gyp cannot cross-compile it from ${process.platform}.`
  );
}
