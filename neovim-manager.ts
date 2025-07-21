import { spawn, ChildProcess } from "child_process";
import find from "find-process";
import { attach, NeovimClient } from "neovim";
import { createConnection } from "net";
import path from "path";
import fs from "fs";
import { FileManager } from "./file-manager";

export interface NeovimInstance {
  process?: ChildProcess;
  client?: NeovimClient;
  connected: boolean;
  address?: string;
  pid?: number;
}

export interface NeovimConnectionOptions {
  timeout?: number;
  retryAttempts?: number;
  preferredSockets?: string[];
}

export class NeovimManager {
  private neovim: NeovimInstance = { connected: false };
  private fileManager: FileManager;
  private workingDir: string;

  constructor(fileManager: FileManager, workingDir: string = process.cwd()) {
    this.fileManager = fileManager;
    this.workingDir = workingDir;
    this.neovim = { connected: false };
  }

  // Find existing Neovim socket files
  private async findSocketFiles(preferredSockets: string[] = []): Promise<string[]> {
    const possibleSockets = [
      ...preferredSockets,
      "/tmp/strudel-nvim-socket",
      "/tmp/nvim-socket", 
      "/tmp/nvim",
      ...this.findTmpNvimSockets(),
      process.env.NVIM_LISTEN_ADDRESS
    ].filter(Boolean) as string[];

    // Remove duplicates
    const uniqueSockets = [...new Set(possibleSockets)];
    const validSockets: string[] = [];

    for (const socketPath of uniqueSockets) {
      try {
        // Check if socket file exists and is accessible
        if (fs.existsSync(socketPath)) {
          const stat = fs.statSync(socketPath);
          if (stat.isSocket()) {
            console.log(`✅ Found valid socket: ${socketPath}`);
            validSockets.push(socketPath);
          }
        }
      } catch (error) {
        console.log(`❌ Invalid socket ${socketPath}:`, error);
      }
    }

    return validSockets;
  }

