#!/usr/bin/env node
// Sync go-task/task release into @nmnmcc/task and platform sub-packages.
//
// Required env:
//   NODE_AUTH_TOKEN     npm token with publish rights to @nmnmcc/*
//                       (only needed when actually publishing).
// Optional env:
//   GH_TOKEN            GitHub token for higher API rate limits.
//   INPUT_VERSION       Upstream version to mirror (e.g. "3.50.0" or "v3.50.0").
//                       Empty -> latest.
//   FORCE               "true" to republish even if version exists on npm.
//   DRY_RUN             "true" to build but skip `npm publish`.
//   GITHUB_REPOSITORY   "owner/repo" for the mirror, used in package metadata.
//   GITHUB_OUTPUT       GitHub Actions output file (set automatically).

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BUILD = path.join(ROOT, "build");
const DIST = path.join(ROOT, "dist");

// Mirrors every binary platform produced by upstream go-task/task.
// Mapping: upstream goos/goarch -> Node process.platform/process.arch.
const PLATFORMS = [
  { os: "darwin",  cpu: "x64",     upstream: "darwin_amd64",   format: "tar.gz" },
  { os: "darwin",  cpu: "arm64",   upstream: "darwin_arm64",   format: "tar.gz" },
  { os: "freebsd", cpu: "ia32",    upstream: "freebsd_386",    format: "tar.gz" },
  { os: "freebsd", cpu: "x64",     upstream: "freebsd_amd64",  format: "tar.gz" },
  { os: "freebsd", cpu: "arm",     upstream: "freebsd_arm",    format: "tar.gz" },
  { os: "freebsd", cpu: "arm64",   upstream: "freebsd_arm64",  format: "tar.gz" },
  { os: "linux",   cpu: "ia32",    upstream: "linux_386",      format: "tar.gz" },
  { os: "linux",   cpu: "x64",     upstream: "linux_amd64",    format: "tar.gz" },
  { os: "linux",   cpu: "arm",     upstream: "linux_arm",      format: "tar.gz" },
  { os: "linux",   cpu: "arm64",   upstream: "linux_arm64",    format: "tar.gz" },
  { os: "linux",   cpu: "riscv64", upstream: "linux_riscv64",  format: "tar.gz" },
  { os: "win32",   cpu: "ia32",    upstream: "windows_386",    format: "zip"    },
  { os: "win32",   cpu: "x64",     upstream: "windows_amd64",  format: "zip"    },
  { os: "win32",   cpu: "arm64",   upstream: "windows_arm64",  format: "zip"    },
];

const SCOPE = "@nmnmcc";
const MAIN_PKG = `${SCOPE}/task`;
const platPkg = (p) => `${SCOPE}/task-${p.os}-${p.cpu}`;
const archiveName = (p) => `task_${p.upstream}.${p.format}`;
const exeName = (p) => (p.os === "win32" ? "task.exe" : "task");
const safeDir = (pkg) => pkg.replace(/[/@]/g, "_");

// ---------- helpers ----------
function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} -> exit ${r.status}`);
  }
}

async function ghJson(url) {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "nmnmcc-task-sync",
  };
  if (process.env.GH_TOKEN) headers.authorization = `Bearer ${process.env.GH_TOKEN}`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status} ${r.statusText}`);
  return r.json();
}

async function ghDownload(url, dest) {
  const headers = { "user-agent": "nmnmcc-task-sync" };
  if (process.env.GH_TOKEN) headers.authorization = `Bearer ${process.env.GH_TOKEN}`;
  const r = await fetch(url, { headers, redirect: "follow" });
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status} ${r.statusText}`);
  const buf = Buffer.from(await r.arrayBuffer());
  await fs.writeFile(dest, buf);
}

const sha256 = (filepath) =>
  crypto.createHash("sha256").update(fsSync.readFileSync(filepath)).digest("hex");

async function setOutput(key, value) {
  console.log(`output: ${key}=${value}`);
  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
}

function repoUrl() {
  return process.env.GITHUB_REPOSITORY
    ? `git+https://github.com/${process.env.GITHUB_REPOSITORY}.git`
    : "git+https://github.com/nmnmcc/task.git";
}

// ---------- step 1: resolve upstream version ----------
async function resolveVersion() {
  let raw = (process.env.INPUT_VERSION || "").trim();
  if (!raw) {
    const rel = await ghJson("https://api.github.com/repos/go-task/task/releases/latest");
    raw = rel.tag_name;
  }
  const version = raw.replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version)) {
    throw new Error(`bad upstream version: ${raw}`);
  }
  return version;
}

