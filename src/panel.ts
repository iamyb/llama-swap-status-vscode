import * as vscode from 'vscode';
import { StatusBarState } from './state';
import { SlotsMonitor } from './slotsMonitor';
import { getBaseUrl } from './config';

/** Webview panel for detailed monitoring */
export class DetailPanel {
  public static currentPanel: DetailPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private state: StatusBarState;
  private slotsMonitor: SlotsMonitor;
  private disposables: vscode.Disposable[] = [];
  private updateTimer: NodeJS.Timeout | null = null;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    state: StatusBarState,
    slotsMonitor: SlotsMonitor
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.state = state;
    this.slotsMonitor = slotsMonitor;

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Update panel content periodically
    this.updateTimer = setInterval(() => this.updateContent(), 2000);
    this.updateContent();
  }

  /** Create or revive the current panel */
  public static createOrShow(
    extensionUri: vscode.Uri,
    state: StatusBarState,
    slotsMonitor: SlotsMonitor
  ): void {
    // If panel exists, show it
    if (DetailPanel.currentPanel) {
      DetailPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      'llamaSwapDetail',
      'llama-swap-status Monitor',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    DetailPanel.currentPanel = new DetailPanel(panel, extensionUri, state, slotsMonitor);
  }

  /** Update the webview content with current state */
  private updateContent(): void {
    const gpuStats = this.state.getAllGpuStats();
    const tokenSpeed = this.slotsMonitor.getTokenSpeed();
    const activeSlot = this.slotsMonitor.getActiveSlot();
    const activeModels = this.state.getActiveModelIds();
    const inflightCount = this.slotsMonitor.getInflightCount();

    const html = this.generateHtml({
      gpuStats,
      tokenSpeed,
      activeSlot,
      activeModels,
      inflightCount,
      connected: this.state.connected,
    });

    this.panel.webview.html = html;
  }

  /** Generate HTML content for the webview */
  private generateHtml(data: {
    gpuStats: { temp_c: number; gpu_util_pct: number; mem_used_mb: number; mem_total_mb: number; id?: number }[];
    tokenSpeed: number | null;
    activeSlot: { is_processing: boolean; n_prompt_tokens: number; n_prompt_tokens_processed: number; n_prompt_tokens_cache: number } | null;
    activeModels: string[];
    inflightCount: number;
    connected: boolean;
  }): string {
    const progressPercent = data.activeSlot
      ? (data.activeSlot.n_prompt_tokens_processed / data.activeSlot.n_prompt_tokens) * 100
      : 0;
    const webUiUrl = escapeHtml(getBaseUrl());

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <title>llama-swap-status Monitor</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
      margin: 0;
    }
    .section {
      margin-bottom: 20px;
      padding: 15px;
      border: 1px solid var(--vscode-input-border);
      border-radius: 5px;
    }
    .section-title {
      font-size: 1.2em;
      font-weight: bold;
      margin-bottom: 10px;
      color: var(--vscode-textPreformat-foreground);
    }
    .metric {
      display: flex;
      justify-content: space-between;
      padding: 5px 0;
      border-bottom: 1px solid var(--vscode-input-border);
    }
    .metric:last-child {
      border-bottom: none;
    }
    .metric-label {
      color: var(--vscode-descriptionForeground);
    }
    .metric-value {
      font-weight: bold;
    }
    .connected { color: #4ec9b0; }
    .disconnected { color: #f44747; }
    .progress-bar {
      width: 100%;
      height: 20px;
      background-color: var(--vscode-editor-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 3px;
      overflow: hidden;
      margin-top: 10px;
    }
    .progress-fill {
      height: 100%;
      background-color: #4ec9b0;
      transition: width 0.3s ease;
    }
    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 0.9em;
    }
    .status-ready { background-color: #4ec9b033; color: #4ec9b0; }
    .status-starting { background-color: #dcdcaa33; color: #dcdcaa; }
  </style>
</head>
<body>
  <h1>🦙 llama-swap-status Monitor</h1>
  
  <div class="section">
    <div class="section-title">Connection Status</div>
    <div class="metric">
      <span class="metric-label">Status</span>
      <span class="metric-value ${data.connected ? 'connected' : 'disconnected'}">
        ${data.connected ? '● Connected' : '● Disconnected'}
      </span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">🌡️ GPU Status</div>
    ${data.gpuStats.length > 0 ? data.gpuStats.map((gpu, i) => `
      <div class="metric">
        <span class="metric-label">GPU ${i} Temp</span>
        <span class="metric-value">${Math.round(gpu.temp_c)}°C</span>
      </div>
      <div class="metric">
        <span class="metric-label">GPU ${i} Util</span>
        <span class="metric-value">${Math.round(gpu.gpu_util_pct)}%</span>
      </div>
      <div class="metric">
        <span class="metric-label">GPU ${i} VRAM</span>
        <span class="metric-value">${Math.round(gpu.mem_used_mb)} / ${Math.round(gpu.mem_total_mb)} MB</span>
      </div>
    `).join('') : '<div class="metric"><span class="metric-value">No GPU data available</span></div>'}
  </div>

  <div class="section">
    <div class="section-title">⚡ Speed Metrics</div>
    <div class="metric">
      <span class="metric-label">Token Generation</span>
      <span class="metric-value" style="color: ${data.tokenSpeed !== null ? '#4ec9b0' : '#808080'}">${data.tokenSpeed !== null ? `${data.tokenSpeed.toFixed(1)} t/s` : 'Idle'}</span>
    </div>
    ${data.activeSlot ? `
      <div class="metric">
        <span class="metric-label">Processed Tokens</span>
        <span class="metric-value">${data.activeSlot.n_prompt_tokens_processed} / ${data.activeSlot.n_prompt_tokens}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Cached Tokens</span>
        <span class="metric-value">${data.activeSlot.n_prompt_tokens_cache}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${progressPercent}%"></div>
      </div>
    ` : ''}
    <div style="font-size: 0.85em; color: #808080; margin-top: 8px;">💡 Speed shown during active processing</div>
  </div>

  <div class="section">
    <div class="section-title">🦙 Models</div>
    <div class="metric">
      <span class="metric-label">Active Models</span>
      <span class="metric-value">${data.activeModels.length > 0 ? data.activeModels.join(', ') : 'None'}</span>
    </div>
    <div class="metric">
      <span class="metric-label">In-flight Requests</span>
      <span class="metric-value">${data.inflightCount}</span>
    </div>
  </div>

  <div style="margin-top: 20px; text-align: center; color: var(--vscode-descriptionForeground); font-size: 0.9em;">
    <a href="${webUiUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--vscode-textLink-foreground);">Open llama-swap Web UI →</a>
  </div>
</body>
</html>`;
  }

  /** Dispose the panel */
  public dispose(): void {
    DetailPanel.currentPanel = undefined;
    this.panel.dispose();

    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }

    while (this.disposables.length) {
      const x = this.disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}

/** Escape a configured URL before placing it in an HTML attribute. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}
