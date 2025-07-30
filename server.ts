// server/main-server.ts - Refactored main server with modular architecture

/**
 * Strudel Server - Modular TypeScript Architecture
 * @author Firstname Lastname
 * @module
 *
 * @requires path
 * @requires server-file-manager
 * @requires server-neovim-manager
 * @requires server-playwright-manager
 * @requires Server from bun
 */

import path from "path";
import { FileManager } from "./server-file-manager";
import { NeovimManager } from "./server-neovim-manager";
import { PlaywrightManager } from "./server-playwright-manager";
import type { Server } from "bun";

// Import HTML template
const htmlTemplate: string = await Bun.file("./strudel-template.html").text();

interface ServerConfig {
  port: number;
  workingDir: string;
  staticFilesDir?: string;
  playwright?: {
    headless: boolean;
    autoStart: boolean;
  };
}

/**
 * @class StrudelServer
 * @desription Handles file serving and API endpoints
 */
export class StrudelServer {
  private config: ServerConfig;
  private fileManager: FileManager;
  private neovimManager: NeovimManager;
  private playwrightManager: PlaywrightManager;
  private server?: Server;

  /**
  * @constructor
  * @description Constructs a new StrudelServer instance
  * @param {Partial<ServerConfig>} config - Optional configuration object
  */
  constructor(config: Partial<ServerConfig> = {}) {
    this.config = {
      port: 3001,
      workingDir: process.cwd(),
      playwright: {
        headless: false,
        autoStart: false
      },
      ...config
    };

    // Initialize managers
    this.fileManager = new FileManager(this.config.workingDir);
    this.neovimManager = new NeovimManager(this.fileManager, this.config.workingDir);
    this.playwrightManager = new PlaywrightManager(`http://localhost:${this.config.port}`);

    this.fetch = this.fetch.bind(this);
  }

  // CORS headers
  /** 
  * @method getCorsHeaders
  * @description Returns CORS headers
  * @private
  * @returns {Object} CORS headers
  */
  private getCorsHeaders(): Record<string, string> {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
  }

  // Static file serving with proper MIME types
  /**
  * @method serveStaticFile
  * @description Handles serving static files
  * @async
  * @param {URL} url - URL object
  * @returns {Promise<Response>} Response
  */
  async serveStaticFile(url: URL): Promise<Response | null> {
    if (!url.pathname.startsWith("/dist/")
      || !url.pathname.endsWith(".strdl")
      || !url.pathname.endsWith(".css")
      || !url.pathname.endsWith(".js")
      || !url.pathname.endsWith(".js.map")) {

    }
    const filePath = url.pathname;
    const ext = path.extname(filePath).toLowerCase();

    const mimeTypes: Record<string, string> = {
      '.strdl': 'text/strdl',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.js.map': 'application/json',
      '.json': 'application/json',
    };


    if (!mimeTypes[ext]) {
      return null;
    }

    try {
      const localFilePath = path.join(this.config.workingDir, filePath.substring(1));
      const file = Bun.file(localFilePath);

      if (!(await file.exists())) {
        console.log(`❌ Dist file not found: ${filePath}`);
        return new Response("File not found", { status: 404 });
      }

      console.log(`✅ Serving static file: ${localFilePath}`);

      return new Response(file, {
        headers: {
          "Content-Type": mimeTypes[ext],
          "Cache-Control": "public, max-age=3600",
          ...this.getCorsHeaders()
        }
      });
    } catch (error) {
      console.error(`❌ Error serving static file ${filePath}:`, error);
      return new Response("Internal server error", { status: 500 });
    }
  }

  // API route handlers
  
