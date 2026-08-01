/**
 * Type definitions for llama-swap API responses
 * Based on llama-swap source: internal/perf/types.go, internal/store/store.go
 */

/** GPU statistics from /api/performance */
export interface GpuStat {
  id?: number;
  timestamp?: string;
  name?: string;
  uuid?: string;
  temp_c: number;
  vram_temp_c: number;
  gpu_util_pct: number;
  mem_util_pct: number;
  mem_used_mb: number;
  mem_total_mb: number;
  fan_speed_pct: number;
  power_draw_w: number;
}

/** System statistics from /api/performance */
export interface SysStat {
  cpu_usage_pct: number;
  mem_used_mb: number;
  mem_total_mb: number;
}

/** Performance response from /api/performance */
export interface PerformanceResponse {
  sys_stats: SysStat[];
  gpu_stats: GpuStat[];
}

/** Token metrics from activity log */
export interface TokenMetrics {
  cache_tokens: number;
  draft_tokens: number;
  draft_acc_tokens: number;
  input_tokens: number;
  output_tokens: number;
  prompt_per_second: number;
  tokens_per_second: number;
}

/** Model status values from events */
export type ModelStatus = 'ready' | 'starting' | 'stopping' | 'stopped' | 'shutdown' | 'unknown';

/** Model status values from /v1/models API */
export type ModelLoadStatus = 'loaded' | 'unloaded';

/** Model information from events */
export interface ModelInfo {
  id: string;
  status: ModelStatus;
}

/** Model entry from /v1/models API */
export interface ModelEntry {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  meta: { llamaswap: { type: string } };
  status: { value: ModelLoadStatus };
}

/** Response from /v1/models API */
export interface ModelsResponse {
  object: string;
  data: ModelEntry[];
}

/** Activity log entry from /api/activity */
export interface ActivityLogEntry {
  id: string;
  model_id: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  token_metrics: TokenMetrics;
  error?: string;
}

/** SSE event from /api/events */
export interface EventMessage {
  type: 'model_status' | 'inflight_count' | 'upstream_ready';
  data: ModelInfo | { count: number } | { model_id: string };
}

/** Slot state from llama-server /slots endpoint */
export interface SlotState {
  id: number;
  is_processing: boolean;
  n_prompt_tokens: number;
  n_prompt_tokens_processed: number;
  n_prompt_tokens_cache: number;
  n_ctx: number;
  speculative: boolean;
  id_task: number;
  params: Record<string, unknown>;
  next_token: Array<{
    has_next_token: boolean;
    has_new_line: boolean;
    n_remain: number;
    n_decoded: number;
  }>;
}

/** Slots response from llama-server /slots - returns array directly */
export type SlotsResponse = SlotState[];
