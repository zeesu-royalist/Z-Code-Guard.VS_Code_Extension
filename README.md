<p align="center">
  <img src="resources/logo.png" alt="Z-Code-Guard Logo" width="340" />
</p>

<h1 align="center">Z-Code-Guard</h1>

<p align="center">
  <strong>A free, local-first VS Code extension that explains code changes, detects regressions, evaluates risks, investigates dependencies, and protects important code boundaries.</strong>
</p>

<p align="center">
  Developed by <strong><a href="https://zeesu-royalist.vercel.app">Zeesu Royalist</a></strong>
</p>

Z-Code-Guard transforms code review inside VS Code for both human-written and AI-generated modifications. Rather than simply listing files that were touched, Z-Code-Guard answers the crucial questions developers ask before accepting changes:

1. **What changed?** (Added/deleted line counts, unified diffs, modified hunks)
2. **Which code symbols changed?** (Functions, methods, classes, interfaces, React components, and exports)
3. **What might be affected?** (Downstream callers, importing modules, and test files)
4. **Did new errors appear?** (Diagnostics comparison against your recorded baseline: new, pre-existing, and resolved errors)
5. **Are there potential risks?** (Evidence-based rules for auth, permissions, payment calls, environment access, and destructive operations)
6. **Is this within a protected boundary?** (Configured protection rules for core business logic)

---

## Core Promises & Privacy

- **100% Free & Local-First:** No accounts, subscriptions, license keys, paid APIs, remote servers, or cloud databases.
- **Privacy by Default:** Zero network requests, zero telemetry, zero analytics. Your source code, diffs, diagnostics, and file paths never leave your machine.
- **Safe & Non-Destructive:** Uses read-only Git status and diff queries (`git status`, `git diff -U3`, `git diff --numstat`) via `child_process.execFile` with explicit argument arrays. Never commits, stages, reverts, or alters your code.
- **Useful Without Configuration:** Works immediately in any Git repository without requiring `.z-code-guard.json`. Optional configuration allows defining custom protection rules and exclusions.
- **Evidence-Based & Transparent:** Distinguishes confirmed observations from heuristic findings. Never exposes secret values in the UI. Does not claim guaranteed detection of every regression or bug.

---

## Prerequisites

- **VS Code:** Version `^1.85.0` or compatible editor.
- **Git CLI:** Must be installed and available on your system `PATH` (`git --version`).

---

## Installation

### From Local `.vsix` Package

1. Package the extension:
   ```bash
   npm run package
   ```
2. Install via the VS Code command line:
   ```bash
   code --install-extension z-code-guard-0.2.0.vsix
   ```
3. Or inside VS Code:
   - Open the **Extensions** view (<kbd>Ctrl+Shift+X</kbd> / <kbd>Cmd+Shift+X</kbd>).
   - Click **...** (Views and More Actions) in the top right.
   - Select **Install from VSIX...** and choose `z-code-guard-0.2.0.vsix`.

---

## Features

### 1. Detailed Change Explorer
- Inspects added, modified, deleted, renamed, and untracked files with Git status badges (`[staged]`, `[unstaged]`, `[untracked]`, `[renamed]`, `[deleted]`).
- Displays exact added (`+X`) and deleted (`-Y`) line counts per file.
- Built-in **View Diff** action opens VS Code's native side-by-side diff viewer (`vscode.diff`) against `HEAD` or index.
- Handles untracked files, deleted files, and renames gracefully.

### 2. Function & Symbol-Level Change Analysis
- Automatically detects which specific functions, methods, classes, interfaces, type aliases, and React components overlap with changed line ranges.
- Highlights exported declarations and signature changes.
- Click any symbol in the tree view to navigate directly to its starting line in the editor.

### 3. Dependency & Impact Analysis
- Identifies other workspace files that import or reference changed exported symbols.
- Categorizes relationships with clear evidence:
  - `[verified]`: Explicit `import` or `require` of the changed module or symbol.
  - `[test]`: Automated test files referencing the modified code.
  - `[heuristic]`: Text-level symbol references in other project files.
- Safe file-system traversal respects `node_modules`, `dist`, `coverage`, and `.git` ignores.

### 4. Diagnostics & Regression Detection
- Integrates with active VS Code diagnostics (TypeScript compiler, ESLint, language servers).
- **Record Baseline** command snapshots the current error state.
- Accurately classifies diagnostics:
  - **NEW:** Errors or warnings introduced after the recorded baseline.
  - **EXISTING:** Pre-existing compiler diagnostics.
  - **RESOLVED:** Diagnostics from the baseline that have been resolved.
- Click any diagnostic item to jump directly to the offending line and column.

