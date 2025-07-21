// client/ui.ts - UI management and DOM manipulation
import { FileInfo, ConnectionStatus, UIElements } from './types';

export class UIManager {
  private elements: UIElements;
  private selectedFile: FileInfo | null = null;
  private connectionStatus: ConnectionStatus = 'disconnected';

  constructor() {
    this.elements = this.initializeElements();
    this.bindEvents();
  }

  private initializeElements(): UIElements {
    const getElement = <T extends HTMLElement>(selector: string): T => {
      const element = document.querySelector(selector) as T;
      if (!element) {
        throw new Error(`Element not found: ${selector}`);
      }
      return element;
    };

    return {
      sidebar: getElement<HTMLElement>('#sidebar'),
      filesList: getElement<HTMLElement>('#files'),
      statusIndicator: getElement<HTMLElement>('#status-indicator'),
      connectBtn: getElement<HTMLButtonElement>('#connect-btn'),
      refreshBtn: getElement<HTMLButtonElement>('#refresh-btn'),
      newNvimBtn: getElement<HTMLButtonElement>('#new-nvim-btn'),
      copyBtn: getElement<HTMLButtonElement>('#copy-btn'),
      filePreview: getElement<HTMLElement>('#file-preview'),
      instructions: getElement<HTMLElement>('#instructions'),
    };
  }

  private bindEvents(): void {
    // File list click handling
    this.elements.filesList.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const fileItem = target.closest('.file-item') as HTMLElement;
      
      if (fileItem) {
        const filePath = fileItem.getAttribute('data-path');
        if (filePath) {
          this.onFileSelect?.(filePath);
        }
      }
    });

    // Button event handlers will be set by the main application
  }

  // Event handler setters (to be called from main app)
  onFileSelect?: (filePath: string) => void;
  onConnectClick?: () => void;
  onRefreshClick?: () => void;
  onNewNeovimClick?: () => void;
  onCopyClick?: () => void;

  // Status management
  updateConnectionStatus(status: ConnectionStatus, message?: string): void {
    this.connectionStatus = status;
    
    // Update status indicator
    this.elements.statusIndicator.className = `status-indicator status-${status}`;
    
    // Update connect button
    switch (status) {
      case 'connecting':
        this.elements.connectBtn.textContent = '⏳ Connecting...';
        this.elements.connectBtn.disabled = true;
        break;
      case 'connected':
        this.elements.connectBtn.textContent = '✅ Connected';
        this.elements.connectBtn.disabled = false;
        break;
      case 'disconnected':
        this.elements.connectBtn.textContent = '🔌 Connect to Neovim';
        this.elements.connectBtn.disabled = false;
        break;
    }

    // Show message if provided
    if (message) {
      this.showNotification(message, status === 'connected' ? 'success' : 'error');
    }
  }

  // File list rendering
  renderFiles(files: FileInfo[]): void {
    if (files.length === 0) {
      this.elements.filesList.innerHTML = `
        <div class="no-files">
          <p>No files found</p>
          <p class="hint">Make sure Neovim is connected or files exist in the working directory</p>
        </div>
      `;
      return;
    }

    this.elements.filesList.innerHTML = files
      .map(file => this.createFileItemHTML(file))
      .join('');
  }

  private createFileItemHTML(file: FileInfo): string {
    const isSelected = this.selectedFile?.path === file.path;
    const lastModified = new Date(file.lastModified).toLocaleString();
    
    return `
      <div class="file-item ${isSelected ? 'selected' : ''}" data-path="${file.path}">
        <div class="file-name">${this.escapeHTML(file.name)}</div>
        <div class="file-path">${this.escapeHTML(file.path)}</div>
        <div class="file-modified">${lastModified}</div>
      </div>
    `;
  }

  // File selection and preview
  selectFile(file: FileInfo): void {
    this.selectedFile = file;
    
    // Update file list visual selection
    const fileItems = this.elements.filesList.querySelectorAll('.file-item');
    fileItems.forEach(item => {
      item.classList.remove('selected');
      if (item.getAttribute('data-path') === file.path) {
        item.classList.add('selected');
      }
    });

    // Show file preview
    if (file.content) {
      this.showFilePreview(file);
    }
  }

  private showFilePreview(file: FileInfo): void {
    const preview = this.elements.filePreview;
    const truncatedContent = file.content!.length > 500 
      ? file.content!.substring(0, 500) + '...' 
      : file.content!;

    preview.innerHTML = `
      <div class="file-preview-header">
        <strong>${this.escapeHTML(file.name)}</strong>
        <span class="file-size">${file.content!.length} chars</span>
      </div>
      <pre class="file-content">${this.escapeHTML(truncatedContent)}</pre>
    `;

    preview.style.display = 'block';
    this.elements.copyBtn.style.display = 'block';
  }

  // Copy functionality
  async copySelectedFile(): Promise<boolean> {
    if (!this.selectedFile?.content) {
      this.showNotification('No file selected or file has no content', 'error');
      return false;
    }

    try {
      await navigator.clipboard.writeText(this.selectedFile.content);
      this.showNotification(`Copied ${this.selectedFile.name} to clipboard`, 'success');
      return true;
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      this.showNotification('Failed to copy to clipboard', 'error');
      return false;
    }
  }

  // Notifications
  showNotification(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(n => n.remove());

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    // Add to document
    document.body.appendChild(notification);

    // Remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 5000);
  }

  // Loading states
  setLoading(element: HTMLButtonElement, loading: boolean, originalText?: string): void {
    if (loading) {
      element.disabled = true;
      element.setAttribute('data-original-text', element.textContent || '');
      element.textContent = '⏳ Loading...';
    } else {
      element.disabled = false;
      const original = originalText || element.getAttribute('data-original-text') || 'Button';
      element.textContent = original;
      element.removeAttribute('data-original-text');
    }
  }

  // Utility methods
  private escapeHTML(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Getters
  get selectedFileContent(): string | null {
    return this.selectedFile?.content || null;
  }

  get isConnected(): boolean {
    return this.connectionStatus === 'connected';
  }
}
