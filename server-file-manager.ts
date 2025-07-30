/**
* @fileoverview File manager for Strudel Files
* @author Zedro
* @module
*
* @requires fs
* @requires path
*/

import { watch } from "fs";
import path from "path";

export interface FileInfo {
  path: string;
  name: string;
  content: string;
  lastModified: Date;
  bufnr?: number;
  isVirtual?: boolean; // NEW: Track virtual buffers
}

export interface FileStats {
  totalFiles: number;
  realFiles: number;
  virtualFiles: number;
  totalSize: number;
  averageSize: number;
  extensions: Record<string, number>;
  lastUpdate: Date | null;
}

export interface FileWatchOptions {
  patterns?: string[];
  excludeDirs?: string[];
  workingDir?: string;
}

/**
* @class File manager for Strudel Files
*/
export class FileManager {
  private files: Map<string, FileInfo> = new Map();
  private watchers: Map<string, any> = new Map();
  private workingDir: string;

  /**
  * Create a new file manager instance.
  * @constructor
  *
  * @param {string} workingDir - The working directory for the file manager.
  */
  constructor(workingDir: string = process.cwd()) {
    this.workingDir = workingDir;
  }

  /**
  * Check if a buffer path is a virtual buffer.
  * @private
  *
  * @param {string} bufferPath - The path to the buffer.
  * @returns {boolean} - True if the buffer is a virtual buffer, false otherwise.
  */
  private isVirtualPath(bufferPath: string): boolean {
    // Check for common virtual buffer patterns
    const virtualPatterns = [
      // URI schemes
      /^[a-z]+:\/\//,
      // Plugin-specific virtual buffers  
      /^miniicons:\/\//,
      /^oil:\/\//,
      /^telescope:\/\//,
      /^fugitive:\/\//,
      // Special buffer names
      /^\[.*\]$/,
      /^term:\/\//,
      /^scratch:/,
      // Neovim built-in virtual buffers
      /^NvimTree_/,
      /^NERD_tree/,
    ];

    return virtualPatterns.some(pattern => pattern.test(bufferPath));
  }

