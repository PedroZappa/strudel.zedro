// client/app.ts - Main application initialization and coordination
import { StrudelAPI } from './client-api';
import { UIManager } from './client-ui';
import type { FileInfo } from './client-types';
import { initStrudel } from '@strudel/web';

export class StrudelApp {
  private api: StrudelAPI;
  private ui: UIManager;
  private autoRefreshInterval?: number;
  private files: FileInfo[] = [];

  constructor() {
    this.api = new StrudelAPI();
    this.ui = new UIManager();
    this.bindEventHandlers();
  }

  private bindEventHandlers(): void {
    // File selection
    this.ui.onFileSelect = async (filePath: string) => {
      await this.handleFileSelect(filePath);
    };

    // Connect to Neovim
    this.ui.onConnectClick = async () => {
      await this.handleConnectToNeovim();
    };

    // Refresh files
    this.ui.onRefreshClick = async () => {
      await this.handleRefreshFiles();
    };

    // Copy file content
    this.ui.onCopyClick = async () => {
      await this.ui.copySelectedFile();
    };

    // New Neovim (placeholder for future implementation)
    this.ui.onNewNeovimClick = () => {
      this.ui.showNotification('New Neovim instance feature coming soon!', 'info');
    };
  }

  // Initialize the application
  async initialize(): Promise<void> {
    console.log('🚀 Initializing Strudel App...');

    try {
      // Create custom canvas
      this.createCustomCanvas();

      // Check server health
      await this.checkServerHealth();

      // Check initial Neovim connection
      await this.checkNeovimConnection();

      // Load initial files
      await this.loadFiles();

      // Start auto-refresh
      this.startAutoRefresh();

      // Initialize Strudel
      await initStrudel();

      console.log('✅ Strudel App initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize app:', error);
      this.ui.showNotification('Failed to initialize application', 'error');
    }
  }

  createCustomCanvas() {
    // Remove any existing canvas
    const existingCanvas = document.getElementById('test-canvas');
    if (existingCanvas) {
      existingCanvas.remove();
    }

    // Create new canvas with your dimensions
    const canvas = document.createElement('canvas');
    canvas.id = 'test-canvas';
    canvas.width = 1920;
    canvas.height = 1080;
    canvas.style.cssText = 'pointer-events:none;width:100%;height:100%;position:fixed;top:0;left:0;';

    document.body.prepend(canvas);
    return canvas;
  }

  // In your client-app.ts, add this after initStrudel()
  configureStrudelCanvas() {
    const canvas = document.getElementById('test-canvas') as HTMLCanvasElement;
    if (canvas) {
      // Override the canvas bitmap dimensions
      canvas.width = 1920;  // Your desired width
      canvas.height = 1080; // Your desired height

      // Optionally adjust CSS size if needed
      canvas.style.width = '100%';
      canvas.style.height = '100%';
    }
  }

  // Server health check
  private async checkServerHealth(): Promise<void> {
    const response = await this.api.getServerStatus();

    if (!response.success || !response.data) {
      throw new Error('Server health check failed');
    }

    console.log('📊 Server status:', response.data);
  }

  // Check Neovim connection status
  private async checkNeovimConnection(): Promise<void> {
    const response = await this.api.getNeovimStatus();

    if (response.success && response.data) {
      const connected = response.data.connected;
      this.ui.updateConnectionStatus(
        connected ? 'connected' : 'disconnected',
        connected ? 'Neovim is connected' : 'Neovim not connected'
      );
    } else {
      this.ui.updateConnectionStatus('disconnected', 'Failed to check Neovim status');
    }
  }

  // Handle connecting to Neovim
  private async handleConnectToNeovim(): Promise<void> {
    this.ui.updateConnectionStatus('connecting', 'Connecting to Neovim...');

    const response = await this.api.connectToNeovim();

    if (response.success && response.data?.success) {
      this.ui.updateConnectionStatus('connected', response.data.message);
      // Refresh files after successful connection
      await this.loadFiles();
    } else {
      this.ui.updateConnectionStatus('disconnected',
        response.data?.message || response.error || 'Failed to connect to Neovim'
      );
    }
  }

