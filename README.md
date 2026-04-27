# @nmnmcc/task

Unofficial npm mirror of [`go-task/task`](https://github.com/go-task/task).

```sh
npm i @nmnmcc/task
npx task --version
```

npm picks the right binary via `optionalDependencies` (`os`/`cpu` matching),
the same pattern used by esbuild, swc, and biome.

## Why

- **No `postinstall`** — works with `--ignore-scripts`.
- **No install-time downloads** — binaries ship through npm, so any registry
  mirror (npmmirror, Verdaccio, Artifactory, Nexus) can replicate them.
- **Provenance** — every publish carries a [Sigstore attestation](https://docs.npmjs.com/generating-provenance-statements).
- **Verified** — each binary's SHA-256 is checked against upstream's
  `task_checksums.txt` before publish; any mismatch aborts the run.

## Supported platforms

`darwin`, `linux`, `freebsd`, `win32` × `x64`, `arm64`, `ia32`, `arm`,
`riscv64` (where upstream provides a build).

## Verifying

```sh
npm audit signatures
```

## License

MIT. Mirrored binaries © The Task authors, also MIT.
