import { spawn } from "node:child_process";

export type ShellInvocation = {
  file: string;
  args: string[];
};

export function resolveShellInvocation(
  command: string,
  platform: NodeJS.Platform = process.platform
): ShellInvocation {
  if (platform === "win32") {
    return {
      file: "powershell.exe",
      args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command]
    };
  }

  return {
    file: "/bin/sh",
    args: ["-c", command]
  };
}

type SpawnLike = typeof spawn;

export function runPlatformShellCommand(
  command: string,
  stdin: string,
  options?: {
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    onError?: (error: Error) => void;
  }
) {
  return runPlatformShellCommandWithDependencies(command, stdin, {
    platform: options?.platform,
    env: options?.env,
    spawn,
    onError: options?.onError
  });
}

export function runPlatformShellCommandWithDependencies(
  command: string,
  stdin: string,
  dependencies: {
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    spawn: SpawnLike;
    onError?: (error: Error) => void;
  }
) {
  const invocation = resolveShellInvocation(command, dependencies.platform);
  const child = dependencies.spawn(invocation.file, invocation.args, {
    env: {
      ...process.env,
      ...dependencies.env,
      PROMPTBAR_TEXT: stdin
    },
    stdio: ["pipe", "ignore", "pipe"],
    windowsHide: true
  });

  child.stdin?.write(stdin);
  child.stdin?.end();

  let stderr = "";

  child.stderr?.setEncoding?.("utf8");
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });

  child.on("error", (error) => {
    dependencies.onError?.(error);
  });

  child.on("close", (code) => {
    if (!code) {
      return;
    }

    const suffix = stderr.trim() ? `: ${stderr.trim()}` : "";
    dependencies.onError?.(
      new Error(`Shell command exited with code ${code}${suffix}`)
    );
  });
}
