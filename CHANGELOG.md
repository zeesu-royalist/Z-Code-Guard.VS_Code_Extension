# Changelog

All notable changes to Z-Code-Guard are documented in this file.

## [0.2.0] - 2026-10-26

### Upgraded Developer Analysis & Review Suite

- **Detailed Change Explorer:**
  - Integrated Git diff inspection (`git diff -U3` and `git diff --numstat`) collecting line additions (`+X`) and deletions (`-Y`).
  - Added `Z-Code-Guard: View Diff` command opening VS Code's native side-by-side diff editor (`vscode.diff`) against HEAD.
  - Safe handling of untracked files, deleted files, and renames with space-tolerant path parsing.
- **Function & Code-Level Symbol Analysis:**
  - AST-based parser extracting functions, methods, classes, interfaces, type aliases, and React components.
  - Overlap detection matching modified lines from diff hunks to code symbols.
  - Line-level navigation via `Z-Code-Guard: Open File at Line`.
- **Dependency & Impact Analysis:**
  - Workspace-wide reference scanner discovering files importing or referencing changed exported symbols.
  - Evidence-backed categorization: `[verified_import]`, `[test_file]`, and `[heuristic_text]`.
- **Diagnostics & Regression Detection:**
  - Active VS Code diagnostics integration with snapshot baseline recording.
  - Accurate classification of compiler and linter diagnostics into `NEW`, `EXISTING`, and `RESOLVED`.
  - Added `Z-Code-Guard: Record Diagnostics Baseline` command with replacement confirmation.
- **Optional Configuration:**
  - Enabled scanning and review for Git repositories without requiring `.z-code-guard.json`.
  - Added `Z-Code-Guard: Configure Workspace` with interactive presets (Standard Protection, Backend & API, Custom).
- **Evidence-Based Risk Engine:**
  - Configurable heuristic rules: `PROTECTED_BOUNDARY`, `AUTH_CHANGE`, `PERMISSION_CHECK`, `PAYMENT_TRANSACTION`, `SECRETS_OR_ENV`, `DESTRUCTIVE_OPERATION`, `PACKAGE_MANIFEST`, `EXPORTED_SIGNATURE`, and `NEW_DIAGNOSTIC`.
  - Built-in credential masking: secret values are automatically redacted in evidence snippets.
- **Validation Checks Discovery:**
  - Safe discovery of `package.json` scripts (`typecheck`, `lint`, `test`, `build`).
  - On-demand execution with explicit developer confirmation and dedicated Output Channel logging.
- **Review Session Workflow:**
  - Added `Z-Code-Guard: Mark / Unmark as Reviewed` command to track review progress across files in the current IDE session.
- **Test Suite Expansion:**
  - Expanded automated test coverage from 89 to 111 tests across 18 test files.

## [0.1.0] - 2026-10-26

### Initial Release (MVP)

- **Local Git Scanner:** Safe, non-destructive `child_process.execFile` execution discovering staged, unstaged, untracked, deleted, and renamed files via `git status --porcelain=v1 -z`.
- **Protected Paths Configuration:** Project-level `.z-code-guard.json` configuration supporting `protectedPaths` and `excludePaths` with deterministic precedence and overwrite protection.
- **Path Classification:** Glob-matching engine supporting `**`, `*`, `?`, directory prefixes, and case-insensitive cross-platform path normalization.
- **Native Results Tree View:** Activity Bar sidebar container with custom monochrome shield icon, displaying summary headers, collapsible `PROTECTED CHANGES` and `OTHER CHANGES` sections, Git status badges, and interactive file opening.
- **Automatic Event Refresh:** Workspace event listeners for document saves and file creation, deletion, and renaming with a 600ms debounce timer to prevent redundant scans.
- **Commands:** Added `Z-Code-Guard: Scan Workspace` and `Z-Code-Guard: Open Configuration`.
- **Zero-Dependency Runtime:** Completely local-first with zero external network dependencies, no backend, no database, no telemetry, and no AI API requirements.
- **Automated Test Suite:** 89 unit and integration tests covering all parsing, matching, event listening, and error handling behaviors.