  // Load files from server
  private async loadFiles(): Promise<void> {
    const response = await this.api.getFiles();

    if (response.success && response.data) {
      this.files = response.data;
      this.ui.renderFiles(this.files);
      console.log(`📁 Loaded ${this.files.length} files`);
    } else {
      console.error('Failed to load files:', response.error);
      this.ui.showNotification('Failed to load files', 'error');
      this.ui.renderFiles([]);
    }
  }

  // Handle file refresh
  private async handleRefreshFiles(): Promise<void> {
    const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
    this.ui.setLoading(refreshBtn, true);

    try {
      // Trigger server-side file refresh
      const refreshResponse = await this.api.refreshFiles();

      if (refreshResponse.success) {
        // Reload files
        await this.loadFiles();
        this.ui.showNotification('Files refreshed successfully', 'success');
      } else {
        this.ui.showNotification('Failed to refresh files', 'error');
      }
    } finally {
      this.ui.setLoading(refreshBtn, false);
    }
  }

  // Handle file selection
  private async handleFileSelect(filePath: string): Promise<void> {
    console.log(`📂 Selecting file: ${filePath}`);

    // Find file in current list
    let file = this.files.find(f => f.path === filePath);

    if (!file) {
      console.error('File not found in current list');
      return;
    }

    // If file doesn't have content, fetch it
    if (!file.content) {
      const response = await this.api.getFileContent(filePath);

      if (response.success && response.data) {
        file = response.data;
        // Update file in list
        const index = this.files.findIndex(f => f.path === filePath);
        if (index !== -1) {
          this.files[index] = file;
        }
      } else {
        this.ui.showNotification('Failed to load file content', 'error');
        return;
      }
    }

    this.ui.selectFile(file);
  }

  // Auto-refresh functionality
  private startAutoRefresh(): void {
    // Clear existing interval if any
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }

    // Refresh every 5 seconds
    this.autoRefreshInterval = setInterval(async () => {
      try {
        await this.loadFiles();
        await this.checkNeovimConnection();
      } catch (error) {
        console.error('Auto-refresh error:', error);
      }
    }, 5000);

    console.log('⏰ Auto-refresh started (5s interval)');
  }

  private stopAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = undefined;
      console.log('⏸️ Auto-refresh stopped');
    }
  }

  // Send code to Strudel
  async sendToStrudel(code?: string): Promise<void> {
    const codeToSend = code || this.ui.selectedFileContent;

    if (!codeToSend) {
      this.ui.showNotification('No code to send', 'error');
      return;
    }

    const response = await this.api.sendCodeToStrudel(codeToSend);

    if (response.success && response.data?.success) {
      this.ui.showNotification('Code sent to Strudel successfully!', 'success');
    } else {
      const message = response.data?.message || response.error || 'Failed to send code';
      this.ui.showNotification(message, 'error');
    }
  }

  // Cleanup when page unloads
  cleanup(): void {
    this.stopAutoRefresh();
    console.log('🧹 App cleanup completed');
  }

  // Public getters for debugging
  get currentFiles(): FileInfo[] {
    return this.files;
  }

  get selectedFile(): string | null {
    return this.ui.selectedFileContent;
  }
}

// Global app instance and initialization
let app: StrudelApp;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  app = new StrudelApp();
  await app.initialize();

  // Bind button events after app is initialized
  const connectBtn = document.getElementById('connect-btn');
  const refreshBtn = document.getElementById('refresh-btn');
  const copyBtn = document.getElementById('copy-btn');
  const newNvimBtn = document.getElementById('new-nvim-btn');

  if (connectBtn) {
    connectBtn.addEventListener('click', () => app.ui.onConnectClick?.());
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => app.ui.onRefreshClick?.());
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', () => app.ui.onCopyClick?.());
  }

  if (newNvimBtn) {
    newNvimBtn.addEventListener('click', () => app.ui.onNewNeovimClick?.());
  }

  // Global cleanup
  window.addEventListener('beforeunload', () => {
    app.cleanup();
  });
});

// Export for debugging in console
if (typeof window !== 'undefined') {
  (window as any).strudelApp = app;
}
