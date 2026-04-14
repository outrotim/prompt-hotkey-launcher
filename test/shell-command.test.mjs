import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { resolveShellInvocation, runPlatformShellCommandWithDependencies } from "../src/main/shell-command.ts";

test("resolveShellInvocation uses /bin/sh on darwin", () => {
  assert.deepEqual(
    resolveShellInvocation("echo hi", "darwin"),
    {
      file: "/bin/sh",
      args: ["-c", "echo hi"]
    }
  );
});

test("resolveShellInvocation uses PowerShell on win32", () => {
  assert.deepEqual(
    resolveShellInvocation("Write-Output hi", "win32"),
    {
      file: "powershell.exe",
      args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "Write-Output hi"]
    }
  );
});

test("runPlatformShellCommandWithDependencies injects PROMPTBAR_TEXT and pipes stdin", async () => {
  let captured = null;

  runPlatformShellCommandWithDependencies("echo hi", "rendered text", {
    platform: "darwin",
    env: { TEST_FLAG: "1" },
    spawn: (file, args, options) => {
      const child = new EventEmitter();
      child.stdin = {
        writes: [],
        write(value) {
          this.writes.push(value);
        },
        endCalled: false,
        end() {
          this.endCalled = true;
        }
      };
      child.stderr = new EventEmitter();
      child.stderr.setEncoding = () => {};

      captured = { file, args, options, child };
      queueMicrotask(() => {
        child.emit("close", 0);
      });
      return child;
    }
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(captured.file, "/bin/sh");
  assert.deepEqual(captured.args, ["-c", "echo hi"]);
  assert.equal(captured.options.env.PROMPTBAR_TEXT, "rendered text");
  assert.equal(captured.options.env.TEST_FLAG, "1");
  assert.deepEqual(captured.child.stdin.writes, ["rendered text"]);
  assert.equal(captured.child.stdin.endCalled, true);
});

test("runPlatformShellCommandWithDependencies reports non-zero exit codes", async () => {
  const errors = [];

  runPlatformShellCommandWithDependencies("Write-Error boom", "rendered text", {
    platform: "win32",
    spawn: () => {
      const child = new EventEmitter();
      child.stdin = {
        write() {},
        end() {}
      };
      child.stderr = new EventEmitter();
      child.stderr.setEncoding = () => {};
      queueMicrotask(() => {
        child.stderr.emit("data", "boom");
        child.emit("close", 1);
      });
      return child;
    },
    onError: (error) => {
      errors.push(error);
    }
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /Shell command exited with code 1: boom/);
});
