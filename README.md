# Llama Swap Status

Display llama-swap status in VS Code status bar, including GPU temperature, model status, token generation speed, and prompt processing progress.

## Features

- **GPU Temperature**: Real-time GPU temperature display in the status bar
- **Model Status**: Shows active model name and status (ready, starting, stopping, etc.)
- **Token Speed**: Displays token generation speed (t/s)
- **Prompt Progress**: Real-time prompt processing progress from llama-server slots API
- **Detail Panel**: Click any status bar item to open a detailed monitoring panel
- **Connection Status**: Shows disconnected state when llama-swap is unreachable

## Requirements

- A running llama-swap instance (default: `http://localhost:8080`)

## Extension Settings

This extension contributes the following settings:

* `llamaSwap.url`: URL of the llama-swap server (default: `http://localhost:8080`)
* `llamaSwap.refreshInterval`: Polling interval in milliseconds (default: 3000)
* `llamaSwap.slotsPollInterval`: Slot polling interval in milliseconds (default: 1000)
* `llamaSwap.showGpuInfo`: Show GPU temperature in status bar (default: true)
* `llamaSwap.showSpeedInfo`: Show token speed in status bar (default: true)
* `llamaSwap.showPromptProgress`: Show prompt progress in status bar (default: true)

## Commands

* `Llama Swap: Open Monitor Panel` - Open detailed monitoring webview
* `Llama Swap: Open Web UI` - Open llama-swap web interface
* `Llama Swap: Toggle Status Bar` - Toggle status bar visibility
* `Llama Swap: Refresh` - Manually refresh connection and data

## Development

```bash
npm install
npm run compile
code .  # Then press F5 to debug
```

## License

MIT

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
