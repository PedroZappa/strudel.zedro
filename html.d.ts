// html.d.ts - Type declarations for HTML template imports
declare module "*.html" {
  const content: string;
  export default content;
}

// Additional type declarations for Neovim integration
declare module "find-process" {
  interface ProcessInfo {
    pid: number;
    ppid?: number;
    uid?: number;
    gid?: number;
    name: string;
    cmd: string;
    bin?: string;
  }

  function find(
    type: 'pid' | 'port' | 'name',
    value: string | number | RegExp,
    strict?: boolean): Promise<ProcessInfo[]>;
  export = find;
}