### 5. Evidence-Based Risk Engine
- Rule-based analysis inspects actual changed diff lines and symbols:
  - `PROTECTED_BOUNDARY`: Changes inside your configured protected paths.
  - `AUTH_CHANGE`: Modifications to authentication, JWT, token, or password logic.
  - `PERMISSION_CHECK`: Alterations to role checks and access-control conditions.
  - `PAYMENT_TRANSACTION`: Code initiating payments or gateway transactions.
  - `SECRETS_OR_ENV`: Environment variable access or credential patterns. **Secret values are automatically masked and redacted in evidence snippets.**
  - `DESTRUCTIVE_OPERATION`: Patterns like `DROP TABLE`, `rmSync`, `unlinkSync`, or `eval`.
  - `PACKAGE_MANIFEST`: Dependency or script changes in `package.json`.
  - `EXPORTED_SIGNATURE`: Public API signature changes.
  - `NEW_DIAGNOSTIC`: Compiler or linter errors introduced on changed lines.

### 6. Discovered Validation Checks
- Automatically discovers project validation scripts (`typecheck`, `lint`, `test`, `build`) from `package.json`.
- **Never executes scripts automatically or silently.**
- Click any check to run it on-demand with explicit confirmation, logging progress and output to a dedicated Output Channel.

### 7. Review Session Workflow
- Mark files as **Reviewed** for the current session.
- Track review progress across protected and other changes.
- Review status is kept in-memory and never modifies source files.

---

## Configuration (`.z-code-guard.json`)

Configuration is **optional**. If `.z-code-guard.json` does not exist, Z-Code-Guard operates in default monitoring mode, displaying all changes, line statistics, diffs, symbol analysis, and diagnostics.

### Setup & Presets

Run **`Z-Code-Guard: Configure Workspace`** from the Command Palette to select from standard presets:
- **Standard Protection:** `src/auth/**`, `src/services/**`, `src/business-logic/**`
- **Backend & API:** `src/api/**`, `src/db/**`, `src/controllers/**`
- **Custom Starter:** Empty starter configuration to customize.

Existing configurations are **never overwritten**.

### Configuration Schema

```json
{
  "version": 1,
  "protectedPaths": [
    "src/auth/**",
    "src/services/**",
    "src/business-logic/**"
  ],
  "excludePaths": [
    "node_modules/**",
    "dist/**",
    "coverage/**"
  ]
}
```

### Pattern Precedence
- **Exclusion Precedence:** Any path matching `excludePaths` is completely omitted from scan results and will **never be reported as protected**.
- **Globstar (`**`):** Matches across directory levels recursively.
- **Renames:** When a file is renamed, both original and new paths are evaluated.

---

## Registered Commands

| Command | Title | Description |
| :--- | :--- | :--- |
| `z-code-guard.scanWorkspace` | **Scan Workspace** | Refreshes workspace changes, diffs, and risk analysis. |
| `z-code-guard.scanWorkspaceUnconfigured` | **Scan Workspace (Unconfigured)** | Scans without requiring `.z-code-guard.json`. |
| `z-code-guard.viewDiff` | **View Diff** | Opens side-by-side diff in the editor against `HEAD`. |
| `z-code-guard.recordBaseline` | **Record Diagnostics Baseline** | Snapshots active diagnostics to detect subsequent regressions. |
| `z-code-guard.configureWorkspace` | **Configure Workspace** | Interactive setup with protection rule presets. |
| `z-code-guard.openConfiguration` | **Open Configuration** | Opens `.z-code-guard.json` in the editor. |
| `z-code-guard.toggleReviewed` | **Mark / Unmark as Reviewed** | Toggles file review status for current session. |
| `z-code-guard.openAtLine` | **Open at Line** | Opens file and reveals specific line. |
| `z-code-guard.runCheck` | **Run Project Check** | Runs discovered validation script with confirmation. |

---

## Local Development & Testing

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Run complete test suite (111 tests)
npm run test

# Package VSIX
npm run package
```

### Automated Test Coverage (111 Tests)
- **Unit Tests:** Git status parser, Git diff scanner, hunk parser, numstat parser, path matcher, configuration reader, symbol analyzer, impact analyzer, diagnostics tracker, risk engine with secret redaction, project checks discovery, review manager, debounce utility, and Results Tree View builder.
- **Integration Tests:** 15 end-to-end integration tests using isolated temporary Git repositories covering staged/unstaged changes, untracked files, deletions, renames with spaces, exclusions precedence, automatic refresh, and debouncing.

---

## What Z-Code-Guard Does NOT Do

- **No Active Blocking:** Z-Code-Guard reports modifications after they occur; it does not intercept editor keystrokes or prevent file saves.
- **No Guaranteed Safety:** Zero risk findings does not mean code is guaranteed bug-free or secure. Static analysis relies on heuristics and visible syntax.
- **No Automatic File Edits:** The extension never commits, stages, reverts, formats, or alters your code files automatically.
- **No Remote Telemetry:** No user data or code snippets are ever transmitted outside your local machine.

---

## Author & Developer

**Zeesu Royalist**
- Website: [zeesu-royalist.vercel.app](https://zeesu-royalist.vercel.app)
- GitHub: [@zeesu-royalist](https://github.com/zeesu-royalist)

---

## License

This project is licensed under the [MIT License](LICENSE) — Copyright (c) 2026 [Zeesu Royalist](https://zeesu-royalist.vercel.app).
