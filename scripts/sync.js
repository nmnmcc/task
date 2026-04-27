#!/usr/bin/env node
import { $, fs, path } from "zx";
import crypto from "node:crypto";
import { Octokit } from "octokit";

const ROOT = path.resolve(import.meta.dirname, "..");
const PACKAGES = path.join(ROOT, "packages");
const BUILD = path.join(ROOT, "build");
const DIST = path.join(ROOT, "dist");

const octokit = new Octokit({ auth: process.env.GH_TOKEN });

const PLATFORMS = [
  { os: "darwin", cpu: "x64", upstream: "darwin_amd64", format: "tar.gz" },
  { os: "darwin", cpu: "arm64", upstream: "darwin_arm64", format: "tar.gz" },
  { os: "freebsd", cpu: "ia32", upstream: "freebsd_386", format: "tar.gz" },
  { os: "freebsd", cpu: "x64", upstream: "freebsd_amd64", format: "tar.gz" },
  { os: "freebsd", cpu: "arm", upstream: "freebsd_arm", format: "tar.gz" },
  { os: "freebsd", cpu: "arm64", upstream: "freebsd_arm64", format: "tar.gz" },
  { os: "linux", cpu: "ia32", upstream: "linux_386", format: "tar.gz" },
  { os: "linux", cpu: "x64", upstream: "linux_amd64", format: "tar.gz" },
  { os: "linux", cpu: "arm", upstream: "linux_arm", format: "tar.gz" },
  { os: "linux", cpu: "arm64", upstream: "linux_arm64", format: "tar.gz" },
  { os: "linux", cpu: "riscv64", upstream: "linux_riscv64", format: "tar.gz" },
  { os: "win32", cpu: "ia32", upstream: "windows_386", format: "zip" },
  { os: "win32", cpu: "x64", upstream: "windows_amd64", format: "zip" },
  { os: "win32", cpu: "arm64", upstream: "windows_arm64", format: "zip" },
];

const SCOPE = "@nmnmcc";
const MAIN_PKG = `${SCOPE}/task`;
const getPlatPkg = (p) => `${SCOPE}/task-${p.os}-${p.cpu}`;
const getArchiveName = (p) => `task_${p.upstream}.${p.format}`;
const getExeName = (p) => (p.os === "win32" ? "task.exe" : "task");
const sanitizeDir = (pkg) => pkg.replace(/[/@]/g, "_");

const download = async (url, dest) => {
  const r = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "nmnmcc-task-sync" },
  });
  if (!r.ok) {
    throw new Error(`download ${url} -> ${r.status} ${r.statusText}`);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  await fs.writeFile(dest, buf);
}

const hashFile = async (filepath) =>
  crypto
    .createHash("sha256")
    .update(await fs.readFile(filepath))
    .digest("hex");

const emitGitHubOutput = async (key, value) => {
  console.log(`output: ${key}=${value}`);
  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
}

const resolveVersion = async () => {
  let raw = (process.env.INPUT_VERSION || "").trim();
  if (!raw) {
    const { data: rel } = await octokit.rest.repos.getLatestRelease({
      owner: "go-task",
      repo: "task",
    });
    raw = rel.tag_name;
  }
  const version = raw.replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version)) {
    throw new Error(`bad upstream version: ${raw}`);
  }
  return version;
}

const isPublished = async (version) => {
  const url = `https://registry.npmjs.org/${encodeURIComponent(MAIN_PKG)}/${version}`;
  const r = await fetch(url, { headers: { "user-agent": "nmnmcc-task-sync" } });
  if (r.status === 404) return false;
  if (r.ok) return true;
  throw new Error(`npm registry check -> ${r.status} ${r.statusText}`);
}

const parseChecksums = (text) => {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([0-9a-f]{64})\s+\*?(.+?)\s*$/i);
    if (m) out[m[2].trim()] = m[1].toLowerCase();
  }
  return out;
}

