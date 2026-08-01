import * as vscode from 'vscode';
import { StatusBarState } from './state';
import { SlotsMonitor } from './slotsMonitor';
import { getConfig } from './config';
import { ModelStatus, SlotState } from './types';

/** Color mapping for model statuses */
const STATUS_COLORS: Record<ModelStatus, string> = {
  ready: '#4ec9b0',
  starting: '#dcdcaa',
  stopping: '#ce9178',
  stopped: '#808080',
  shutdown: '#6a6a6a',
  unknown: '#c586c0',
};

/** Status bar manager */
export class StatusBarManager {
  private gpuItem: vscode.StatusBarItem;
  private modelItem: vscode.StatusBarItem;
  private speedItem: vscode.StatusBarItem;
  private promptItem: vscode.StatusBarItem;
  private state: StatusBarState;
  private slotsMonitor: SlotsMonitor;
  private outputChannel: vscode.LogOutputChannel;

  constructor(state: StatusBarState, slotsMonitor: SlotsMonitor, outputChannel: vscode.LogOutputChannel) {
    this.state = state;
    this.slotsMonitor = slotsMonitor;
    this.outputChannel = outputChannel;

    this.gpuItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.modelItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    this.speedItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
    this.promptItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 97);

    // Set initial text so items are visible immediately
    this.gpuItem.text = '$(cpu-temperature) Connecting...';
    this.gpuItem.color = '#808080';
    this.modelItem.text = '$(loading~spin) Connecting...';
    this.modelItem.color = '#808080';
    this.speedItem.text = '$(beaker) ...';
    this.speedItem.color = '#808080';
    this.promptItem.text = '$(pulse) ...';
    this.promptItem.color = '#808080';
  }

  /** Show all status bar items */
  show(): void {
    this.gpuItem.show();
    this.modelItem.show();
    this.speedItem.show();
    this.promptItem.show();
  }

  /** Hide all status bar items */
  hide(): void {
    this.gpuItem.hide();
    this.modelItem.hide();
    this.speedItem.hide();
    this.promptItem.hide();
  }

  /** Update status bar items based on current state */
  update(): void {
    const config = getConfig();

    // Update GPU temperature item
    if (config.showGpuInfo) {
      this.updateGpuItem();
    } else {
      this.gpuItem.hide();
    }

    // Update model status item
    this.updateModelItem();

    // Update speed item
    if (config.showSpeedInfo) {
      this.updateSpeedItem();
    } else {
      this.speedItem.hide();
    }

    // Update prompt progress item
    if (config.showPromptProgress) {
      this.updatePromptItem();
    } else {
      this.promptItem.hide();
    }
  }

  /** Update prompt processing progress item */
  private updatePromptItem(): void {
    if (!this.state.connected) {
      this.promptItem.hide();
      return;
    }

    const activeSlot = this.slotsMonitor.getActiveSlot();
    if (!activeSlot) {
      this.promptItem.text = '$(pulse) Idle';
      this.promptItem.color = '#808080';
      this.promptItem.tooltip = new vscode.MarkdownString('No active prompt processing');
      return;
    }

    const processed = activeSlot.n_prompt_tokens_processed;
    const total = activeSlot.n_prompt_tokens;
    const cached = activeSlot.n_prompt_tokens_cache;
    const percent = total > 0 ? ((processed / total) * 100).toFixed(0) : '0';
    const promptSpeed = this.slotsMonitor.getPromptSpeed();

    this.promptItem.text = `$(book) ${processed}/${total} (${percent}%)`;
    this.promptItem.color = '#4ec9b0';
    this.promptItem.tooltip = new vscode.MarkdownString(
      `**Prompt Progress:** ${processed} / ${total} tokens (${percent}%)\n` +
      `**Cached Tokens:** ${cached}\n` +
      `**Prompt Speed:** ${promptSpeed !== null ? `${promptSpeed.toFixed(1)} t/s` : 'N/A'}`
    );
    this.promptItem.command = 'llamaSwap.openPanel';
  }

  /** Update GPU temperature status bar item */
  private updateGpuItem(): void {
    if (!this.state.connected) {
      this.gpuItem.text = '$(circle-slash) llama-swap: disconnected';
      this.gpuItem.color = '#f44747';
      this.gpuItem.tooltip = new vscode.MarkdownString('llama-swap connection failed. Click to retry.');
      this.gpuItem.command = 'llamaSwap.refresh';
      return;
    }

    const gpus = this.state.getAllGpuStats();
    if (gpus.length === 0) {
      this.gpuItem.text = '$(cpu-temperature) GPU: N/A';
      this.gpuItem.color = '#808080';
      this.gpuItem.tooltip = new vscode.MarkdownString('No GPU data available');
      return;
    }

    // Build status bar text showing all GPU temps
    const tempParts = gpus.map((gpu, i) => `GPU${i}:${Math.round(gpu.temp_c)}°C`);
    this.gpuItem.text = `$(cpu-temperature) ${tempParts.join(' ')}`;

    // Use the highest temperature for color
    const maxTemp = Math.max(...gpus.map(g => g.temp_c));
    this.gpuItem.color = maxTemp > 80 ? '#f44747' : maxTemp > 70 ? '#dcdcaa' : '#4ec9b0';

    // Build detailed tooltip with all GPU info
    let tooltip = '';
    for (const [i, gpu] of gpus.entries()) {
      if (i > 0) {tooltip += '\n---\n';}
      tooltip += `**GPU ${i}:** ${Math.round(gpu.temp_c)}°C | Util: ${Math.round(gpu.gpu_util_pct)}% | VRAM: ${Math.round(gpu.mem_used_mb)} / ${Math.round(gpu.mem_total_mb)} MB\n`;
    }

    this.gpuItem.tooltip = new vscode.MarkdownString(tooltip);
    this.gpuItem.command = 'llamaSwap.openPanel';
  }

  /** Update model status bar item */
  private updateModelItem(): void {
    if (!this.state.connected) {
      this.modelItem.hide();
      return;
    }

    const activeModels = this.state.getActiveModelIds();
    if (activeModels.length === 0) {
      this.modelItem.text = '$(circle-outline) No models';
      this.modelItem.color = '#808080';
      this.modelItem.tooltip = new vscode.MarkdownString('No active models loaded');
      return;
    }

    // Show first active model with status
    const firstModel = this.state.models.get(activeModels[0]);
    if (firstModel) {
      const icon = firstModel.status === 'ready' ? '$(check)' : '$(loading~spin)';
      const color = STATUS_COLORS[firstModel.status] || '#808080';
      this.modelItem.text = `${icon} ${firstModel.id}`;
      this.modelItem.color = color;
      this.modelItem.tooltip = new vscode.MarkdownString(
        `**Model:** ${firstModel.id}\n` +
        `**Status:** ${firstModel.status}\n` +
        `**In-flight requests:** ${this.slotsMonitor.getInflightCount()}`
      );
      this.modelItem.command = 'llamaSwap.openWebUI';
    }
  }

  /** Update token generation speed item */
  private updateSpeedItem(): void {
    if (!this.state.connected) {
      this.speedItem.hide();
      return;
    }

    const speed = this.slotsMonitor.getTokenSpeed();
    if (speed === null || speed === 0) {
      this.speedItem.text = '$(beaker) Idle';
      this.speedItem.color = '#808080';
      this.speedItem.tooltip = new vscode.MarkdownString('No active generation (speed shown when a prompt is being processed)');
      return;
    }

    this.speedItem.text = `$(beaker) ${speed.toFixed(1)} t/s`;
    this.speedItem.color = '#4ec9b0';
    this.speedItem.tooltip = new vscode.MarkdownString(
      `**Token Generation Speed:** ${speed.toFixed(1)} tokens/sec\n` +
      `**Prompt Processing Speed:** ${this.slotsMonitor.getPromptSpeed()?.toFixed(1) ?? 'N/A'} tokens/sec`
    );
    this.speedItem.command = 'llamaSwap.openPanel';
  }

  /** Dispose all status bar items */
  dispose(): void {
    this.gpuItem.dispose();
    this.modelItem.dispose();
    this.speedItem.dispose();
    this.promptItem.dispose();
  }
}