  // Find socket files in /tmp that match Neovim patterns
  private findTmpNvimSockets(): string[] {
    const sockets: string[] = [];
    try {
      const tmpFiles = fs.readdirSync('/tmp');
      for (const file of tmpFiles) {
        if (file.startsWith('nvim') && !file.includes('.')) {
          const fullPath = path.join('/tmp', file);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isSocket()) {
              sockets.push(fullPath);
            }
          } catch (error) {
            // Skip invalid files
          }
        }
      }
    } catch (error) {
      console.error("Error scanning /tmp for socket files:", error);
    }
    return sockets;
  }

  // Test socket connection with proper error handling
  private async testSocketConnection(socketPath: string, timeout: number = 2000): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        console.log(`🧪 Testing socket connection: ${socketPath}`);
        const socket = createConnection(socketPath);
        
        const timeoutId = setTimeout(() => {
          socket.destroy();
          console.log(`⏰ Socket test timeout: ${socketPath}`);
          resolve(false);
        }, timeout);

        socket.on('connect', () => {
          clearTimeout(timeoutId);
          socket.destroy();
          console.log(`✅ Socket connection successful: ${socketPath}`);
          resolve(true);
        });

        socket.on('error', (error) => {
          clearTimeout(timeoutId);
          socket.destroy();
          console.log(`❌ Socket connection failed: ${socketPath}`, error.message);
          resolve(false);
        });

      } catch (error) {
        console.log(`❌ Socket test exception: ${socketPath}`, error);
        resolve(false);
      }
    });
  }

  // Main connection method - simplified and more reliable
  async connectToNeovim(options: NeovimConnectionOptions = {}): Promise<boolean> {
    const { timeout = 3000, retryAttempts = 2, preferredSockets = [] } = options;

    try {
      console.log("🔍 Looking for Neovim socket connections...");
      
      // Find all available socket files
      const socketFiles = await this.findSocketFiles(preferredSockets);
      
      if (socketFiles.length === 0) {
        console.log("❌ No Neovim socket files found");
        console.log("💡 Make sure Neovim is running with a socket server:");
        console.log("   - Start with: nvim --listen /tmp/strudel-nvim-socket");
        console.log("   - Or use vim.fn.serverstart() in your Neovim session");
        return false;
      }

      console.log(`🔌 Found ${socketFiles.length} potential socket(s): ${socketFiles.join(', ')}`);

      // Try each socket file
      for (const socketPath of socketFiles) {
        console.log(`🔗 Attempting connection to: ${socketPath}`);

        // Test if socket is responsive
        const isResponsive = await this.testSocketConnection(socketPath, timeout);
        if (!isResponsive) {
          console.log(`❌ Socket not responsive: ${socketPath}`);
          continue;
        }

        // Try to establish RPC connection
        let client: NeovimClient | null = null;
        let connectionSuccess = false;

        for (let attempt = 1; attempt <= retryAttempts; attempt++) {
          try {
            console.log(`🔄 Connection attempt ${attempt}/${retryAttempts} to ${socketPath}`);
            
            const socket = createConnection(socketPath);
            client = attach({ reader: socket, writer: socket });
            
            // Test the RPC connection with a simple command
            await client.command('echo "Connected from external server!"');
            
            connectionSuccess = true;
            console.log(`✅ RPC connection established to: ${socketPath}`);
            break;
            
          } catch (error) {
            console.log(`❌ RPC attempt ${attempt} failed:`, error);
            if (client) {
              try {
                await client.quit();
              } catch (e) {
                // Ignore cleanup errors
              }
              client = null;
            }
            
            if (attempt < retryAttempts) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }

        if (connectionSuccess && client) {
          this.neovim = {
            client,
            connected: true,
            address: socketPath
          };

          console.log(`🎉 Successfully connected to Neovim via: ${socketPath}`);
          
          // Scan buffers after successful connection
          await this.scanNeovimBuffers();
          return true;
        }
      }

      console.log("❌ Could not establish connection to any Neovim socket");
      console.log("💡 Troubleshooting:");
      console.log("   1. Ensure Neovim is running with socket server");
      console.log("   2. Check socket permissions");
      console.log("   3. Verify socket paths are correct");
      return false;

    } catch (error) {
      console.error("❌ Error during Neovim connection:", error);
      return false;
    }
  }

  // Enhanced buffer scanning with better error handling
  async scanNeovimBuffers(): Promise<void> {
    if (!this.neovim.connected || !this.neovim.client) {
      console.log("⚠️ Neovim not connected, cannot scan buffers");
      return;
    }

    try {
      console.log("📋 Scanning Neovim buffers...");

      const buffers = await this.neovim.client.buffers;
      let bufferCount = 0;

      // Clear existing files first
      this.fileManager.clear();

      for (const buffer of buffers) {
        try {
          const name = await buffer.name;
          
          // Skip unnamed, terminal, or special buffers
          if (!name || name === '' || name.includes('[No Name]') || name.startsWith('term://')) {
            continue;
          }

          const isLoaded = await buffer.loaded;
          if (!isLoaded) {
            console.log(`Skipping unloaded buffer: ${name}`);
            continue;
          }

          const lines = await buffer.lines;
          const content = lines.join('\n');
          
          const bufferData = {
            path: name,
            name: path.basename(name),
            content,
            bufnr: buffer.id
          };

          this.fileManager.addBufferFile(bufferData);
          bufferCount++;
          console.log(`📁 Added buffer: ${name}`);

        } catch (bufferError) {
          console.error(`❌ Error processing buffer ${buffer.id}:`, bufferError);
        }
      }

      console.log(`✅ Successfully loaded ${bufferCount} buffers from Neovim`);

    } catch (error) {
      console.error("❌ Error scanning Neovim buffers:", error);
      throw error;
    }
  }

  // Get current buffer with error handling
  async getCurrentBuffer(): Promise<{ content: string; path: string } | null> {
    if (!this.neovim.connected || !this.neovim.client) {
      console.log("❌ Cannot get buffer: Neovim not connected");
      return null;
    }

    try {
      const buffer = await this.neovim.client.buffer;
      const lines = await buffer.lines;
      const name = await buffer.name;

      return {
        content: lines.join('\n'),
        path: name
      };
    } catch (error) {
      console.error("❌ Error getting current buffer:", error);
      return null;
    }
  }

  // Send command to Neovim
  async sendCommand(command: string): Promise<boolean> {
    if (!this.neovim.connected || !this.neovim.client) {
      console.log("❌ Cannot send command: Neovim not connected");
      return false;
    }

    try {
      await this.neovim.client.command(command);
      console.log(`✅ Command executed: ${command}`);
      return true;
    } catch (error) {
      console.error(`❌ Command failed "${command}":`, error);
      return false;
    }
  }

  // Status and getters
  isConnected(): boolean {
    return this.neovim.connected;
  }

  getStatus() {
    return {
      connected: this.neovim.connected,
      address: this.neovim.address,
      hasClient: !!this.neovim.client
    };
  }

  getClient(): NeovimClient | null {
    return this.neovim.client || null;
  }

  // Cleanup with proper error handling
  async cleanup(): Promise<void> {
    console.log("🧹 Cleaning up Neovim connections...");

    if (this.neovim.client) {
      try {
        // Don't quit the Neovim instance, just disconnect
        this.neovim.client = null;
      } catch (error) {
        console.error("Error during client cleanup:", error);
      }
    }

    this.neovim = { connected: false };
    console.log("✅ Neovim manager cleanup completed");
  }
}
