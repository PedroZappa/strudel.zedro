// server.ts - Fixed Neovim + Strudel integration with proper RPC and static file serving
import { watch } from "fs";
import path from "path";
import { spawn, ChildProcess } from "child_process";
import find from "find-process";
import { chromium, Browser, Page, BrowserContext } from "playwright";
import { attach, NeovimClient } from "neovim";
import { createConnection } from "net";

// Import HTML template as text using Bun's text import feature
import htmlTemplate from "./strudel-template.html" with { type: "text" };

interface NeovimFileInfo {
  path: string;
  name: string;
  content: string;
  lastModified: Date;
  bufnr?: number;
}

interface NeovimInstance {
  process?: ChildProcess;
  client?: NeovimClient;
  connected: boolean;
  address?: string;
  pid?: number;
}

interface PlaywrightSession {
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  connected: boolean;
}

class NeovimFileServer {
  private files: Map<string, NeovimFileInfo> = new Map();
  private watchers: Map<string, any> = new Map();
  private neovim: NeovimInstance = { connected: false };
  private playwright: PlaywrightSession = { connected: false };

  constructor(private workingDir: string = process.cwd()) {}

  // FIXED: Proper static file serving method
  async serveStaticFile(url: URL): Promise<Response | null> {
    const filePath = url.pathname;
    
    // List of allowed static file extensions and their MIME types
    const mimeTypes: Record<string, string> = {
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.html': 'text/html',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.json': 'application/json'
    };

    // Get file extension
    const ext = path.extname(filePath).toLowerCase();
    
    // Check if it's a supported static file
    if (!mimeTypes[ext]) {
      return null; // Not a static file we handle
    }

    try {
      // Construct the file path (remove leading slash and resolve relative to working directory)
      const localFilePath = path.join(this.workingDir, filePath.substring(1));
      const file = Bun.file(localFilePath);
      
      // Check if file exists
      const exists = await file.exists();
      if (!exists) {
        console.log(`Static file not found: ${localFilePath}`);
        return new Response("File not found", { status: 404 });
      }

      console.log(`✅ Serving static file: ${localFilePath}`);
      
      return new Response(file, {
        headers: {
          "Content-Type": mimeTypes[ext],
          "Cache-Control": "public, max-age=3600" // Cache for 1 hour
        }
      });
    } catch (error) {
      console.error(`Error serving static file ${filePath}:`, error);
      return new Response("Internal server error", { status: 500 });
    }
  }

