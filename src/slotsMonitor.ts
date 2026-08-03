import * as vscode from 'vscode';
import { SlotState } from './types';
import { fetchMetricsStats, fetchRunning } from './api';
import { getConfig } from './config';

/** Callback for slot state changes */
export type SlotChangeCallback = (activeSlot: SlotState | null) => void;

/** Computed speed metrics from polling deltas */
interface SpeedMetrics {
  promptSpeed: number | null;
  generationSpeed: number | null;
}

/** Monitor for llama-server slot states via llama-swap proxy */
export class SlotsMonitor {
  private pollTimer: NodeJS.Timeout | null = null;
  private outputChannel: vscode.LogOutputChannel;
  private activeSlot: SlotState | null = null;
  private callbacks: SlotChangeCallback[] = [];

  // Speed tracking state (aggregated across all models)
  private prevTotalInputTokens: number = 0;
  private prevTotalOutputTokens: number = 0;
  private prevTimestamp: number = 0;
  private speedMetrics: SpeedMetrics = { promptSpeed: null, generationSpeed: null };
  private _promptIdleSince: number = 0;
  private _genIdleSince: number = 0;
  private pollInProgress: boolean = false;
  private runningModelCount: number = 0;

  constructor(outputChannel: vscode.LogOutputChannel) {
    this.outputChannel = outputChannel;
  }

  /** Register a callback for slot state changes */
  onChange(callback: SlotChangeCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }

  /** Notify all registered callbacks */
  private notify(): void {
    for (const callback of this.callbacks) {
      callback(this.activeSlot);
    }
  }

  /** Start polling slot states */
  start(): void {
    this.poll();
    const config = getConfig();
    this.pollTimer = setInterval(() => this.poll(), config.slotsPollInterval);
  }

  /** Stop polling */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.activeSlot = null;
    this.runningModelCount = 0;
    this.resetTracking();
    this.notify();
  }

  /** Get the current active slot state */
  getActiveSlot(): SlotState | null {
    return this.activeSlot;
  }

  /** Get the current token generation speed (tokens/sec) computed from polling */
  getTokenSpeed(): number | null {
    return this.speedMetrics.generationSpeed;
  }

  /** Get the current prompt processing speed (tokens/sec) computed from polling */
  getPromptSpeed(): number | null {
    return this.speedMetrics.promptSpeed;
  }

  /** Get the current inflight request count (number of slots actively processing) */
  getInflightCount(): number {
    return 0;
  }

  /** Get the number of models currently running */
  getRunningModelCount(): number {
    return this.runningModelCount;
  }

  /** Poll aggregate statistics without querying a model upstream */
  private async poll(): Promise<void> {
    // Do not allow a slow request to overlap the next poll and corrupt deltas.
    if (this.pollInProgress) {
      return;
    }
    this.pollInProgress = true;

    try {
      await this.pollOnce();
    } finally {
      this.pollInProgress = false;
    }
  }

  /** Process one ordered aggregate-statistics response. */
  private async pollOnce(): Promise<void> {
    const [stats, running] = await Promise.all([fetchMetricsStats(), fetchRunning()]);
    if (!stats) {
      this.clearActiveState();
      return;
    }
    this.runningModelCount = running?.running.filter(entry => entry.state === 'ready' || entry.state === 'starting').length ?? 0;

    const now = Date.now();
    // Calculate speeds from aggregated deltas (stable across slot switches)
    if (this.prevTimestamp > 0) {
      const dt = (now - this.prevTimestamp) / 1000; // seconds
      if (dt > 0) {
        const promptDelta = stats.total_input_tokens - this.prevTotalInputTokens;
        const genDelta = stats.total_output_tokens - this.prevTotalOutputTokens;

        // Prompt speed: tracks independently
        if (promptDelta > 0) {
          this.speedMetrics.promptSpeed = promptDelta / dt;
          this._promptIdleSince = 0;
          this.outputChannel.info(`[metrics] Input throughput: ${this.speedMetrics.promptSpeed.toFixed(1)} t/s`);
        } else {
          this._promptIdleSince += dt;
          if (this._promptIdleSince >= 2) {
            this.speedMetrics.promptSpeed = null;
          }
        }

        // Generation speed: tracks independently
        if (genDelta > 0) {
          this.speedMetrics.generationSpeed = genDelta / dt;
          this._genIdleSince = 0;
          this.outputChannel.info(`[metrics] Output throughput: ${this.speedMetrics.generationSpeed.toFixed(1)} t/s`);
        } else {
          this._genIdleSince += dt;
          if (this._genIdleSince >= 2) {
            this.speedMetrics.generationSpeed = null;
          }
        }
      }
    }

    this.prevTotalInputTokens = stats.total_input_tokens;
    this.prevTotalOutputTokens = stats.total_output_tokens;
    this.prevTimestamp = now;

    // activeSlot follows processing state, not speed (prevents flicker)
    this.activeSlot = null;

    this.notify();
  }

  private resetTracking(): void {
    this.prevTotalInputTokens = 0;
    this.prevTotalOutputTokens = 0;
    this.prevTimestamp = 0;
    this._promptIdleSince = 0;
    this._genIdleSince = 0;
    this.speedMetrics = { promptSpeed: null, generationSpeed: null };
  }

  private clearActiveState(): void {
    const hadState = this.activeSlot !== null
      || this.runningModelCount !== 0
      || this.speedMetrics.promptSpeed !== null
      || this.speedMetrics.generationSpeed !== null;
    this.activeSlot = null;
    this.runningModelCount = 0;
    this.resetTracking();
    if (hadState) {
      this.notify();
    }
  }
}
