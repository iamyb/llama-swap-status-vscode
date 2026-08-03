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

// Keep status bar values made from visible characters; trailing whitespace is not reliable.
const PROMPT_FIELD_WIDTH = 6;
const SPEED_FIELD_WIDTH = 5;

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

    this.gpuItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
    this.modelItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 999);
    this.speedItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 998);
    this.promptItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 997);

    // Keep the status bar silent until the first successful connection.
    this.gpuItem.text = '';
    this.modelItem.text = '';
    this.speedItem.text = '';
    this.promptItem.text = '';
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
    if (config.showModelInfo) {
      this.updateModelItem();
    } else {
      this.modelItem.hide();
    }

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
    this.promptItem.show();

    const activeSlot = this.slotsMonitor.getActiveSlot();
    if (!activeSlot) {
      const promptText = '000000';
      this.promptItem.text = `$(pulse)${promptText}`;
      this.promptItem.color = '#808080';
      this.promptItem.tooltip = new vscode.MarkdownString('No active prompt processing');
      return;
    }

    const processed = activeSlot.n_prompt_tokens_processed;
    const total = activeSlot.n_prompt_tokens;
    const cached = activeSlot.n_prompt_tokens_cache;
    const generated = activeSlot.next_token?.reduce((sum, token) => sum + token.n_decoded, 0) ?? 0;
    const processedTotal = processed + generated;
    const percent = total > 0 ? ((processed / total) * 100).toFixed(0) : '0';
    const promptSpeed = this.slotsMonitor.getPromptSpeed();

    const promptText = `${processedTotal}`.padStart(PROMPT_FIELD_WIDTH, '0').slice(-PROMPT_FIELD_WIDTH);
    this.promptItem.text = `$(pulse)${promptText}`;
    this.promptItem.color = '#4ec9b0';
    this.promptItem.tooltip = new vscode.MarkdownString(
      `**Processed Prompt Tokens:** ${processed} / ${total} tokens (${percent}%)\n` +
      `**Generated Tokens:** ${generated}\n` +
      `**Total Processed Tokens:** ${processedTotal}\n` +
      `**Cached Tokens:** ${cached}\n` +
      `**Prompt Speed:** ${promptSpeed !== null ? `${promptSpeed.toFixed(1)} t/s` : 'N/A'}`
    );
    this.promptItem.command = 'llamaSwap.openPanel';
  }

  /** Update GPU temperature status bar item */
  private updateGpuItem(): void {
    if (!this.state.connected) {
      this.gpuItem.hide();
      return;
    }
    this.gpuItem.show();

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
    this.modelItem.show();

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
    this.speedItem.show();

    const speed = this.slotsMonitor.getTokenSpeed();
    if (speed === null || speed === 0) {
      this.speedItem.text = `$(beaker)${'0.0'.padStart(SPEED_FIELD_WIDTH, '0')}`;
      this.speedItem.color = '#808080';
      this.speedItem.tooltip = new vscode.MarkdownString('Generation idle');
      return;
    }

    const speedStr = speed.toFixed(1).padStart(SPEED_FIELD_WIDTH, '0').slice(-SPEED_FIELD_WIDTH);
    this.speedItem.text = `$(beaker)${speedStr}`;
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