  // Fixed Playwright browser management - targets local REPL
  async initPlaywright(): Promise<boolean> {
    try {
      console.log("🎭 Starting Playwright browser...");

      this.playwright.browser = await chromium.launch({
        headless: false,
        args: [
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--allow-running-insecure-content'
        ]
      });

      this.playwright.context = await this.playwright.browser.newContext({
        viewport: { width: 1400, height: 900 },
        permissions: ['microphone']
      });

      this.playwright.page = await this.playwright.context.newPage();

      // Navigate to LOCAL Strudel integration page, not external strudel.cc
      await this.playwright.page.goto('http://localhost:3001/strudel', { 
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      // Wait for the strudel-editor web component to load
      await this.playwright.page.waitForSelector('iframe', { timeout: 10000 });

      this.playwright.connected = true;
      console.log("✅ Playwright browser ready and targeting local Strudel REPL");
      return true;
    } catch (error) {
      console.error("❌ Failed to initialize Playwright:", error);
      return false;
    }
  }

  // Fixed code injection - targets the iframe with strudel.cc
  async sendCodeToStrudel(code: string): Promise<boolean> {
    if (!this.playwright.connected || !this.playwright.page) {
      console.log("🎭 Browser not connected, initializing...");
      const success = await this.initPlaywright();
      if (!success) return false;
    }

    try {
      console.log("📤 Sending code to Strudel REPL...");

      // Switch to the iframe context (strudel.cc)
      const frameHandle = await this.playwright.page!.waitForSelector('iframe');
      const frame = await frameHandle.contentFrame();
      
      if (!frame) {
        throw new Error("Could not access iframe content");
      }

      // Wait for CodeMirror editor to be ready
      await frame.waitForSelector('.cm-editor', { timeout: 10000 });

      // Focus on the editor and clear existing content
      await frame.click('.cm-editor');
      await frame.keyboard.press('Control+A');

      // Type the new code
      await frame.keyboard.type(code);

      // Execute the code (Ctrl+Enter is standard for Strudel)
      await frame.keyboard.press('Control+Enter');

      console.log("✅ Code sent to Strudel successfully");
      return true;
    } catch (error) {
      console.error("❌ Failed to send code to Strudel:", error);
      return false;
    }
  }

  async stopStrudel(): Promise<boolean> {
    if (!this.playwright.connected || !this.playwright.page) {
      return false;
    }

    try {
      // Access iframe and execute hush command
      const frameHandle = await this.playwright.page!.waitForSelector('iframe');
      const frame = await frameHandle.contentFrame();
      
      if (!frame) {
        throw new Error("Could not access iframe content");
      }

      await frame.evaluate(() => {
        (window as any).hush?.();
      });

      console.log("⏹️ Stopped Strudel playback");
      return true;
    } catch (error) {
      console.error("❌ Failed to stop Strudel:", error);
      return false;
    }
  }

  // FIXED: Proper Neovim RPC connection using the neovim package
  async connectToNeovim(): Promise<boolean> {
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
        try {
          console.log(`🔌 Attempting to connect to Neovim PID: ${instance.pid}`);

          // Check for existing server address or create one
          let serverAddress = instance.address;
          
          // If no address found, try to connect via v:servername
          if (!serverAddress) {
            // Try common socket locations
            const possibleSockets = [
              `/tmp/nvim-${instance.pid}`,
              `/tmp/nvimsocket-${instance.pid}`,
              `/tmp/nvim-socket`,
              process.env.NVIM_LISTEN_ADDRESS
            ].filter(Boolean);

            for (const socketPath of possibleSockets) {
              try {
                console.log(`🧪 Testing socket: ${socketPath}`);
                const testConnection = createConnection(socketPath!);
                await new Promise((resolve, reject) => {
                  testConnection.on('connect', resolve);
                  testConnection.on('error', reject);
                  setTimeout(reject, 1000); // 1 second timeout
                });
                testConnection.destroy();
                serverAddress = socketPath!;
                console.log(`✅ Found working socket: ${socketPath}`);
                break;
              } catch {
                console.log(`❌ Socket not available: ${socketPath}`);
                continue;
              }
            }
          }

          if (!serverAddress) {
            console.log(`❌ No RPC address found for PID ${instance.pid}`);
            continue;
          }

          // Establish RPC connection
          console.log(`🔗 Connecting to: ${serverAddress}`);
          const socket = createConnection(serverAddress);
          const nvimClient = attach({ reader: socket, writer: socket });

          // Test the connection
          await nvimClient.command('echo "Connected from Bun server!"');

          this.neovim = {
            client: nvimClient,
            connected: true,
            pid: instance.pid,
            address: serverAddress
          };

          console.log(`✅ Successfully connected to Neovim (PID: ${instance.pid})`);
          
          // Now get actual buffer list from Neovim
          await this.scanNeovimBuffers();
          return true;

        } catch (error) {
          console.log(`Failed to connect to PID ${instance.pid}:`, error);
          continue;
        }
      }

      console.log("❌ Could not connect to any Neovim instances");
      console.log("💡 Try: nvim --listen /tmp/nvim-socket");
      return false;
    } catch (error) {
      console.error("Error connecting to Neovim:", error);
      return false;
    }
  }

  // FIXED: Enhanced buffer scanning that actually gets buffers from Neovim
  async scanNeovimBuffers(): Promise<void> {
    if (!this.neovim.connected || !this.neovim.client) {
      console.log("⚠️ Neovim not connected, scanning local files instead");
      await this.scanLocalFiles();
      return;
    }

    try {
      console.log("📋 Getting buffer list from Neovim...");

      // Get list of all buffers
      const buffers = await this.neovim.client.buffers;
      let bufferCount = 0;

      for (const buffer of buffers) {
        try {
          // Get buffer info
          const bufnr = buffer.id;
          const name = await buffer.name;
          const lines = await buffer.lines;
          
          // Skip unnamed or empty buffers
          if (!name || name.startsWith('term://') || name === '') {
            continue;
          }

          // Skip if buffer is not loaded
          const isLoaded = await buffer.loaded;
          if (!isLoaded) {
            continue;
          }

          const relativePath = path.relative(this.workingDir, name);
          const content = lines.join('\n');

          const fileInfo: NeovimFileInfo = {
            path: relativePath,
            name: path.basename(name),
            content: content,
            lastModified: new Date(),
            bufnr: bufnr
          };

          this.files.set(relativePath, fileInfo);
          
          // Watch the actual file for changes
          this.watchFile(name, relativePath);
          bufferCount++;

        } catch (error) {
          console.error(`Error processing buffer:`, error);
        }
      }

      console.log(`📁 Loaded ${bufferCount} buffers from Neovim session`);

    } catch (error) {
      console.error("Error scanning Neovim buffers:", error);
      // Fallback to local file scanning
      await this.scanLocalFiles();
    }
  }

