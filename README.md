# llama-swap-status

Display llama-swap status in the VS Code status bar, including GPU temperature, token generation speed, and processed token counts.

## Features

- **GPU Temperature**: Real-time GPU temperature display in the status bar
- **Model Status**: Optionally shows the active model name and status (ready, starting, stopping, etc.)
- **Token Speed**: Displays aggregate token generation speed across active slots (t/s)
- **Processed Tokens**: Shows prompt tokens processed during prefill, then prompt processed plus generated tokens during generation
- **Detail Panel**: Click any status bar item to open a detailed monitoring panel
- **Automatic Reconnection**: Detects llama-swap when it becomes available after startup

## Status Bar Behavior

The extension shows four optional items on the right side of the VS Code status bar:

| Item | Display | Data source |
| --- | --- | --- |
| GPU | Temperature for each GPU | llama-swap `/api/performance` |
| Model | Active model name and status | llama-swap `/v1/models` |
| Speed | Aggregate generation speed across active slots | llama-server `/slots` |
| Processed Tokens | Prompt tokens processed during prefill, then prompt processed plus generated tokens | llama-server `/slots` |

Model information is hidden by default to preserve status bar space. Processed token information follows the most active slot, while generation speed is aggregated across all active slots. When llama-swap is unavailable, the status bar items remain hidden and reappear automatically after the server becomes available.

## Requirements

- A running llama-swap instance (default: `http://localhost:8080`)

## Extension Settings

This extension contributes the following settings:

* `llamaSwap.url`: URL of the llama-swap server (default: `http://localhost:8080`)
* `llamaSwap.refreshInterval`: Polling interval in milliseconds (default: 3000)
* `llamaSwap.slotsPollInterval`: Slot polling interval in milliseconds (default: 1000)
* `llamaSwap.showGpuInfo`: Show GPU temperature in status bar (default: true)
* `llamaSwap.showModelInfo`: Show active model name and status in status bar (default: false)
* `llamaSwap.showSpeedInfo`: Show token speed in status bar (default: true)
* `llamaSwap.showPromptProgress`: Show processed token counts in status bar (default: true)

The `llamaSwap.statusBarPosition` setting is currently reserved for future use; status bar items are displayed on the right side.

## Commands

* `llama-swap-status: Open Monitor Panel` - Open detailed monitoring webview
* `llama-swap-status: Open Web UI` - Open llama-swap web interface
* `llama-swap-status: Toggle Status Bar` - Toggle status bar visibility
* `llama-swap-status: Refresh` - Manually refresh connection and data

## Development

```bash
npm install
npm run compile
code .  # Then press F5 to debug
```

## License

MIT

## Release Notes

### 0.1.0

Initial release with GPU monitoring, aggregate token generation speed, processed token counts, and llama-swap Web UI access.
