# nmnmcc-task

Repository that auto-mirrors [`go-task/task`](https://github.com/go-task/task)
releases to npm under the `@nmnmcc` scope, using **`optionalDependencies` +
per-platform sub-packages** (the esbuild / swc / biome pattern).

| Package                          | Binary for                |
| -------------------------------- | ------------------------- |
| `@nmnmcc/task`                   | JS launcher (entry point) |
| `@nmnmcc/task-darwin-x64`        | macOS / x64               |
| `@nmnmcc/task-darwin-arm64`      | macOS / arm64             |
| `@nmnmcc/task-freebsd-ia32`      | FreeBSD / 386             |
| `@nmnmcc/task-freebsd-x64`       | FreeBSD / amd64           |
| `@nmnmcc/task-freebsd-arm`       | FreeBSD / arm             |
| `@nmnmcc/task-freebsd-arm64`     | FreeBSD / arm64           |
| `@nmnmcc/task-linux-ia32`        | Linux / 386               |
| `@nmnmcc/task-linux-x64`         | Linux / amd64             |
| `@nmnmcc/task-linux-arm`         | Linux / arm               |
| `@nmnmcc/task-linux-arm64`       | Linux / arm64             |
| `@nmnmcc/task-linux-riscv64`     | Linux / riscv64           |
| `@nmnmcc/task-win32-ia32`        | Windows / 386             |
| `@nmnmcc/task-win32-x64`         | Windows / amd64           |
| `@nmnmcc/task-win32-arm64`       | Windows / arm64           |

End users only `npm i @nmnmcc/task` — npm picks the correct sub-package
through `os` / `cpu` matching on `optionalDependencies`.

## Why mirror

- **No `postinstall`** — works under `npm install --ignore-scripts` (default
  in many corporate CIs).
- **No install-time downloads** — the binary travels through your npm
  registry, so the package can be replicated by any registry mirror
  (`registry.npmmirror.com`, Verdaccio, Artifactory, Nexus, etc.).
- **Smaller blast radius** — sub-package only contains the binary for one
  platform, no JS code is executed at install time, no fetch logic that
  could be hijacked.
- **Provenance** — every publish carries a [Sigstore attestation](https://docs.npmjs.com/generating-provenance-statements)
  linking the npm tarball to the GitHub Actions run that built it.

## How it works

`.github/workflows/sync.yml` runs every 6 hours (and on manual dispatch).
For each run, `scripts/sync.mjs`:

1. Resolves the latest `go-task/task` release tag (or `inputs.version`).
2. Skips if `@nmnmcc/task@<that-version>` is already on the npm registry.
3. Downloads all 6 platform archives + `task_checksums.txt` from the upstream
   GitHub release.
4. Verifies SHA-256 of each archive against `task_checksums.txt`. **Aborts on
   any mismatch.**
5. Extracts each binary into `dist/@nmnmcc_task-<os>-<cpu>/bin/`.
6. Renders each sub-package's `package.json` with the right `os`/`cpu`/version.
7. Renders the main `package.json` with `optionalDependencies` pinned to the
   exact same version.
8. `npm publish --access public --provenance` — sub-packages first, then main.
9. Tags this repo with `v<version>` for traceability.

## Setup (one-time, after pushing this repo to GitHub)

1. Create the GitHub repo (e.g. `nmnmcc/task`) and push.
2. On npmjs.com, configure a **Trusted Publisher** for each of the 15
   packages (`@nmnmcc/task` and the 14 platform sub-packages). For each:
   - npmjs.com → Package settings → "Trusted Publishers" → "Add"
   - Provider: GitHub Actions
   - Repository: `nmnmcc/task`
   - Workflow filename: `sync.yml`
   - Environment: *(leave empty)*

   Trust must be set up **before** the first publish — npm allows
   pre-registering a not-yet-existing package name for trusted publishing.
   No `NPM_TOKEN` secret is ever stored in GitHub.

3. Trigger the workflow once via Actions → "sync upstream" → "Run workflow"
   with empty inputs. It will mirror the latest upstream release.

## Manual operations

- **Mirror a specific upstream version**: workflow_dispatch → set
  `version` to e.g. `3.50.0`.
- **Force a republish** (e.g. after fixing a bug in the launcher): set
  `force: true`.
- **Test the build pipeline without publishing**: set `dry_run: true`.

## Security model

Trust boundary: this mirror only forwards binaries that match upstream's
**own** SHA-256 checksums file (`task_checksums.txt`, signed by the same
GoReleaser run that produced the binaries). The mirror never recompiles or
modifies them. If GitHub Releases or upstream's tag is compromised, the
mismatch will be detected as a checksum failure and publishing aborts.

The mirror's npm packages are signed via npm provenance, so consumers can
verify with:

```sh
npm audit signatures
```

## Local development

```sh
# Dry-run the full pipeline against the latest upstream release.
DRY_RUN=true FORCE=true node scripts/sync.mjs
ls dist/                # produced packages, ready to npm publish
```

## License

MIT (this repository). The mirrored binaries are © The Task authors and
also MIT-licensed. See `LICENSE` for details.