  // Fallback local file scanning  
  async scanLocalFiles(): Promise<void> {
    console.log("📁 Scanning local files...");
    const patterns = [
      "**/*.strudel",
      "**/*.strdl", 
      "**/*.js",
      "**/*.ts",
      "**/*.mjs"
    ];

    let totalFiles = 0;

    for (const pattern of patterns) {
      const glob = new Bun.Glob(pattern);

      for await (const file of glob.scan({ 
        cwd: this.workingDir,
        onlyFiles: true,
        followSymlinks: false
      })) {
        // Skip node_modules and hidden directories
        if (file.includes('node_modules') || file.startsWith('.')) {
          continue;
        }

        const fullPath = path.join(this.workingDir, file);
        await this.addFile(fullPath, file);
        totalFiles++;
      }
    }

    console.log(`📁 Scanned ${totalFiles} local files`);
  }

  async findRunningNeovim(): Promise<{ pid: number; address?: string }[]> {
    try {
      const processes = await find('name', /n?vim/, true);
      const neovimProcesses = processes.filter(p => 
        (p.name.includes('nvim') || p.name.includes('neovim')) && 
        !p.cmd.includes('--embed') && // Skip embedded instances
        !p.cmd.includes('--headless') // Skip headless instances unless they have --listen
      );

      console.log(`Found ${neovimProcesses.length} running Neovim processes`);

      return neovimProcesses.map(p => ({
        pid: p.pid,
        address: process.env.NVIM_LISTEN_ADDRESS || `/tmp/nvim-${p.pid}`
      }));
    } catch (error) {
      console.error("Error finding Neovim processes:", error);
      return [];
    }
  }

  // Rest of the methods remain the same...
  async addFile(fullPath: string, relativePath: string): Promise<void> {
    try {
      const fileContent = await Bun.file(fullPath).text();
      const stats = await Bun.file(fullPath).stat();

      const fileInfo: NeovimFileInfo = {
        path: relativePath,
        name: path.basename(relativePath),
        content: fileContent,
        lastModified: new Date(stats.mtime || Date.now())
      };

      this.files.set(relativePath, fileInfo);
      this.watchFile(fullPath, relativePath);
    } catch (error) {
      console.error(`Error adding file ${relativePath}:`, error);
    }
  }

  watchFile(fullPath: string, relativePath: string): void {
    if (this.watchers.has(relativePath)) {
      this.watchers.get(relativePath)?.close();
    }

    const watcher = watch(fullPath, { persistent: false }, async (eventType) => {
      if (eventType === 'change') {
        console.log(`📝 File changed: ${relativePath}`);
        await this.addFile(fullPath, relativePath);
      }
    });

    this.watchers.set(relativePath, watcher);
  }

  getFilesList(): Array<{path: string, name: string, lastModified: string}> {
    return Array.from(this.files.values()).map(file => ({
      path: file.path,
      name: file.name,
      lastModified: file.lastModified.toISOString()
    }));
  }

  getFile(filePath: string): NeovimFileInfo | null {
    return this.files.get(filePath) || null;
  }

  async updateFileContent(filePath: string, content: string): Promise<boolean> {
    const file = this.files.get(filePath);
    if (!file) return false;

    try {
      const fullPath = path.join(this.workingDir, filePath);
      await Bun.write(fullPath, content);

      file.content = content;
      file.lastModified = new Date();
      this.files.set(filePath, file);

      console.log(`💾 Updated file: ${filePath}`);
      return true;
    } catch (error) {
      console.error(`Error updating file ${filePath}:`, error);
      return false;
    }
  }

  isNeovimConnected(): boolean {
    return this.neovim.connected;
  }

  getNeovimStatus() {
    return {
      connected: this.neovim.connected,
      pid: this.neovim.pid,
      address: this.neovim.address
    };
  }

  getPlaywrightStatus() {
    return {
      connected: this.playwright.connected,
      pageUrl: this.playwright.page?.url() || null
    };
  }

  async cleanup(): Promise<void> {
    console.log("🧹 Cleaning up resources...");

    // Close all file watchers
    for (const watcher of this.watchers.values()) {
      watcher?.close();
    }
    this.watchers.clear();

    // Clean up Neovim RPC connection
    if (this.neovim.client) {
      try {
        await this.neovim.client.quit();
      } catch (error) {
        console.error("Error closing Neovim client:", error);
      }
    }

    // Clean up Playwright
    if (this.playwright.browser) {
      await this.playwright.browser.close();
      this.playwright.connected = false;
    }
  }
}

