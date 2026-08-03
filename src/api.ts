import { PerformanceResponse, ActivityLogEntry, SlotsResponse, ModelsResponse, RunningResponse } from './types';
import { getBaseUrl } from './config';
import { EventSource } from 'eventsource';

/** Fetch GPU and system performance stats */
export async function fetchPerformance(): Promise<PerformanceResponse | null> {
  const baseUrl = getBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/api/performance`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json() as PerformanceResponse;
  } catch (error) {
    console.error(`[llama-swap] Failed to fetch performance:`, error);
    return null;
  }
}

/** Fetch recent activity logs */
export async function fetchActivity(limit: number = 5): Promise<ActivityLogEntry[] | null> {
  const baseUrl = getBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/api/activity?limit=${limit}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json() as ActivityLogEntry[];
  } catch (error) {
    console.error(`[llama-swap] Failed to fetch activity:`, error);
    return null;
  }
}

/** Fetch slot states from llama-server via llama-swap proxy */
export async function fetchSlots(modelId: string, signal?: AbortSignal): Promise<SlotsResponse | null> {
  const baseUrl = getBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/upstream/${modelId}/slots`, { signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json() as unknown;
    // API versions may return either [SlotState, ...] or { value: [SlotState, ...] }.
    if (Array.isArray(data)) {
      return data as SlotsResponse;
    }
    if (typeof data === 'object' && data !== null && 'value' in data) {
      const value = (data as { value?: unknown }).value;
      if (Array.isArray(value)) {
        return value as SlotsResponse;
      }
    }
    return null;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return null;
    }
    console.error(`[llama-swap] Failed to fetch slots for ${modelId}:`, error);
    return null;
  }
}

/** Fetch models that are currently running without routing through an upstream. */
export async function fetchRunning(signal?: AbortSignal): Promise<RunningResponse | null> {
  const baseUrl = getBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/running`, { signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json() as RunningResponse;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return null;
    }
    console.error('[llama-swap] Failed to fetch running models:', error);
    return null;
  }
}

/** Fetch list of available models from /v1/models */
export async function fetchModels(): Promise<ModelsResponse | null> {
  const baseUrl = getBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/v1/models`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json() as ModelsResponse;
  } catch (error) {
    console.error(`[llama-swap] Failed to fetch models:`, error);
    return null;
  }
}

/** Subscribe to SSE events from /api/events */
export function subscribeEvents(
  callback: (eventType: string, data: unknown) => void,
  onError?: (error: Error) => void
): () => void {
  const baseUrl = getBaseUrl();
  let es: EventSource | null = null;

  function connect() {
    es = new EventSource(`${baseUrl}/api/events`);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        callback(data.type || 'unknown', data);
      } catch (error) {
        console.error('[llama-swap] Failed to parse SSE event:', error);
      }
    };

    es.onerror = (error) => {
      console.error('[llama-swap] SSE connection error:', error);
      onError?.(new Error('SSE connection lost'));
      // EventSource auto-reconnects, but we track the error
    };
  }

  connect();

  // Return cleanup function
  return () => {
    es?.close();
    es = null;
  };
}

/** Check if the llama-swap server is reachable */
export async function checkConnection(): Promise<boolean> {
  const baseUrl = getBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/api/performance`, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}