  /** 
  * Check if a file exists and is accessible.
  * @private
  * @async
  *
  * @param {string} filePath - The path to the file.
  * @returns {Promise<boolean>} - True if the file exists and is accessible, false otherwise.
  */
  private async fileExistsAndAccessible(filePath: string): Promise<boolean> {
    try {
      const file = Bun.file(filePath);
      const exists = await file.exists();
      if (!exists) return false;

      // Check if we can actually read the file
      await file.text();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
  * Watch a file for changes.
  * @private
  * @async
  *
  * @param {string} fullPath - The full path to the file.
  * @param {string} relativePath - The relative path to the file.
  */
  private async watchFile(fullPath: string, relativePath: string): Promise<void> {
    // Skip if we're already watching this file
    if (this.watchers.has(relativePath)) {
      this.watchers.get(relativePath)?.close();
    }

    try {
      // Validate that the file actually exists before attempting to watch
      if (!(await this.fileExistsAndAccessible(fullPath))) {
        console.log(`⚠️ Skipping file watch - file not accessible: ${fullPath}`);
        return;
      }

      // Watch the file for changes
      const watcher = watch(fullPath, { persistent: false }, async (eventType) => {
        if (eventType === 'change') {
          console.log(`📝 File changed: ${relativePath}`);
          await this.addFile(fullPath, relativePath);
        }
      });

      // Handle errors
      watcher.on('error', (error) => {
        console.error(`❌ File watcher error for ${relativePath}:`, error);
        // Remove failed watcher from map
        this.watchers.delete(relativePath);
      });

      this.watchers.set(relativePath, watcher);
      console.log(`👁️ Watching file: ${relativePath}`);

    } catch (error) {
      console.error(`❌ Failed to setup file watcher for ${relativePath}:`, error);
    }
  }

  // Enhanced addBufferFile with virtual buffer handling
  /**
  * Add a buffer file to the file manager.
  * @public
  * 
  * @param {object} bufferData - The data of the buffer to add.
  * @returns {void}
  */
  addBufferFile(bufferData: {
    path: string;
    name: string;
    content: string;
    bufnr: number;
  }): void {
    const bufferPath = bufferData.path;
    const isVirtual = this.isVirtualPath(bufferPath);

    // For virtual buffers, use the buffer name as the key
    // For real files, use relative path
    const fileKey = isVirtual
      ? `virtual:${bufferData.name}:${bufferData.bufnr}`
      : path.relative(this.workingDir, bufferPath);

    const fileInfo: FileInfo = {
      path: fileKey,
      name: bufferData.name,
      content: bufferData.content,
      lastModified: new Date(),
      bufnr: bufferData.bufnr,
      isVirtual: isVirtual
    };

    this.files.set(fileKey, fileInfo);

    if (isVirtual) {
      console.log(`📋 Added virtual buffer: ${bufferData.name} (buffer: ${bufferData.bufnr})`);
    } else {
      console.log(`📋 Added file buffer: ${fileKey} (buffer: ${bufferData.bufnr})`);

      // Only attempt to watch real files that exist
      this.watchFile(bufferPath, fileKey).catch(error => {
        console.error(`❌ Could not watch file ${bufferPath}:`, error);
      });
    }
  }

  // Enhanced buffer filtering for scanNeovimBuffers
  /**
  * Check if a buffer should be processed.
  * @public
  *
  * @param {string} bufferName - The name of the buffer.
  * @returns {boolean} - True if the buffer should be processed, false otherwise.
  */
  shouldProcessBuffer(bufferName: string): boolean {
    if (!bufferName || bufferName === '') return false;

    // Skip common virtual/special buffers
    const skipPatterns: RegExp[] = [
      // Terminal buffers
      /^term:\/\//,
      // No name buffers
      /^\[No Name\]/,
      // Help buffers
      /\.txt$/,
      /\/doc\//,
      // Plugin buffers that shouldn't be processed
      /^NvimTree/,
      /^NERD_tree/,
      // Quickfix/location lists
      /^quickfix$/,
      /^loclist$/,
    ];

    return !skipPatterns.some(pattern => {
      if (typeof pattern === 'object' && pattern.test) {
        return pattern.test(bufferName);
      }
      return false;
    });
  }

  /**
  * Scan local files for valid Strudel files.
  * @public
  * @async
  *
  * @param {FileWatchOptions} options - Options for file scanning.
  * @returns {void}
  */
  async scanLocalFiles(options: FileWatchOptions = {}): Promise<void> {
    const {
      patterns = ["**/*.strudel", "**/*.strdl"],
      excludeDirs = ["node_modules", ".git", "build"],
    } = options;

    console.log("📁 Scanning local files...");
    let totalFiles = 0;

    for (const pattern of patterns) {
      const glob = new Bun.Glob(pattern);

      for await (const file of glob.scan({
        cwd: this.workingDir,
        onlyFiles: true,
        followSymlinks: false,
      })) {
        if (excludeDirs.some(dir => file.includes(dir)) || file.startsWith('.')) {
          continue;
        }

        const fullPath = path.join(this.workingDir, file);
        await this.addFile(fullPath, file);
        totalFiles++;
      }
    }

    console.log(`📁 Scanned ${totalFiles} local files`);
  }

  /**
  * Add a file to the file manager.
  * @public
  * @async
  *
  * @param {string} fullPath - The full path to the file.
  * @param {string} relativePath - The relative path to the file.
  * @returns {void}
  */
  async addFile(fullPath: string, relativePath: string): Promise<void> {
    try {
      const fileContent = await Bun.file(fullPath).text();
      const stats = await Bun.file(fullPath).stat();

      const fileInfo: FileInfo = {
        path: relativePath,
        name: path.basename(relativePath),
        content: fileContent,
        lastModified: new Date(stats.mtime || Date.now()),
        isVirtual: false
      };

      this.files.set(relativePath, fileInfo);
      await this.watchFile(fullPath, relativePath);

      console.log(`📄 Added file: ${relativePath}`);
    } catch (error) {
      console.error(`❌ Error adding file ${relativePath}:`, error);
    }
  }

  /**
  * Update the content of a file.
  * @public
  * @async
  *
  * @param {string} filePath - The path of the file to update.
  * @param {string} content - The new content of the file.
  * @returns {boolean} - True if the update was successful, false otherwise.
  */
  async updateFileContent(filePath: string, content: string): Promise<boolean> {
    const file = this.files.get(filePath);
    if (!file) {
      console.error(`❌ File not found: ${filePath}`);
      return false;
    }

    // Can't update virtual buffers to disk
    if (file.isVirtual) {
      console.log(`⚠️ Cannot write virtual buffer to disk: ${filePath}`);
      // Update the content in memory
      file.content = content;
      file.lastModified = new Date();
      this.files.set(filePath, file);
      return true;
    }

    try {
      const fullPath = path.join(this.workingDir, filePath);
      await Bun.write(fullPath, content);

      file.content = content;
      file.lastModified = new Date();
      this.files.set(filePath, file);

      console.log(`💾 Updated file: ${filePath}`);
      return true;
    } catch (error) {
      console.error(`❌ Error updating file ${filePath}:`, error);
      return false;
    }
  }

  /**
  * Get all files in the file manager.
  * @public
  *
  * @returns {FileInfo[]} - An array of file text objects.
  */
  getFiles(): FileInfo[] {
    return Array.from(this.files.values());
  }

  /**
  * Get a list of files in the file manager.
  * @public
  *
  * @returns {Array<{ path: string, name: string, lastModified: string, isVirtual?: boolean }>} 
  * - An array of file objects.
  */
  getFilesList(): Array<{ path: string, name: string, lastModified: string, isVirtual?: boolean }> {
    return this.getFiles().map(file => ({
      path: file.path,
      name: file.name,
      lastModified: file.lastModified.toISOString(),
      isVirtual: file.isVirtual
    }));
  }

  /**
  * Get a file by its path.
  * @public
  *
  * @param {string} filePath - The path of the file to retrieve.
  * @returns {FileInfo | null} - The file object if found, null otherwise.
  */
  getFile(filePath: string): FileInfo | null {
    return this.files.get(filePath) || null;
  }

  /**
  * Get the number of files in the file manager.
  * @public
  *
  * @returns {number} - The number of files in the file manager.
  */
  getFileCount(): number {
    return this.files.size;
  }

  /**
  * Clear the file manager.
  * @public
  */
  clear(): void {
    this.files.clear();
    console.log("🗑️ Cleared all files");
  }

  /**
  * Clean up the file manager.
  * @public
  */
  cleanup(): void {
    console.log("🧹 Cleaning up file watchers...");

    for (const watcher of this.watchers.values()) {
      try {
        watcher?.close();
      } catch (error) {
        console.error("Error closing file watcher:", error);
      }
    }

    this.watchers.clear();
    console.log("✅ File manager cleanup completed");
  }

  /**
  * Get statistics about the file manager.
  * @public
  *
  * @returns {FileStats} - An object containing file statistics.
  */
  getStats(): FileStats {
    const files = this.getFiles();
    const realFiles = files.filter(f => !f.isVirtual);
    const virtualFiles = files.filter(f => f.isVirtual);
    const totalSize = files.reduce((sum, file) => sum + file.content.length, 0);
    const extensions = new Map<string, number>();

    files.forEach(file => {
      const ext = path.extname(file.name).toLowerCase();
      extensions.set(ext, (extensions.get(ext) || 0) + 1);
    });

    return {
      totalFiles: files.length,
      realFiles: realFiles.length,
      virtualFiles: virtualFiles.length,
      totalSize,
      averageSize: files.length > 0 ? Math.round(totalSize / files.length) : 0,
      extensions: Object.fromEntries(extensions),
      lastUpdate: files.length > 0 ?
        new Date(Math.max(...files.map(f => f.lastModified.getTime()))) :
        null
    };
  }
}
