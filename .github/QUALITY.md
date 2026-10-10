# CI and merge requirements

Development uses `kihon`; both `kihon` and `main` run CI on push and pull requests. `kihon` allows direct pushes. Changes enter `main` through a pull request with the existing review requirements and the required **Quality gate** check. Keep the existing administrator bypass policy; a bypass does not mean CI passed.

| Required job | Acceptance criteria |
| --- | --- |
| Frontend | Module boundaries, unit tests, TypeScript, production assets, all Chromium end-to-end tests using the real Rust/Python backend |
| Backend Rust | rustfmt, Clippy with warnings rejected, parser/contract/task and real Python integration tests |
| Backend Python | Ruff, import-linter, complete geometry regression suite |
| Desktop | Linux, Windows and macOS: relocated standalone worker creates a model and STL; native rustfmt/Clippy/tests pass; Tauri executable, embedded frontend and platform installers build |
| Workflow validation | Pinned actionlint validates workflow syntax and expressions; release artifact tests reject incomplete or mismatched builds |
| Fortran CEA | Linux, Windows and macOS: compile the repository-owned NASA Fortran/C ABI sources and Rust backend, validate contracts and official rocket references, frozen modes, nonconvergence, concurrent requests and relocated CLI; compile the project Fortran design library and verify nozzle/injector references, geometry, C ABI buffers and errors |
| Quality gate | Every required job succeeds, including every desktop and CEA matrix entry; failure, cancellation or skipping rejects the gate |

There are no path filters that omit checks on documentation-only pull requests. Merge-group events run the same checks. Concurrent obsolete runs are cancelled; cancelled runs never satisfy the aggregate gate. CI jobs have read-only repository permission, actions are pinned to commits, dependency lockfiles are honored, and tests do not receive deployment credentials.

In the active `main` ruleset, enable **Require status checks to pass**, select **Quality gate** from GitHub Actions, and require the branch to be up to date before merging. The workflow cannot enable this repository setting. After the first approved push, verify the check exists and the rule is bound to it. Do not represent a local configuration as an active remote requirement.

Use Node 24, the checked-in Rust toolchain, and Python 3.11 in CI. Locally, run `npm run setup:wasm` and `npm run setup:geometry` once, then `npm run check`, `npm run check:geometry`, and the Rust checks documented in the backend instructions. Desktop checks additionally require `npm run build:worker` and `npm run check:worker` before checking and building the separate `desktop/tauri` crate; the reusable core lives in `src-rust` and has no Tauri dependency.

Every job using Rust creates a unique, empty temporary directory for `RUSTUP_HOME` after dependency-cache restoration. It explicitly installs the version from `rust-toolchain.toml` with Clippy and rustfmt, then verifies those tools before running any build. The isolated directory is not cached or reused; installation failures immediately fail the job.

Desktop CI artifacts contain a native executable and its adjacent `geometry` resource directory. They are build validation outputs, not signed or notarized installers. Each artifact contains a tar archive preserving executable permissions and runtime symlinks; extract that archive before manual runs. GUI behavior and OS installers require separate verification; do not infer these passed from compilation.

Never reduce test coverage, bypass boundary rules, mark tests skipped, add `continue-on-error`, or accept unrelated working-directory changes merely to turn CI green. Record pre-existing failures separately and validate the exact candidate commit. Updating a required job name also requires updating the remote rule. Push and merge authorization remain separate from CI results.


## Versioned releases

`.github/workflows/release.yml` runs on pushed `vMAJOR.MINOR.PATCH` tags or demo tags with a minor number padded to two digits, such as `demov0.01.1` for application version `0.1.1`. The demo prefix is a release naming convention; these releases remain normal published releases, not GitHub prereleases. The tag must match `package.json`, `desktop/tauri/tauri.conf.json` and both Rust package versions (`src-rust` and `desktop/tauri`), and its commit must already belong to the remote default branch. Update the application version and its lockfile entries through a reviewed PR before tagging. Creating or pushing a tag still requires the normal explicit push authorization.

Release reuses the entire CI workflow at the tagged commit. Normal branch/PR CI also builds installers so packaging failures block the existing Quality gate before integration. All three desktop jobs, backend/frontend tests and workflow checks must succeed before publication; only the final publication job gets `contents: write`. Builds and tests do not receive a release token.

| Platform | Release assets |
| --- | --- |
| Windows x64 | NSIS `-setup.exe` |
| macOS Apple Silicon / arm64 | `.dmg` (ad-hoc signed; no Apple Developer signing or notarization) |
| Linux x64 | `.deb` and `.AppImage`, built on Ubuntu 24.04 |

The Linux baseline is Ubuntu 24.04 or a compatible system; this does not promise support for older glibc distributions. Intel macOS and ARM Windows/Linux are not part of this matrix. Signing with publisher certificates and in-app updating are separate work.

`scripts/release-assets.mjs` is a build adapter invoked through its CLI. It collects exactly the expected Tauri installers and records SHA-256, platform, application version and source commit. The publishing job downloads only artifacts from its own workflow run, rejects missing/duplicate/empty/modified files or mismatched versions/commits, and emits `SHA256SUMS` plus `release-manifest.json`. It uploads the complete set to a draft and only then publishes it. Failed uploads leave a draft that a rerun can finish; a published version is never overwritten. Use a new version tag for subsequent releases. Run `node --test scripts/release-assets.check.mjs` to exercise this boundary with temporary files.

Release notes include `.github/RELEASE-NOTES.md` and GitHub-generated changes. A new workflow is only configured locally until the approved commit reaches the remote; three-platform installer construction and Release publication must be verified by the actual hosted run. Do not claim those actions completed from local checks alone.


### Linux AppImage geometry runtime

The standalone Python worker sets its own library search path at startup. `linuxdeploy` instead inspects each ELF file directly, including private Shapely/GEOS and NumPy libraries inside the worker. The Linux installer step prepends the bundled worker's `_internal` directory to `LD_LIBRARY_PATH` for that build process only. It does not install a substitute system GEOS or change the application protocol. Existing binary stripping remains enabled.

After AppImage creation, CI extracts the final image and runs the existing relocated-worker model/STL check against its embedded geometry directory. A missing library, corrupted worker or failed model remains a hard failure. Verbose desktop build logs are retained as artifacts on installer failure.