const downloadArchives = async (version) => {
  await fs.rm(BUILD, { recursive: true, force: true });
  await fs.mkdir(BUILD, { recursive: true });

  const baseUrl = `https://github.com/go-task/task/releases/download/v${version}`;
  const checksumsPath = path.join(BUILD, "task_checksums.txt");
  console.log(`download task_checksums.txt`);
  await download(`${baseUrl}/task_checksums.txt`, checksumsPath);
  const checksums = parseChecksums(await fs.readFile(checksumsPath, "utf8"));

  for (const p of PLATFORMS) {
    const name = getArchiveName(p);
    const dest = path.join(BUILD, name);
    console.log(`download ${name}`);
    await download(`${baseUrl}/${name}`, dest);
    const expect = checksums[name];
    if (!expect) {
      throw new Error(`no checksum for ${name} in task_checksums.txt`);
    }
    const got = await hashFile(dest);
    if (got !== expect) {
      throw new Error(
        `sha256 mismatch for ${name}: expected ${expect}, got ${got}`,
      );
    }
    console.log(`  sha256 ok ${expect}`);
  }
}

const updateVersion = async (pjPath, version) => {
  const pj = JSON.parse(await fs.readFile(pjPath, "utf8"));
  pj.version = version;
  if (pj.optionalDependencies) {
    for (const dep of Object.keys(pj.optionalDependencies)) {
      pj.optionalDependencies[dep] = version;
    }
  }
  await fs.writeFile(pjPath, JSON.stringify(pj, null, 2) + "\n");
}

const buildPackages = async (version) => {
  await fs.rm(DIST, { recursive: true, force: true });

  for (const p of PLATFORMS) {
    const pkgName = getPlatPkg(p);
    const srcDir = path.join(PACKAGES, `task-${p.os}-${p.cpu}`);
    const destDir = path.join(DIST, sanitizeDir(pkgName));

    await fs.cp(srcDir, destDir, { recursive: true });
    await updateVersion(path.join(destDir, "package.json"), version);

    const archive = path.join(BUILD, getArchiveName(p));
    const binDir = path.join(destDir, "bin");
    await fs.mkdir(binDir, { recursive: true });

    if (p.format === "tar.gz") {
      await $`tar -xzf ${archive} -C ${binDir} ${getExeName(p)}`;
    } else {
      await $`unzip -j -o ${archive} ${getExeName(p)} -d ${binDir}`;
    }

    if (p.os !== "win32") {
      await fs.chmod(path.join(binDir, getExeName(p)), 0o755);
    }

    await fs.copyFile(
      path.join(ROOT, "LICENSE"),
      path.join(destDir, "LICENSE"),
    );
  }

  const mainSrcDir = path.join(PACKAGES, "task");
  const mainDestDir = path.join(DIST, sanitizeDir(MAIN_PKG));

  await fs.cp(mainSrcDir, mainDestDir, { recursive: true });
  await updateVersion(path.join(mainDestDir, "package.json"), version);
  await fs.chmod(path.join(mainDestDir, "bin/task.js"), 0o755);
  await fs.copyFile(
    path.join(ROOT, "LICENSE"),
    path.join(mainDestDir, "LICENSE"),
  );
}

const publishAll = async () => {
  for (const p of PLATFORMS) {
    await $({
      cwd: path.join(DIST, sanitizeDir(getPlatPkg(p))),
    })`npm publish --access public --provenance`;
  }
  await $({
    cwd: path.join(DIST, sanitizeDir(MAIN_PKG)),
  })`npm publish --access public --provenance`;
}

const run = async () => {
  const version = await resolveVersion();
  console.log(`upstream version: ${version}`);
  await emitGitHubOutput("version", version);

  const force = process.env.FORCE === "true";
  if (!force && (await isPublished(version))) {
    console.log(`@nmnmcc/task@${version} already published — nothing to do.`);
    await emitGitHubOutput("skip", "true");
    return;
  }
  await emitGitHubOutput("skip", "false");

  await downloadArchives(version);
  await buildPackages(version);

  if (process.env.DRY_RUN === "true") {
    console.log("DRY_RUN=true — built ./dist but skipped npm publish.");
    return;
  }
  await publishAll();
  console.log(
    `published ${MAIN_PKG}@${version} and ${PLATFORMS.length} sub-packages.`,
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
