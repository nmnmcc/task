# @nmnmcc/task

Unofficial npm mirror of [go-task/task](https://github.com/go-task/task) — a
fast, cross-platform build tool inspired by Make.

This package distributes the `task` binary through **per-platform sub-packages
selected via `optionalDependencies`**, so:

- No `postinstall` script runs at install time.
- No download from any third party at install time — the binary comes
  straight from your npm registry (or any mirror of it).
- Only the binary for your platform is fetched.
- Each release is published with [npm provenance](https://docs.npmjs.com/generating-provenance-statements),
  so you can verify the package was built by this repo's GitHub Actions run.

## Install

```sh
npm i -g @nmnmcc/task
# or per-project
npm i -D @nmnmcc/task
```

Then:

```sh
task --version
```

## Supported platforms

Fully aligned with upstream `go-task/task` releases.

| OS      | Arch    | Sub-package                      |
| ------- | ------- | -------------------------------- |
| macOS   | x64     | `@nmnmcc/task-darwin-x64`        |
| macOS   | arm64   | `@nmnmcc/task-darwin-arm64`      |
| FreeBSD | 386     | `@nmnmcc/task-freebsd-ia32`      |
| FreeBSD | amd64   | `@nmnmcc/task-freebsd-x64`       |
| FreeBSD | arm     | `@nmnmcc/task-freebsd-arm`       |
| FreeBSD | arm64   | `@nmnmcc/task-freebsd-arm64`     |
| Linux   | 386     | `@nmnmcc/task-linux-ia32`        |
| Linux   | amd64   | `@nmnmcc/task-linux-x64`         |
| Linux   | arm     | `@nmnmcc/task-linux-arm`         |
| Linux   | arm64   | `@nmnmcc/task-linux-arm64`       |
| Linux   | riscv64 | `@nmnmcc/task-linux-riscv64`     |
| Windows | 386     | `@nmnmcc/task-win32-ia32`        |
| Windows | amd64   | `@nmnmcc/task-win32-x64`         |
| Windows | arm64   | `@nmnmcc/task-win32-arm64`       |

## Versioning

Versions track upstream 1:1 — `@nmnmcc/task@3.50.0` ships the `task` binary
from `go-task/task` `v3.50.0`. The mirror sync runs every 6 hours.

## Relationship to upstream

This is an **unofficial** mirror maintained for cases where:

- The official `@go-task/cli` cannot be used because `postinstall` is disabled
  in your environment (e.g. `npm install --ignore-scripts` is enforced).
- You install from a private npm registry / mirror that cannot reach GitHub
  Releases.
- You want a tighter supply-chain story (provenance, no install-time network
  calls, no install-time code execution).

If none of these apply to you, prefer the official package
[`@go-task/cli`](https://www.npmjs.com/package/@go-task/cli).

## License

MIT. The mirrored binaries are © The Task authors and are also MIT-licensed.
See `LICENSE` for details.
