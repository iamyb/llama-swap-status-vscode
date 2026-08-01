import * as vscode from 'vscode';

/** Extension configuration settings */
export interface ExtensionConfig {
  url: string;
  refreshInterval: number;
  statusBarPosition: 'left' | 'right';
  showGpuInfo: boolean;
  showModelInfo: boolean;
  showSpeedInfo: boolean;
  showPromptProgress: boolean;
  slotsPollInterval: number;
}

/** Default configuration values */
const DEFAULTS: ExtensionConfig = {
  url: 'http://localhost:8080',
  refreshInterval: 3000,
  statusBarPosition: 'right',
  showGpuInfo: true,
  showModelInfo: false,
  showSpeedInfo: true,
  showPromptProgress: true,
  slotsPollInterval: 1000,
};

/** Get current configuration from VS Code settings */
export function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('llamaSwap');
  return {
    url: config.get<string>('url', DEFAULTS.url),
    refreshInterval: config.get<number>('refreshInterval', DEFAULTS.refreshInterval),
    statusBarPosition: config.get<'left' | 'right'>('statusBarPosition', DEFAULTS.statusBarPosition),
    showGpuInfo: config.get<boolean>('showGpuInfo', DEFAULTS.showGpuInfo),
    showModelInfo: config.get<boolean>('showModelInfo', DEFAULTS.showModelInfo),
    showSpeedInfo: config.get<boolean>('showSpeedInfo', DEFAULTS.showSpeedInfo),
    showPromptProgress: config.get<boolean>('showPromptProgress', DEFAULTS.showPromptProgress),
    slotsPollInterval: config.get<number>('slotsPollInterval', DEFAULTS.slotsPollInterval),
  };
}

/** Get the base URL (without trailing slash) */
export function getBaseUrl(): string {
  const config = getConfig();
  return config.url.replace(/\/+$/, '');
}