  /**
  * @method handleFileAPI "/api/file"
  * @description Handles file API endpoints
  * @private
  * @async
  * @param {Request} request - Request object
  * @param {URL} url - URL object
  * @returns {Promise<Response>} Response
  */
  private async handleFileAPI(request: Request, url: URL): Promise<Response> {
    // Files operations
    if (url.pathname === "/api/files") {
      // List files
      if (request.method === "GET") {
        const files = this.fileManager.getFilesList();
        return new Response(JSON.stringify(files), {
          headers: {
            "Content-Type": "application/json",
            ...this.getCorsHeaders()
          }
        });
      }
      // Refresh files
      if (request.method === "POST") {
        // Refresh files - try Neovim buffers first, fallback to local files
        if (this.neovimManager.isConnected()) {
          await this.neovimManager.scanNeovimBuffers();
        } else {
          await this.fileManager.scanLocalFiles();
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: {
            "Content-Type": "application/json",
            ...this.getCorsHeaders()
          }
        });
      }
    }

    // File operations
    if (url.pathname.startsWith("/api/file/")) {
      // Extract file path
      const filePath = decodeURIComponent(url.pathname.replace("/api/file/", ""));
      // File operations
      if (request.method === "GET") {
        // Get file
        const file = this.fileManager.getFile(filePath);
        // File not found
        if (!file) {
          return new Response(JSON.stringify({ error: "File not found" }), {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              ...this.getCorsHeaders()
            }
          });
        }
        return new Response(JSON.stringify(file), {
          headers: {
            "Content-Type": "application/json",
            ...this.getCorsHeaders()
          }
        });
      }

