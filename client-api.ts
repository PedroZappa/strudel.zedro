// client/api.ts - API communication module
import type { FileInfo, NeovimStatus, ServerStatus, APIResponse } from './client-types';

export class StrudelAPI {
  private baseURL: string;

  constructor(baseURL: string = '') {
    this.baseURL = baseURL;
  }

  private async request<T = any>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<APIResponse<T>> {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        data
      };
    } catch (error) {
      console.error(`API request failed for ${endpoint}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // File management
  async getFiles(): Promise<APIResponse<FileInfo[]>> {
    return this.request<FileInfo[]>('/api/files');
  }

  async refreshFiles(): Promise<APIResponse<{ success: boolean }>> {
    return this.request('/api/files', { method: 'POST' });
  }

  async getFileContent(filePath: string): Promise<APIResponse<FileInfo>> {
    const encodedPath = encodeURIComponent(filePath);
    return this.request<FileInfo>(`/api/file/${encodedPath}`);
  }

  async updateFileContent(filePath: string, content: string): Promise<APIResponse<{ success: boolean }>> {
    const encodedPath = encodeURIComponent(filePath);
    return this.request(`/api/file/${encodedPath}`, {
      method: 'PUT',
      body: JSON.stringify({ content })
    });
  }

  // Neovim integration
  async connectToNeovim(): Promise<APIResponse<{ success: boolean; message: string }>> {
    return this.request('/api/neovim/connect', { method: 'POST' });
  }

  async getNeovimStatus(): Promise<APIResponse<NeovimStatus>> {
    return this.request<NeovimStatus>('/api/neovim/status');
  }

  // Browser/Playwright control
  async initBrowser(): Promise<APIResponse<{ success: boolean; message: string }>> {
    return this.request('/api/browser/init', { method: 'POST' });
  }

  async sendCodeToStrudel(code: string): Promise<APIResponse<{ success: boolean; message: string }>> {
    return this.request('/api/browser/send-code', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
  }

  async sendCurrentBuffer(code: string): Promise<string> {
    try {
      const response = await fetch('/api/send-current-buffer', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: code
      });

      return await response.text();
    } catch (error) {
      console.error('Failed to send buffer:', error);
      return `❌ Error: ${error}`;
    }
  }

  // Health check
  async getServerStatus(): Promise<APIResponse<ServerStatus>> {
    return this.request<ServerStatus>('/health');
  }

  // Stop Strudel playback
  async stopStrudel(): Promise<APIResponse<{ success: boolean }>> {
    return this.request('/api/hush', { method: 'POST' });
  }
}
