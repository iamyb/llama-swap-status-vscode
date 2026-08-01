import * as vscode from 'vscode';
import { GpuStat, ModelInfo, ModelStatus, ModelLoadStatus } from './types';
import { fetchPerformance, fetchModels, subscribeEvents, checkConnection } from './api';
import { getConfig } from './config';

/** Callback for state changes */
export type StateChangeCallback = (state: StatusBarState) => void;

/** Main state manager for the extension */
export class StatusBarState {
  // GPU and system stats
  public gpuStats: GpuStat[] = [];
  public sysStats: unknown[] = [];

  // Model information
  public models: Map<string, ModelInfo> = new Map();

  // In-flight request count
  public inflightCount: number = 0;

  // Connection state
  public connected: boolean = false;

  private outputChannel: vscode.LogOutputChannel;
  private refreshTimer: NodeJS.Timeout | null = null;
  private eventCleanup: (() => void) | null = null;
  private callbacks: StateChangeCallback[] = [];

  constructor(outputChannel: vscode.LogOutputChannel) {
    this.outputChannel = outputChannel;
  }

  /** Register a callback for state changes */
  onChange(callback: StateChangeCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }

  /** Notify all registered callbacks about state changes */
  private notify(): void {
    for (const callback of this.callbacks) {
      callback(this);
    }
  }

  /** Start polling and event subscription */
  start(): void {
    this.startPolling();
    this.startEventSubscription();
  }

  /** Stop all polling and subscriptions */
  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.eventCleanup) {
      this.eventCleanup();
      this.eventCleanup = null;
    }
  }

  /** Start periodic polling for performance and activity data */
  private startPolling(): void {
    const poll = async () => {
      const config = getConfig();
      const [connected, performance, models] = await Promise.all([
        checkConnection(),
        fetchPerformance(),
        fetchModels(),
      ]);

      this.connected = connected;
      this.outputChannel.info(`[state] Connection: ${connected ? 'OK' : 'FAILED'}`);

      if (performance) {
        // API returns historical time-series data (all GPU samples over time)
        // Filter to get only the latest entry per GPU ID
        const allGpuStats = performance.gpu_stats || [];
        const latestPerGpu = new Map<number, GpuStat>();
        for (const stat of allGpuStats) {
          const gpuId = stat.id ?? 0;
          const existing = latestPerGpu.get(gpuId);
          if (!existing || (stat.timestamp && (!existing.timestamp || stat.timestamp > existing.timestamp))) {
            latestPerGpu.set(gpuId, stat);
          }
        }
        this.gpuStats = Array.from(latestPerGpu.values());
        this.sysStats = performance.sys_stats || [];
      }

      // Update models from /v1/models API
      if (models && models.data) {
        for (const modelEntry of models.data) {
          const loadStatus = modelEntry.status?.value;
          // Map 'loaded'/'unloaded' to our internal status
          const internalStatus: ModelStatus = loadStatus === 'loaded' ? 'ready' : 'stopped';
          this.models.set(modelEntry.id, { id: modelEntry.id, status: internalStatus });
        }
        this.outputChannel.info(`[state] Loaded ${models.data.length} models from /v1/models`);
      }

      this.notify();
    };

    // Initial poll
    poll();

    // Start periodic polling
    const config = getConfig();
    this.refreshTimer = setInterval(poll, config.refreshInterval);
  }

  /** Start SSE event subscription for real-time model status updates */
  private startEventSubscription(): void {
    this.eventCleanup = subscribeEvents(
      (eventType, data) => {
        this.outputChannel.info(`[state] Event: ${eventType}`, data);

        if (eventType === 'model_status' && typeof data === 'object' && data !== null) {
          const modelData = data as { id?: string; status?: ModelStatus };
          if (modelData.id && modelData.status) {
            this.models.set(modelData.id, { id: modelData.id, status: modelData.status });
            this.notify();
          }
        }
        // Note: inflight count is now tracked via slotsMonitor.getInflightCount()
        // SSE inflight events only return {operation: "snapshot"}, no count data
      },
      (error) => {
        this.outputChannel.warn(`[state] SSE error: ${error.message}`);
        this.connected = false;
        this.notify();
      }
    );
  }

  /** Get all GPU stats */
  getAllGpuStats(): GpuStat[] {
    return this.gpuStats;
  }

  /** Get the first GPU's temperature (or null if no GPU data) */
  getGpuTemperature(): number | null {
    if (this.gpuStats.length === 0) {return null;}
    return this.gpuStats[0].temp_c;
  }

  /** Get the first GPU's utilization (or null if no GPU data) */
  getGpuUtilization(): number | null {
    if (this.gpuStats.length === 0) {return null;}
    return this.gpuStats[0].gpu_util_pct;
  }

  /** Get the first GPU's VRAM usage (or null if no GPU data) */
  getGpuVramUsage(): { used: number; total: number } | null {
    if (this.gpuStats.length === 0) {return null;}
    const gpu = this.gpuStats[0];
    return { used: gpu.mem_used_mb, total: gpu.mem_total_mb };
  }

  /** Get active model IDs (models that are ready or starting) */
  getActiveModelIds(): string[] {
    const active: string[] = [];
    for (const [id, model] of this.models) {
      if (model.status === 'ready' || model.status === 'starting') {
        active.push(id);
      }
    }
    return active;
  }
}
