import * as vscode from 'vscode';
import { StatusBarState } from './state';
import { StatusBarManager } from './statusbar';
import { SlotsMonitor } from './slotsMonitor';
import { DetailPanel } from './panel';
import { getBaseUrl } from './config';

let state: StatusBarState | null = null;
let statusBar: StatusBarManager | null = null;
let slotsMonitor: SlotsMonitor | null = null;
let outputChannel: vscode.LogOutputChannel | null = null;

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Llama Swap Status', { log: true });
  context.subscriptions.push(outputChannel);

  outputChannel.info('=== Llama Swap Status Extension Activated ===');

  // Initialize state management
  state = new StatusBarState(outputChannel);
  context.subscriptions.push({
    dispose: () => state?.stop(),
  });

  // Initialize slots monitor
  slotsMonitor = new SlotsMonitor(outputChannel);
  context.subscriptions.push({
    dispose: () => slotsMonitor?.stop(),
  });

  // Initialize status bar
  statusBar = new StatusBarManager(state, slotsMonitor, outputChannel);
  context.subscriptions.push(statusBar);

  // Register state change callback for status bar updates
  state.onChange(() => {
    statusBar?.update();
    // Update slots monitor with the first active model
    const activeModels = state?.getActiveModelIds() || [];
    slotsMonitor?.setModelId(activeModels[0] ?? null);
  });

  // Register slots change callback for status bar updates (speed + prompt progress)
  slotsMonitor.onChange(() => {
    statusBar?.update();
  });

  // Register commands
  registerCommand(context, 'llamaSwap.openPanel', () => {
    if (!state || !slotsMonitor) {return;}
    DetailPanel.createOrShow(context.extensionUri, state, slotsMonitor);
  });

  registerCommand(context, 'llamaSwap.openWebUI', () => {
    const baseUrl = getBaseUrl();
    vscode.env.openExternal(vscode.Uri.parse(baseUrl));
  });

  registerCommand(context, 'llamaSwap.toggleStatusBar', () => {
    if (statusBar) {
      const bar = statusBar;
      bar.hide();
      setTimeout(() => bar.show(), 100);
    }
  });

  registerCommand(context, 'llamaSwap.refresh', () => {
    if (state) {
      outputChannel?.info('[command] Manual refresh triggered');
      state.stop();
      state.start();
    }
  });

  // Start monitoring
  state.start();
  slotsMonitor.start();
  statusBar.show();

  outputChannel.info('Extension initialized successfully');
}

// This method is called when your extension is deactivated
export function deactivate() {
  state?.stop();
  slotsMonitor?.stop();
  statusBar?.dispose();
  outputChannel?.dispose();
  state = null;
  statusBar = null;
  slotsMonitor = null;
  outputChannel = null;
}

/** Helper to register commands with proper disposal tracking */
function registerCommand(
  context: vscode.ExtensionContext,
  commandId: string,
  callback: (...args: unknown[]) => void
): void {
  const disposable = vscode.commands.registerCommand(commandId, callback);
  context.subscriptions.push(disposable);
}
