import * as vscode from 'vscode';
import { SlotState } from './types';
import { fetchSlots } from './api';
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
  private currentModelId: string | null = null;
  private activeSlot: SlotState | null = null;
  private callbacks: SlotChangeCallback[] = [];

  // Speed tracking state (aggregated across all slots)
  private prevTotalProcessedTokens: number = 0;
  private prevTotalDecodedTokens: number = 0;
  private prevTimestamp: number = 0;
  private speedMetrics: SpeedMetrics = { promptSpeed: null, generationSpeed: null };
  private _promptIdleSince: number = 0;
  private _genIdleSince: number = 0;
  private pollInProgress: boolean = false;

  // Inflight count (number of slots currently processing)
  private inflightCount: number = 0;

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

  /** Set the current model ID to monitor */
  setModelId(modelId: string | null): void {
    if (modelId === this.currentModelId) {
      return;
    }

    this.currentModelId = modelId;
    // Reset speed tracking when model changes
    this.prevTotalProcessedTokens = 0;
    this.prevTotalDecodedTokens = 0;
    this.prevTimestamp = 0;
    this._promptIdleSince = 0;
    this._genIdleSince = 0;
    this.speedMetrics = { promptSpeed: null, generationSpeed: null };
    this.outputChannel.info(`[slots] Monitoring model: ${modelId ?? 'none'}`);
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
    return this.inflightCount;
  }

  /** Poll slot states from the upstream llama-server */
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

  /** Process one ordered slot-state response. */
  private async pollOnce(): Promise<void> {
    if (!this.currentModelId) {
      if (this.activeSlot !== null) {
        this.activeSlot = null;
        this.speedMetrics = { promptSpeed: null, generationSpeed: null };
        this.notify();
      }
      return;
    }

    const slotsResponse = await fetchSlots(this.currentModelId);
    if (!slotsResponse || slotsResponse.length === 0) {
      return;
    }

    // Count inflight requests (slots that are actively processing)
    this.inflightCount = slotsResponse.filter(slot => slot.is_processing).length;

    // Aggregate token counts across ALL slots for speed calculation
    const totalProcessedTokens = slotsResponse.reduce((sum, slot) => sum + slot.n_prompt_tokens_processed, 0);
    const totalDecodedTokens = slotsResponse.reduce((sum, slot) => {
      return sum + (slot.next_token?.reduce((s, t) => s + t.n_decoded, 0) ?? 0);
    }, 0);

    // Find the most active slot for prompt progress display
    const activeSlot = slotsResponse.find(slot => slot.is_processing)
      ?? slotsResponse.reduce((best, slot) => {
        const decoded = slot.next_token?.reduce((sum, t) => sum + t.n_decoded, 0) ?? 0;
        return decoded > best.decoded ? { slot, decoded } : best;
      }, { slot: slotsResponse[0], decoded: -1 }).slot;

    const now = Date.now();
    const isProcessing = this.inflightCount > 0;

    // Calculate speeds from aggregated deltas (stable across slot switches)
    if (this.prevTimestamp > 0) {
      const dt = (now - this.prevTimestamp) / 1000; // seconds
      if (dt > 0) {
        const promptDelta = totalProcessedTokens - this.prevTotalProcessedTokens;
        const genDelta = totalDecodedTokens - this.prevTotalDecodedTokens;

        // Prompt speed: tracks independently
        if (promptDelta > 0) {
          this.speedMetrics.promptSpeed = promptDelta / dt;
          this._promptIdleSince = 0;
          this.outputChannel.info(`[slots] Prompt speed: ${this.speedMetrics.promptSpeed.toFixed(1)} t/s (delta: ${promptDelta} tokens in ${dt.toFixed(2)}s)`);
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
          this.outputChannel.info(`[slots] Gen speed: ${this.speedMetrics.generationSpeed.toFixed(1)} t/s (delta: ${genDelta} tokens in ${dt.toFixed(2)}s)`);
        } else {
          this._genIdleSince += dt;
          // Only clear generation speed when truly idle (no slot processing AND no gen tokens for 2s)
          if (this._genIdleSince >= 2 && !isProcessing) {
            this.speedMetrics.generationSpeed = null;
          }
        }
      }
    }

    this.prevTotalProcessedTokens = totalProcessedTokens;
    this.prevTotalDecodedTokens = totalDecodedTokens;
    this.prevTimestamp = now;

    // activeSlot follows processing state, not speed (prevents flicker)
    if (isProcessing) {
      this.activeSlot = activeSlot;
    } else if (!isProcessing && this._genIdleSince >= 2) {
      this.activeSlot = null;
    }

    this.notify();
  }
}