// Initialize the file server
const fileServer = new NeovimFileServer();

// CORS headers for web integration
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Enhanced Bun server with FIXED static file serving and API endpoints
const server = Bun.serve({
  port: 3001,
  cors: { origin: true },

  async fetch(request) {
    const url = new URL(request.url);

    // Handle preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // FIXED: Check for static files FIRST (CSS, JS, images, etc.)
    const staticResponse = await fileServer.serveStaticFile(url);
    if (staticResponse) {
      return staticResponse;
    }

    // Playwright browser control endpoints
    if (url.pathname === "/api/browser/init" && request.method === "POST") {
      const success = await fileServer.initPlaywright();
      return new Response(JSON.stringify({
        success,
        message: success ? "Browser initialized" : "Failed to initialize browser"
      }), {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }

    if (url.pathname === "/api/browser/send-code" && request.method === "POST") {
      try {
        const body = await request.json();
        const { code } = body;

        if (!code) {
          return new Response(JSON.stringify({
            success: false,
            error: "No code provided"
          }), {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders
            }
          });
        }

        const success = await fileServer.sendCodeToStrudel(code);
        return new Response(JSON.stringify({
          success,
          message: success ? "Code sent to Strudel" : "Failed to send code"
        }), {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: String(error)
        }), {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      }
    }

    // cURL-friendly endpoints for Neovim integration
    if (url.pathname === "/api/send-current-buffer" && request.method === "POST") {
      try {
        const body = await request.text();
        const success = await fileServer.sendCodeToStrudel(body);

        return new Response(success ? "✅ Code sent to Strudel" : "❌ Failed to send code", {
          status: success ? 200 : 500,
          headers: {
            "Content-Type": "text/plain",
            ...corsHeaders
          }
        });
      } catch (error) {
        return new Response(`❌ Error: ${error}`, {
          status: 500,
          headers: {
            "Content-Type": "text/plain",
            ...corsHeaders
          }
        });
      }
    }

    // Neovim RPC API endpoints
    if (url.pathname === "/api/neovim/connect" && request.method === "POST") {
      const success = await fileServer.connectToNeovim();
      return new Response(JSON.stringify({
        success,
        message: success ? "Connected to Neovim" : "Failed to connect to Neovim"
      }), {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }

    if (url.pathname === "/api/neovim/status") {
      return new Response(JSON.stringify(fileServer.getNeovimStatus()), {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }

    // File API endpoints 
    if (url.pathname === "/api/files") {
      if (request.method === "GET") {
        const files = fileServer.getFilesList();
        return new Response(JSON.stringify(files), {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      }

      if (request.method === "POST") {
        // FIXED: Call the correct method name
        await fileServer.scanNeovimBuffers();
        return new Response(JSON.stringify({ success: true }), {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      }
    }

    if (url.pathname.startsWith("/api/file/")) {
      const filePath = decodeURIComponent(url.pathname.replace("/api/file/", ""));

      if (request.method === "GET") {
        const file = fileServer.getFile(filePath);
        if (!file) {
          return new Response(JSON.stringify({ error: "File not found" }), {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders
            }
          });
        }

        return new Response(JSON.stringify(file), {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      }
    }

    // Serve the main Strudel integration page using imported HTML template
    if (url.pathname === "/strudel" || url.pathname === "/") {
      return new Response(htmlTemplate, {
        headers: {
          "Content-Type": "text/html",
          ...corsHeaders
        }
      });
    }

    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "ok",
        neovim: fileServer.isNeovimConnected(),
        browser: fileServer.getPlaywrightStatus().connected,
        files: fileServer.getFilesList().length
      }), {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }

    return new Response("Not Found", {
      status: 404,
      headers: corsHeaders
    });
  },
});

// Graceful shutdown handling
const cleanup = async () => {
  console.log('\n🛑 Shutting down server...');
  await fileServer.cleanup();
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

console.log(`🎵 Neovim + Strudel server running on http://localhost:${server.port}`);
console.log(`🎹 Open http://localhost:${server.port}/strudel to use the integration`);
console.log(`📁 Serving files from: ${fileServer.workingDir || process.cwd()}`);
console.log(`📝 CSS will be served from: http://localhost:${server.port}/styles.css`);
console.log(`\n💡 To connect Neovim, start it with: nvim --listen /tmp/nvim-socket`);
