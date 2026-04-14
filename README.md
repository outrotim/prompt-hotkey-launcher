# PromptBar

PromptBar is a desktop app built with Electron. It behaves like an input-method-style prompt launcher:

- `Control + Q` toggles the floating popup by default
- search prompts from Markdown files in `prompts/`
- arrow keys, number keys, or Enter select a prompt
- variables are filled inline before insertion
- selected content is pasted into the previously focused app

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Package

```bash
npm run dist:share
```

This creates an unsigned share build in `release/`:

- `PromptBar-<version>-arm64.dmg`
- `PromptBar-<version>-arm64-mac.zip`

Use this when you want to hand the app to another macOS user for direct testing.

For a faster packaging smoke test without generating a DMG:

```bash
npm run dist:dir
```

For a signed/notarized release build:

```bash
npm run dist:release
```

### Windows packaging

For a Windows packaging smoke test:

```bash
npm run dist:win:dir
```

For an unsigned share build:

```bash
npm run dist:win:share
```

This generates:

- `PromptBar-<version>-x64-setup.exe`
- `PromptBar-<version>-x64.zip`

For a signed Windows release build:

```bash
npm run dist:win:release
```

`electron-builder` will sign the Windows installer and app binaries automatically when the standard `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables are available.

Note: Windows packaging must run on a Windows host (or the included GitHub Actions workflow on `windows-latest`). PromptBar ships a native addon, and `node-gyp` cannot cross-compile that module from macOS.

### Installing an unsigned share build

If the recipient sees a macOS warning that the app is from an unidentified developer:

1. Open the DMG or unzip the app
2. Drag `PromptBar.app` into `Applications`
3. In Finder, right-click `PromptBar.app` and choose `Open`
4. Confirm the system prompt once

If macOS still blocks launch, the recipient can open:

- `System Settings > Privacy & Security`
- scroll down to the blocked-app warning
- choose `Open Anyway`

## Markdown format

```md
---
tags: [starter, email]
aliases: [default, examples]
favorite: true
---

# Daily Writing

## Follow-up Email
Please draft a {{tone|warm,professional}} follow-up email about {{topic}}.
Keep it concise, respectful, and action-oriented.
```

Rules:

- `#` starts a prompt pack
- `##` starts a prompt item
- `{{name}}` creates a free-text variable
- `{{tone|warm,professional}}` creates an enum variable

## Current MVP features

- Global hotkey popup
- Markdown-driven prompt library
- Search and keyboard navigation
- Variable form with live preview
- Clipboard paste with clipboard restore
- Recent usage and variable-history recall
- Open prompts folder / current source file from the UI
- Tray menu with quick actions
- Launch at login from tray or settings
- GUI settings page for shortcut and permissions
- GUI manager page for editing Markdown prompt files
- Custom macOS app icon and tray template icon

## Signing and notarization

`npm run dist:release` is configured for signed/notarized macOS distribution through `electron-builder`.

Provide one of the notarization credential sets supported by `electron-builder`:

- Recommended: `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`
- Alternative: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- Alternative: `APPLE_KEYCHAIN`, `APPLE_KEYCHAIN_PROFILE`

For code signing, either install your `Developer ID Application` certificate in the local keychain or provide the standard `CSC_*` environment variables supported by `electron-builder`.

The builder config also enables:

- `hardenedRuntime`
- custom entitlements in `build/`
- DMG output
- bundled user-editable prompt templates copied into the app on first launch

For Windows signing, provide:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`

The repository also includes a GitHub Actions workflow that builds Windows artifacts on `windows-latest`, and signs them automatically when those secrets are configured in the repository.

## Notes

- `Control + Q` is the current default hotkey and can be changed in settings
- prompt insertion depends on Accessibility permissions for simulated paste
- the manager saves prompt files into the user data prompts directory, seeded from bundled templates on first launch