      // Update file
      if (request.method === "PUT") {
        const body = await request.json();
        const success = await this.fileManager.updateFileContent(filePath, body.content);

        return new Response(JSON.stringify({ success }), {
          status: success ? 200 : 500,
          headers: {
            "Content-Type": "application/json",
            ...this.getCorsHeaders()
          }
        });
      }
    }

    return new Response("Not Found", { status: 404, headers: this.getCorsHeaders() });
  }

  /**
  * @method handleNeovimAPI "/api/neovim"
  * @description Handles Neovim API endpoints
  * @private
  * @async
  * @param {Request} request - Request object
  * @param {URL} url - URL object
  * @returns {Promise<Response>} Response
  */
  private async handleNeovimAPI(request: Request, url: URL): Promise<Response> {
    // Connect
    if (url.pathname === "/api/neovim/connect" && request.method === "POST") {
      const success = await this.neovimManager.connectToNeovim();
      return new Response(JSON.stringify({
        success,
        message: success ? "Connected to Neovim" : "Failed to connect to Neovim"
      }), {
        headers: {
          "Content-Type": "application/json",
          ...this.getCorsHeaders()
        }
      });
    }

    // Status
    if (url.pathname === "/api/neovim/status") {
      return new Response(JSON.stringify(this.neovimManager.getStatus()), {
        headers: {
          "Content-Type": "application/json",
          ...this.getCorsHeaders()
        }
      });
    }

    return new Response("Not Found", { status: 404, headers: this.getCorsHeaders() });
  }

  /**
  * @method handlePlaywrightAPI "/api/browser"
  * @description Handles Playwright API endpoints
  * @private
  * @async
  * @param {Request} request - Request object
  * @param {URL} url - URL object
  * @returns {Promise<Response>} Response
  */
  private async handlePlaywrightAPI(request: Request, url: URL): Promise<Response> {
    // Initialize a browser instance
    if (url.pathname === "/api/browser/init" && request.method === "POST") {
      const success = await this.playwrightManager.initialize();
      return new Response(JSON.stringify({
        success,
        message: success ? "Browser initialized" : "Failed to initialize browser"
      }), {
        headers: {
          "Content-Type": "application/json",
          ...this.getCorsHeaders()
        }
      });
    }

    // Send code to Strudel REPL
    if (url.pathname === "/api/browser/send-code" && request.method === "POST") {
      try {
        const body = await request.json();
        const { code } = body;

        // Handling empty code
        if (!code) {
          return new Response(JSON.stringify({
            success: false,
            error: "No code provided"
          }), {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...this.getCorsHeaders()
            }
          });
        }

        // Send code
        const success = await this.playwrightManager.sendCodeToStrudel(code);
        return new Response(JSON.stringify({
          success,
          message: success ? "Code sent to Strudel" : "Failed to send code"
        }), {
          headers: {
            "Content-Type": "application/json",
            ...this.getCorsHeaders()
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
            ...this.getCorsHeaders()
          }
        });
      }
    }

    // Start Strudel playback
    if (url.pathname === "/api/browser/start" && request.method === "POST") {
      const success = await this.playwrightManager.startStrudel();
      return new Response(JSON.stringify({
        success,
        message: success ? "Started Strudel playback" : "Failed to start playback"
      }), {
        headers: {
          "Content-Type": "application/json",
          ...this.getCorsHeaders()
        }
      });
    }

    // Stop Strudel playback
    if (url.pathname === "/api/browser/stop" && request.method === "POST") {
      const success = await this.playwrightManager.stopStrudel();
      return new Response(JSON.stringify({
        success,
        message: success ? "Stopped Strudel playback" : "Failed to stop playback"
      }), {
        headers: {
          "Content-Type": "application/json",
          ...this.getCorsHeaders()
        }
      });
    }

    // Get Playwright Browser Status
    if (url.pathname === "/api/browser/status") {
      return new Response(JSON.stringify(this.playwrightManager.getStatus()), {
        headers: {
          "Content-Type": "application/json",
          ...this.getCorsHeaders()
        }
      });
    }

    return new Response("Not Found", { status: 404, headers: this.getCorsHeaders() });
  }

  /**
  * @method handleCurlAPI
  * @description Handles cURL API endpoints
  * @private
  * @async
  * @param {Request} request - Request object
  * @param {URL} url - URL object
  * @returns {Promise<Response>} Response
  */
  private async handleCurlAPI(request: Request, url: URL): Promise<Response> {
    // Send Current Buffer
    if (url.pathname === "/api/send-current-buffer" && request.method === "POST") {
      try {
        const body = await request.text();
        const success = await this.playwrightManager.sendCodeToStrudel(body);

        return new Response(success ? "✅ Code sent to Strudel" : "❌ Failed to send code", {
          status: success ? 200 : 500,
          headers: {
            "Content-Type": "text/plain",
            ...this.getCorsHeaders()
          }
        });
      } catch (error) {
        return new Response(`❌ Error: ${error}`, {
          status: 500,
          headers: {
            "Content-Type": "text/plain",
            ...this.getCorsHeaders()
          }
        });
      }
    }

    // Stop Strudel
    if (url.pathname === "/api/hush" && request.method === "POST") {
      const success = await this.playwrightManager.stopStrudel();
      return new Response(success ? "⏹️ Stopped Strudel" : "❌ Failed to stop", {
        status: success ? 200 : 500,
        headers: {
          "Content-Type": "text/plain",
          ...this.getCorsHeaders()
        }
      });
    }

    return new Response("Not Found", { status: 404, headers: this.getCorsHeaders() });
  }

  /**
  * @method handleHealthAPI "/health"
  * @description Handles health API endpoint
  * @private
  * @async
  * @returns {Promise<Response>} Response
  */
  private async handleHealthAPI(): Promise<Response> {
    const stats = this.fileManager.getStats();

    return new Response(JSON.stringify({
      status: "ok",
      timestamp: new Date().toISOString(),
      neovim: this.neovimManager.isConnected(),
      browser: this.playwrightManager.isConnected(),
      files: {
        count: stats.totalFiles,
        totalSize: stats.totalSize,
        extensions: stats.extensions
      },
      config: {
        port: this.config.port,
        workingDir: this.config.workingDir
      }
    }), {
      headers: {
        "Content-Type": "application/json",
        ...this.getCorsHeaders()
      }
    });
  }

  /**
  * @method fetch
  * @description Handles incoming requests
  * @private
  * @async
  * @param {Request} request - Request object
  * @returns {Promise<Response>} Response
  */
  private async fetch(request: Request): Promise<Response> {
    // Parse URL
    const url = new URL(request.url);

    // Handle preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: this.getCorsHeaders()
      });
    }

    // Static files first
    // console.log(`Attempting to serve: ${url.pathname}`);
    const staticResponse = await this.serveStaticFile(url);
    if (staticResponse) {
      return staticResponse;
    }

    // API routes
    if (url.pathname.startsWith("/api/file") 
      || url.pathname.startsWith("/api/files")) {
      return this.handleFileAPI(request, url);
    }

    if (url.pathname.startsWith("/api/neovim")) {
      return this.handleNeovimAPI(request, url);
    }

    if (url.pathname.startsWith("/api/browser")) {
      return this.handlePlaywrightAPI(request, url);
    }

    if (url.pathname.startsWith("/api/send-current-buffer") 
      || url.pathname === "/api/hush") {
      return this.handleCurlAPI(request, url);
    }

    if (url.pathname === "/health") {
      return this.handleHealthAPI();
    }

    // Main Strudel page
    if (url.pathname === "/strudel" || url.pathname === "/") {
      return new Response(htmlTemplate, {
        headers: {
          "Content-Type": "text/html",
          ...this.getCorsHeaders()
        }
      });
    }

    return new Response("Not Found", {
      status: 404,
      headers: this.getCorsHeaders()
    });
  }

  // In server.ts
  async start(): Promise<void> {
    try {
      console.log("🚀 Starting Strudel Server...");

      // Scan initial files
      await this.fileManager.scanLocalFiles();

      // Start Bun server first
      this.server = Bun.serve({
        port: this.config.port,
        fetch: (req) => this.fetch(req),
      });

      console.log(`🎵 Strudel Server initializing...!`);

      // Wait for server to be ready before starting Playwright
      await this.waitForServerReady();
      console.log("✅ Server is ready");

      console.log(`🎹 Open http://localhost:${this.config.port}/strudel for the integration`);
      console.log(`📁 Serving files from: ${this.config.workingDir}`);

      // Search for a listening nvim socket /tmp/strudel-nvim-socket
      await this.neovimManager.connectToNeovim();
      if (!this.neovimManager.isConnected()) {
        console.log(`\n💡 To connect Neovim, start it with:`);
        console.log(`\tnvim --listen /tmp/strudel-nvim-socket`);
      }

      // Now start Playwright after server is confirmed ready
      console.log("🎹 Starting Playwright...");
      await this.playwrightManager.initialize();
      // await this.playwrightManager.debugStrudel();

    } catch (error) {
      console.error("❌ Failed to start server:", error);
      throw error;
    }
  }

  // Add this new method to wait for server readiness
  private async waitForServerReady(): Promise<void> {
    const maxRetries = 10;
    const retryDelay = 100; // ms

    for (let i = 0; i < maxRetries; i++) {
      try {
        // Try to make a simple request to the health endpoint
        const response = await fetch(`http://localhost:${this.config.port}/health`);
        if (response.ok) {
          console.log("✅ Server is ready and responding");
          return;
        }
      } catch (error) {
        // Server not ready yet, wait and retry
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
    throw new Error("Server failed to become ready within timeout period");
  }

  // Graceful shutdown
  async stop(): Promise<void> {
    console.log('\n🛑 Shutting down server...');

    await Promise.all([
      this.fileManager.cleanup(),
      this.neovimManager.cleanup(),
      this.playwrightManager.cleanup()
    ]);

    if (this.server) {
      this.server.stop();
    }

    console.log("✅ Server shutdown completed");
  }

  // Getters for external access
  get managers() {
    return {
      files: this.fileManager,
      neovim: this.neovimManager,
      playwright: this.playwrightManager
    };
  }

  get status() {
    return {
      running: !!this.server,
      port: this.config.port,
      neovimConnected: this.neovimManager.isConnected(),
      browserConnected: this.playwrightManager.isConnected(),
      filesCount: this.fileManager.getFileCount()
    };
  }
}

// Main execution
if (import.meta.main) {
  const server = new StrudelServer({
    port: 3001,
    playwright: {
      headless: false,
      autoStart: false
    }
  });

  // Graceful shutdown handling
  const cleanup = async () => {
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Start the server
  await server.start();
}
