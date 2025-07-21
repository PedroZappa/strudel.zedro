// server/file-manager.ts - File management and watching functionality
import { watch } from "fs";
import path from "path";

export interface FileInfo {
  path: string;
  name: string;
  content: string;
  lastModified: Date;
  bufnr?: number;
}

export interface FileWatchOptions {
  patterns?: string[];
  excludeDirs?: string[];
  workingDir?: string;
}

export class FileManager {
  private files: Map<string, FileInfo> = new Map();
  private watchers: Map<string, any> = new Map();
  private workingDir: string;

  constructor(workingDir: string = process.cwd()) {
    this.workingDir = workingDir;
  }

  // Scan local files using patterns
  async scanLocalFiles(options: FileWatchOptions = {}): Promise<void> {
    const {
      patterns = ["**/*.strudel", "**/*.strdl"],
      excludeDirs = ["node_modules", ".git", "dist", "build"],
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
        // Skip excluded directories
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

  // Add a single file to the manager
  async addFile(fullPath: string, relativePath: string): Promise<void> {
    try {
      const fileContent = await Bun.file(fullPath).text();
      const stats = await Bun.file(fullPath).stat();

      const fileInfo: FileInfo = {
        path: relativePath,
        name: path.basename(relativePath),
        content: fileContent,
        lastModified: new Date(stats.mtime || Date.now())
      };

      this.files.set(relativePath, fileInfo);
      this.watchFile(fullPath, relativePath);
      
      console.log(`📄 Added file: ${relativePath}`);
    } catch (error) {
      console.error(`❌ Error adding file ${relativePath}:`, error);
    }
  }

  // Update file content
  async updateFileContent(filePath: string, content: string): Promise<boolean> {
    const file = this.files.get(filePath);
    if (!file) {
      console.error(`❌ File not found: ${filePath}`);
      return false;
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

  // Set up file watching
  private watchFile(fullPath: string, relativePath: string): void {
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

  // Add file from buffer data (for Neovim integration)
  addBufferFile(bufferData: {
    path: string;
    name: string;
    content: string;
    bufnr: number;
  }): void {
    const relativePath = path.relative(this.workingDir, bufferData.path);
    
    const fileInfo: FileInfo = {
      path: relativePath,
      name: bufferData.name,
      content: bufferData.content,
      lastModified: new Date(),
      bufnr: bufferData.bufnr
    };

    this.files.set(relativePath, fileInfo);
    
    // Watch the file if it exists on disk
    if (bufferData.path && bufferData.path !== '') {
      this.watchFile(bufferData.path, relativePath);
    }

    console.log(`📋 Added buffer file: ${relativePath} (buffer: ${bufferData.bufnr})`);
  }

  // Getters
  getFiles(): FileInfo[] {
    return Array.from(this.files.values());
  }

  getFilesList(): Array<{path: string, name: string, lastModified: string}> {
    return this.getFiles().map(file => ({
      path: file.path,
      name: file.name,
      lastModified: file.lastModified.toISOString()
    }));
  }

  getFile(filePath: string): FileInfo | null {
    return this.files.get(filePath) || null;
  }

  getFileCount(): number {
    return this.files.size;
  }

  // Clear all files
  clear(): void {
    this.files.clear();
    console.log("🗑️ Cleared all files");
  }

  // Cleanup watchers
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

  // Get statistics
  getStats() {
    const files = this.getFiles();
    const totalSize = files.reduce((sum, file) => sum + file.content.length, 0);
    const extensions = new Map<string, number>();
    
    files.forEach(file => {
      const ext = path.extname(file.name).toLowerCase();
      extensions.set(ext, (extensions.get(ext) || 0) + 1);
    });

    return {
      totalFiles: files.length,
      totalSize,
      averageSize: files.length > 0 ? Math.round(totalSize / files.length) : 0,
      extensions: Object.fromEntries(extensions),
      lastUpdate: files.length > 0 ? 
        new Date(Math.max(...files.map(f => f.lastModified.getTime()))) : 
        null
    };
  }
}
