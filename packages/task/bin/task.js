#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const PLATFORM_PACKAGES = {
  "darwin-x64": "@nmnmcc/task-darwin-x64",
  "darwin-arm64": "@nmnmcc/task-darwin-arm64",
  "freebsd-ia32": "@nmnmcc/task-freebsd-ia32",
  "freebsd-x64": "@nmnmcc/task-freebsd-x64",
  "freebsd-arm": "@nmnmcc/task-freebsd-arm",
  "freebsd-arm64": "@nmnmcc/task-freebsd-arm64",
  "linux-ia32": "@nmnmcc/task-linux-ia32",
  "linux-x64": "@nmnmcc/task-linux-x64",
  "linux-arm": "@nmnmcc/task-linux-arm",
  "linux-arm64": "@nmnmcc/task-linux-arm64",
  "linux-riscv64": "@nmnmcc/task-linux-riscv64",
  "win32-ia32": "@nmnmcc/task-win32-ia32",
  "win32-x64": "@nmnmcc/task-win32-x64",
  "win32-arm64": "@nmnmcc/task-win32-arm64",
};

const key = `${process.platform}-${process.arch}`;
const pkg = PLATFORM_PACKAGES[key];

if (!pkg) {
  console.error(
    `@nmnmcc/task: unsupported platform ${key}.\n` +
    `Supported: ${Object.keys(PLATFORM_PACKAGES).join(", ")}.`
  );
  process.exit(1);
}

let binDir;
try {
  binDir = path.dirname(require.resolve(`${pkg}/package.json`));
} catch {
  console.error(
    `@nmnmcc/task: missing optional dependency "${pkg}".\n` +
    "This usually means npm/yarn/pnpm was run with --no-optional, or\n" +
    "the optional install failed. Re-run install without --no-optional,\n" +
    "or install the platform package directly:\n" +
    `  npm i ${pkg}`
  );
  process.exit(1);
}

const exe = path.join(binDir, "bin", process.platform === "win32" ? "task.exe" : "task");

if (!fs.existsSync(exe)) {
  console.error(`@nmnmcc/task: binary not found at ${exe}`);
  process.exit(1);
}

const result = spawnSync(exe, process.argv.slice(2), {
  stdio: "inherit",
  windowsHide: true,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
