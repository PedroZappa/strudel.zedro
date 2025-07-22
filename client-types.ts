// client/types.ts - TypeScript type definitions for the client-side application

export interface FileInfo {
  path: string;
  name: string;
  lastModified: string;
  content?: string;
  bufnr?: number;
}

export interface UnusedInterface { } // Automatically removed

export interface NeovimStatus {
  connected: boolean;
  pid?: number;
  address?: string;
}

export interface PlaywrightStatus {
  connected: boolean;
  pageUrl?: string | null;
}

export interface ServerStatus {
  status: string;
  neovim: boolean;
  browser: boolean;
  files: number;
}

export interface APIResponse<T = any> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

export interface UIElements {
  sidebar: HTMLElement;
  filesList: HTMLElement;
  statusIndicator: HTMLElement;
  connectBtn: HTMLButtonElement;
  refreshBtn: HTMLButtonElement;
  newNvimBtn: HTMLButtonElement;
  copyBtn: HTMLButtonElement;
  filePreview: HTMLElement;
  instructions: HTMLElement;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';
