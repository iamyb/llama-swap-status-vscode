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

  // Speed tracking state
  private prevProcessedTokens: number = 0;
  private prevDecodedTokens: number = 0;
  private prevTimestamp: number = 0;
  private speedMetrics: SpeedMetrics = { promptSpeed: null, generationSpeed: null };

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
    this.currentModelId = modelId;
    // Reset speed tracking when model changes
    this.prevProcessedTokens = 0;
    this.prevDecodedTokens = 0;
    this.prevTimestamp = 0;
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

    // Find the most active slot: prefer is_processing=true, fallback to slot with most decoded tokens
    const activeSlot = slotsResponse.find(slot => slot.is_processing)
      ?? slotsResponse.reduce((best, slot) => {
        const decoded = slot.next_token?.reduce((sum, t) => sum + t.n_decoded, 0) ?? 0;
        return decoded > best.decoded ? { slot, decoded } : best;
      }, { slot: slotsResponse[0], decoded: -1 }).slot;

    const now = Date.now();
    const processedTokens = activeSlot.n_prompt_tokens_processed;
    const decodedTokens = activeSlot.next_token?.reduce((sum, t) => sum + t.n_decoded, 0) ?? 0;

    // Calculate speeds from deltas
    if (this.prevTimestamp > 0) {
      const dt = (now - this.prevTimestamp) / 1000; // seconds
      if (dt > 0) {
        const promptDelta = processedTokens - this.prevProcessedTokens;
        const genDelta = decodedTokens - this.prevDecodedTokens;

        // If prompt tokens are being processed
        if (promptDelta > 0) {
          this.speedMetrics.promptSpeed = promptDelta / dt;
          this.outputChannel.info(`[slots] Prompt speed: ${this.speedMetrics.promptSpeed.toFixed(1)} t/s (delta: ${promptDelta} tokens in ${dt.toFixed(2)}s)`);
        }
        // If tokens are being generated
        if (genDelta > 0) {
          this.speedMetrics.generationSpeed = genDelta / dt;
          this.outputChannel.info(`[slots] Gen speed: ${this.speedMetrics.generationSpeed.toFixed(1)} t/s (delta: ${genDelta} tokens in ${dt.toFixed(2)}s)`);
        }
        // If nothing changed for a while, clear speeds and mark as idle
        if (promptDelta === 0 && genDelta === 0) {
          const idleSeconds = (now - this.prevTimestamp) / 1000;
          if (idleSeconds > 3) {
            this.speedMetrics.promptSpeed = null;
            this.speedMetrics.generationSpeed = null;
          }
        }
      }
    }

    this.prevProcessedTokens = processedTokens;
    this.prevDecodedTokens = decodedTokens;
    this.prevTimestamp = now;

    // Only set activeSlot if there's actual activity (processing or recent speed data)
    const hasActivity = activeSlot.is_processing
      || this.speedMetrics.promptSpeed !== null
      || this.speedMetrics.generationSpeed !== null;

    if (hasActivity) {
      this.activeSlot = activeSlot;
    } else if (this.activeSlot !== null) {
      // Was active before but now idle - clear after timeout
      this.activeSlot = null;
    }

    this.notify();
  }
}
