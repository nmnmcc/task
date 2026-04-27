#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PACKAGES = path.join(ROOT, "packages");
const SCOPE = "@nmnmcc";

const PLATFORMS = [
  { os: "darwin", cpu: "x64" },
  { os: "darwin", cpu: "arm64" },
  { os: "freebsd", cpu: "ia32" },
  { os: "freebsd", cpu: "x64" },
  { os: "freebsd", cpu: "arm" },
  { os: "freebsd", cpu: "arm64" },
  { os: "linux", cpu: "ia32" },
  { os: "linux", cpu: "x64" },
  { os: "linux", cpu: "arm" },
  { os: "linux", cpu: "arm64" },
  { os: "linux", cpu: "riscv64" },
  { os: "win32", cpu: "ia32" },
  { os: "win32", cpu: "x64" },
  { os: "win32", cpu: "arm64" },
];

function writeJSON(filepath, data) {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2) + "\n");
}

for (const { os, cpu } of PLATFORMS) {
  writeJSON(path.join(PACKAGES, `task-${os}-${cpu}`, "package.json"), {
    name: `${SCOPE}/task-${os}-${cpu}`,
    version: "0.0.0",
    description: `task binary for ${os}-${cpu}, mirrored from go-task/task`,
    license: "MIT",
    repository: { type: "git", url: "git+https://github.com/nmnmcc/task.git" },
    homepage: "https://taskfile.dev",
    os: [os],
    cpu: [cpu],
    files: ["bin/", "LICENSE"],
    preferUnplugged: true,
  });
}

writeJSON(path.join(PACKAGES, "task", "package.json"), {
  name: `${SCOPE}/task`,
  version: "0.0.0",
  description:
    "Unofficial npm mirror of go-task/task using optionalDependencies — no postinstall, mirrorable, with provenance.",
  license: "MIT",
  repository: { type: "git", url: "git+https://github.com/nmnmcc/task.git" },
  homepage: "https://taskfile.dev",
  bin: { task: "bin/task.js" },
  files: ["bin/", "README.md", "LICENSE"],
  engines: { node: ">=16" },
  keywords: ["task", "taskfile", "build-tool", "task-runner", "mirror"],
  optionalDependencies: Object.fromEntries(
    PLATFORMS.map(({ os, cpu }) => [`${SCOPE}/task-${os}-${cpu}`, "0.0.0"]),
  ),
});

const map = PLATFORMS.map(
  ({ os, cpu }) => `  "${os}-${cpu}": "${SCOPE}/task-${os}-${cpu}",`,
).join("\n");

const taskJs = `#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const PLATFORM_PACKAGES = {
${map}
};

const key = \`\${process.platform}-\${process.arch}\`;
const pkg = PLATFORM_PACKAGES[key];

if (!pkg) {
  console.error(
    \`@nmnmcc/task: unsupported platform \${key}.\\n\` +
    \`Supported: \${Object.keys(PLATFORM_PACKAGES).join(", ")}.\`
  );
  process.exit(1);
}

let binDir;
try {
  binDir = path.dirname(require.resolve(\`\${pkg}/package.json\`));
} catch {
  console.error(
    \`@nmnmcc/task: missing optional dependency "\${pkg}".\\n\` +
    "This usually means npm/yarn/pnpm was run with --no-optional, or\\n" +
    "the optional install failed. Re-run install without --no-optional,\\n" +
    "or install the platform package directly:\\n" +
    \`  npm i \${pkg}\`
  );
  process.exit(1);
}

const exe = path.join(binDir, "bin", process.platform === "win32" ? "task.exe" : "task");

if (!fs.existsSync(exe)) {
  console.error(\`@nmnmcc/task: binary not found at \${exe}\`);
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
`;

const binDir = path.join(PACKAGES, "task", "bin");
fs.mkdirSync(binDir, { recursive: true });
fs.writeFileSync(path.join(binDir, "task.js"), taskJs);

console.log(`generated ${PLATFORMS.length} platform packages + main package`);
