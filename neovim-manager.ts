// server/neovim-manager.ts - Neovim RPC connection and buffer management
import { spawn, ChildProcess } from "child_process";
import find from "find-process";
import { attach, NeovimClient } from "neovim";
import { createConnection } from "net";
import path from "path";
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
  }

  // Find running Neovim processes
  async findRunningNeovim(): Promise<{ pid: number; address?: string }[]> {
    try {
      const processes = await find('name', /n?vim/, true);
      const neovimProcesses = processes.filter(p => 
        (p.name.includes('nvim') || p.name.includes('neovim')) && 
        !p.cmd.includes('--embed') && // Skip embedded instances
        !p.cmd.includes('--headless') // Skip headless instances unless they have --listen
      );

      console.log(`🔍 Found ${neovimProcesses.length} running Neovim processes`);

      return neovimProcesses.map(p => ({
        pid: p.pid,
        address: process.env.NVIM_LISTEN_ADDRESS || `/tmp/nvim-${p.pid}`
      }));
    } catch (error) {
      console.error("❌ Error finding Neovim processes:", error);
      return [];
    }
  }

  // Test socket connection
  private async testSocket(socketPath: string, timeout: number = 1000): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const testConnection = createConnection(socketPath);
        
        const timeoutId = setTimeout(() => {
          testConnection.destroy();
          resolve(false);
        }, timeout);

        testConnection.on('connect', () => {
          clearTimeout(timeoutId);
          testConnection.destroy();
          resolve(true);
        });

        testConnection.on('error', () => {
          clearTimeout(timeoutId);
          testConnection.destroy();
          resolve(false);
        });
      } catch {
        resolve(false);
      }
    });
  }

  // Connect to existing Neovim instance
  async connectToNeovim(options: NeovimConnectionOptions = {}): Promise<boolean> {
    const {
      timeout = 2000,
      retryAttempts = 3,
      preferredSockets = ['/tmp/nvim-socket', '/tmp/nvim']
    } = options;

    try {
      console.log("🔍 Looking for running Neovim instances...");
      const runningInstances = await this.findRunningNeovim();

      if (runningInstances.length === 0) {
        console.log("❌ No running Neovim instances found");
        console.log("💡 Start Neovim with: nvim --listen /tmp/nvim-socket");
        return false;
      }

      // Try to connect to each instance
      for (const instance of runningInstances) {
        console.log(`🔌 Attempting to connect to Neovim PID: ${instance.pid}`);

        const socketsToTry = [
          ...preferredSockets,
          instance.address,
          `/tmp/nvim-${instance.pid}`,
          `/tmp/nvimsocket-${instance.pid}`,
          process.env.NVIM_LISTEN_ADDRESS
        ].filter(Boolean) as string[];

        // Remove duplicates
        const uniqueSockets = [...new Set(socketsToTry)];

        for (const socketPath of uniqueSockets) {
          try {
            console.log(`🧪 Testing socket: ${socketPath}`);
            
            const socketAvailable = await this.testSocket(socketPath, timeout);
            if (!socketAvailable) {
              console.log(`❌ Socket not available: ${socketPath}`);
              continue;
            }

            console.log(`✅ Found working socket: ${socketPath}`);
            console.log(`🔗 Establishing RPC connection to: ${socketPath}`);

            // Establish RPC connection with retry logic
            let client: NeovimClient | null = null;
            
            for (let attempt = 1; attempt <= retryAttempts; attempt++) {
              try {
                const socket = createConnection(socketPath);
                client = attach({ reader: socket, writer: socket });
                
                // Test the connection
                await client.command('echo "Connected from Bun server!"');
                break;
              } catch (error) {
                console.log(`Attempt ${attempt}/${retryAttempts} failed:`, error);
                if (attempt === retryAttempts) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }

            if (!client) {
              throw new Error("Failed to establish RPC client");
            }

            this.neovim = {
              client,
              connected: true,
              pid: instance.pid,
              address: socketPath
            };

            console.log(`✅ Successfully connected to Neovim (PID: ${instance.pid})`);
            
            // Scan buffers after successful connection
            await this.scanNeovimBuffers();
            return true;

          } catch (error) {
            console.log(`❌ Failed to connect via ${socketPath}:`, error);
            continue;
          }
        }

        console.log(`❌ No working sockets found for PID ${instance.pid}`);
      }

      console.log("❌ Could not connect to any Neovim instances");
      console.log("💡 Try: nvim --listen /tmp/nvim-socket");
      return false;
    } catch (error) {
      console.error("❌ Error connecting to Neovim:", error);
      return false;
    }
  }

  // Scan Neovim buffers and add to file manager
  async scanNeovimBuffers(): Promise<void> {
    if (!this.neovim.connected || !this.neovim.client) {
      console.log("⚠️ Neovim not connected, cannot scan buffers");
      return;
    }

    try {
      console.log("📋 Getting buffer list from Neovim...");

      // Get list of all buffers
      const buffers = await this.neovim.client.buffers;
      let bufferCount = 0;

      // Clear existing files first
      this.fileManager.clear();

      for (const buffer of buffers) {
        try {
          // Get buffer info
          const bufnr = buffer.id;
          const name = await buffer.name;
          const lines = await buffer.lines;
          
          // Skip unnamed, terminal, or empty buffers
          if (!name || name.startsWith('term://') || name === '' || name.includes('[No Name]')) {
            continue;
          }

          // Skip if buffer is not loaded
          const isLoaded = await buffer.loaded;
          if (!isLoaded) {
            continue;
          }

          const content = lines.join('\n');
          const bufferData = {
            path: name,
            name: path.basename(name),
            content,
            bufnr
          };

          this.fileManager.addBufferFile(bufferData);
          bufferCount++;

        } catch (error) {
          console.error(`❌ Error processing buffer ${buffer.id}:`, error);
        }
      }

      console.log(`📁 Loaded ${bufferCount} buffers from Neovim session`);

    } catch (error) {
      console.error("❌ Error scanning Neovim buffers:", error);
      throw error;
    }
  }

  // Get current buffer content
  async getCurrentBuffer(): Promise<{ content: string; path: string } | null> {
    if (!this.neovim.connected || !this.neovim.client) {
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
      console.log("❌ Neovim not connected");
      return false;
    }

    try {
      await this.neovim.client.command(command);
      console.log(`✅ Executed command: ${command}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to execute command "${command}":`, error);
      return false;
    }
  }

  // Evaluate Vim expression
  async evaluate(expression: string): Promise<any> {
    if (!this.neovim.connected || !this.neovim.client) {
      throw new Error("Neovim not connected");
    }

    try {
      const result = await this.neovim.client.eval(expression);
      return result;
    } catch (error) {
      console.error(`❌ Failed to evaluate "${expression}":`, error);
      throw error;
    }
  }

  // Spawn new Neovim instance with RPC enabled
  async spawnNewNeovim(socketPath?: string): Promise<boolean> {
    try {
      const nvimAddress = socketPath || `/tmp/nvim-server-${Date.now()}`;

      console.log("📝 Spawning new Neovim instance with RPC...");

      const nvimProcess = spawn('nvim', [
        '--listen', nvimAddress,
        this.workingDir // Open the working directory
      ], {
        cwd: this.workingDir,
        stdio: ['ignore', 'ignore', 'pipe'],
        env: { 
          ...process.env, 
          NVIM_LISTEN_ADDRESS: nvimAddress 
        }
      });

      if (!nvimProcess.pid) {
        throw new Error("Failed to spawn Neovim process");
      }

      // Handle process errors
      nvimProcess.stderr?.on('data', (data) => {
        console.error(`Neovim stderr: ${data}`);
      });

      this.neovim = {
        process: nvimProcess,
        connected: false,
        address: nvimAddress,
        pid: nvimProcess.pid
      };

      console.log(`✅ Spawned new Neovim instance (PID: ${nvimProcess.pid})`);
      console.log(`🔗 RPC address: ${nvimAddress}`);

      return true;
    } catch (error) {
      console.error("❌ Error spawning Neovim:", error);
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
      pid: this.neovim.pid,
      address: this.neovim.address
    };
  }

  getClient(): NeovimClient | null {
    return this.neovim.client || null;
  }

  // Cleanup
  async cleanup(): Promise<void> {
    console.log("🧹 Cleaning up Neovim connections...");

    // Close RPC connection
    if (this.neovim.client) {
      try {
        await this.neovim.client.quit();
      } catch (error) {
        console.error("Error closing Neovim RPC client:", error);
      }
    }

    // Kill spawned process if needed
    if (this.neovim.process && !this.neovim.process.killed) {
      try {
        this.neovim.process.kill('SIGTERM');
        console.log("🔪 Terminated spawned Neovim process");
      } catch (error) {
        console.error("Error terminating Neovim process:", error);
      }
    }

    this.neovim = { connected: false };
    console.log("✅ Neovim manager cleanup completed");
  }
}
