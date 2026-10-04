# CI and merge requirements

Development uses `kihon`; both `kihon` and `main` run CI on push and pull requests. `kihon` allows direct pushes. Changes enter `main` through a pull request with the existing review requirements and the required **Quality gate** check. Keep the existing administrator bypass policy; a bypass does not mean CI passed.

| Required job | Acceptance criteria |
| --- | --- |
| Frontend | Module boundaries, unit tests, TypeScript, production assets, all Chromium end-to-end tests using the real Rust/Python backend |
| Backend Rust | rustfmt, Clippy with warnings rejected, parser/contract/task and real Python integration tests |
| Backend Python | Ruff, import-linter, complete geometry regression suite |
| Desktop | Linux, Windows and macOS: relocated standalone worker creates a model and STL; native Clippy/tests pass; Tauri executable and embedded frontend build |
| Workflow validation | Pinned actionlint validates workflow syntax and expressions |
| Quality gate | Every required job succeeds, including every desktop matrix entry; failure, cancellation or skipping rejects the gate |

There are no path filters that omit checks on documentation-only pull requests. Merge-group events run the same checks. Concurrent obsolete runs are cancelled; cancelled runs never satisfy the aggregate gate. GitHub Actions has read-only repository permission, actions are pinned to commits, dependency lockfiles are honored, and tests do not receive deployment credentials.

In the active `main` ruleset, enable **Require status checks to pass**, select **Quality gate** from GitHub Actions, and require the branch to be up to date before merging. The workflow cannot enable this repository setting. After the first approved push, verify the check exists and the rule is bound to it. Do not represent a local configuration as an active remote requirement.

Use Node 24, the checked-in Rust toolchain, and Python 3.11 in CI. Locally, run `npm run setup:wasm` and `npm run setup:geometry` once, then `npm run check`, `npm run check:geometry`, and the Rust checks documented in the backend instructions. Desktop checks additionally require `npm run build:worker` and `npm run check:worker` before building with the `desktop` feature.

Desktop CI artifacts contain a native executable and its adjacent `geometry` resource directory. They are build validation outputs, not signed or notarized installers. Each artifact contains a tar archive preserving executable permissions and runtime symlinks; extract that archive before manual runs. GUI behavior and OS installers require separate verification; do not infer these passed from compilation.

Never reduce test coverage, bypass boundary rules, mark tests skipped, add `continue-on-error`, or accept unrelated working-directory changes merely to turn CI green. Record pre-existing failures separately and validate the exact candidate commit. Updating a required job name also requires updating the remote rule. Push and merge authorization remain separate from CI results.
