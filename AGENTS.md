# Project instructions

Apply the code-boundary-standards skill for code changes. See README.md for module ownership.
Frontend features live in src/features; each feature exposes only root entry points. lib/ is private.
Features must not depend on other features. app/ orchestrates them. Domain has no UI or platform imports.
Only platform/desktop may integrate Tauri or browser I/O. Python owns numerical geometry; Rust owns desktop operations.
Run npm run check. Do not present example geometry or example toolpaths as parsed user data or production G-code.