// ---------- step 2: skip if already on npm ----------
async function alreadyPublished(version) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(MAIN_PKG)}/${version}`;
  const r = await fetch(url, { headers: { "user-agent": "nmnmcc-task-sync" } });
  if (r.status === 404) return false;
  if (r.ok) return true;
  throw new Error(`npm registry check -> ${r.status} ${r.statusText}`);
}

// ---------- step 3: download + verify ----------
function parseChecksums(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([0-9a-f]{64})\s+\*?(.+?)\s*$/i);
    if (m) out[m[2].trim()] = m[1].toLowerCase();
  }
  return out;
}

async function downloadArchives(version) {
  await fs.rm(BUILD, { recursive: true, force: true });
  await fs.mkdir(BUILD, { recursive: true });

  const baseUrl = `https://github.com/go-task/task/releases/download/v${version}`;
  const checksumsPath = path.join(BUILD, "task_checksums.txt");
  console.log(`download task_checksums.txt`);
  await ghDownload(`${baseUrl}/task_checksums.txt`, checksumsPath);
  const checksums = parseChecksums(await fs.readFile(checksumsPath, "utf8"));

  for (const p of PLATFORMS) {
    const name = archiveName(p);
    const dest = path.join(BUILD, name);
    console.log(`download ${name}`);
    await ghDownload(`${baseUrl}/${name}`, dest);
    const expect = checksums[name];
    if (!expect) {
      throw new Error(`no checksum for ${name} in task_checksums.txt`);
    }
    const got = sha256(dest);
    if (got !== expect) {
      throw new Error(`sha256 mismatch for ${name}: expected ${expect}, got ${got}`);
    }
    console.log(`  sha256 ok ${expect}`);
  }
}

// ---------- step 4: build packages ----------
async function buildPackages(version) {
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });

  for (const p of PLATFORMS) {
    const archive = path.join(BUILD, archiveName(p));
    const pkgName = platPkg(p);
    const pkgDir = path.join(DIST, safeDir(pkgName));
    const binDir = path.join(pkgDir, "bin");
    await fs.mkdir(binDir, { recursive: true });

    if (p.format === "tar.gz") {
      sh("tar", ["-xzf", archive, "-C", binDir, exeName(p)]);
    } else {
      // -j: junk paths (flat extract); -o: overwrite without prompt
      sh("unzip", ["-j", "-o", archive, exeName(p), "-d", binDir]);
    }

    if (p.os !== "win32") {
      await fs.chmod(path.join(binDir, exeName(p)), 0o755);
    }

    const pj = {
      name: pkgName,
      version,
      description: `task binary for ${p.os}-${p.cpu}, mirrored from go-task/task v${version}`,
      license: "MIT",
      repository: { type: "git", url: repoUrl() },
      homepage: "https://taskfile.dev",
      os: [p.os],
      cpu: [p.cpu],
      files: ["bin/", "LICENSE"],
      preferUnplugged: true,
    };
    await fs.writeFile(path.join(pkgDir, "package.json"), JSON.stringify(pj, null, 2) + "\n");
    await fs.copyFile(path.join(ROOT, "LICENSE"), path.join(pkgDir, "LICENSE"));
  }

  // Main package
  const mainDir = path.join(DIST, safeDir(MAIN_PKG));
  await fs.mkdir(path.join(mainDir, "bin"), { recursive: true });
  await fs.copyFile(
    path.join(ROOT, "templates/main/bin/task.js"),
    path.join(mainDir, "bin/task.js"),
  );
  await fs.chmod(path.join(mainDir, "bin/task.js"), 0o755);
  await fs.copyFile(
    path.join(ROOT, "templates/main/README.md"),
    path.join(mainDir, "README.md"),
  );
  await fs.copyFile(path.join(ROOT, "LICENSE"), path.join(mainDir, "LICENSE"));

  const optionalDependencies = Object.fromEntries(
    PLATFORMS.map((p) => [platPkg(p), version]),
  );

  const pj = {
    name: MAIN_PKG,
    version,
    description:
      "Unofficial npm mirror of go-task/task using optionalDependencies — no postinstall, mirrorable, with provenance.",
    license: "MIT",
    repository: { type: "git", url: repoUrl() },
    homepage: "https://taskfile.dev",
    bin: { task: "bin/task.js" },
    files: ["bin/", "README.md", "LICENSE"],
    engines: { node: ">=16" },
    keywords: ["task", "taskfile", "build-tool", "task-runner", "mirror"],
    optionalDependencies,
  };
  await fs.writeFile(path.join(mainDir, "package.json"), JSON.stringify(pj, null, 2) + "\n");
}

// ---------- step 5: publish ----------
function publishPackage(dir) {
  // --provenance attaches a Sigstore attestation linking the npm package to
  // this GitHub Actions run, so consumers can verify the supply chain.
  sh("npm", ["publish", "--access", "public", "--provenance"], { cwd: dir });
}

function publishAll() {
  // Sub-packages first; otherwise the main package's optionalDependencies
  // would resolve to versions that don't yet exist on the registry.
  for (const p of PLATFORMS) {
    publishPackage(path.join(DIST, safeDir(platPkg(p))));
  }
  publishPackage(path.join(DIST, safeDir(MAIN_PKG)));
}

// ---------- main ----------
async function main() {
  const version = await resolveVersion();
  console.log(`upstream version: ${version}`);
  await setOutput("version", version);

  const force = process.env.FORCE === "true";
  if (!force && (await alreadyPublished(version))) {
    console.log(`@nmnmcc/task@${version} already published — nothing to do.`);
    await setOutput("skip", "true");
    return;
  }
  await setOutput("skip", "false");

  await downloadArchives(version);
  await buildPackages(version);

  if (process.env.DRY_RUN === "true") {
    console.log("DRY_RUN=true — built ./dist but skipped npm publish.");
    return;
  }
  publishAll();
  console.log(`published ${MAIN_PKG}@${version} and ${PLATFORMS.length} sub-packages.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
