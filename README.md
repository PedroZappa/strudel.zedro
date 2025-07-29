# strudel.zedro

This repository contains the source code for **strudel.zedro**, an integration that connects the **Neovim** code editor with the **Strudel.cc** web-based live-coding music environment.

It allows a user to write code in a local Neovim instance and send the contents of its buffer directly to the Strudel REPL running in a browser, enabling a seamless live-coding workflow without leaving the terminal.

## Core Architecture

### 1. Node.js Server (`server.ts`)

Built with **Bun**, the server acts as the bridge between Neovim and the browser. It is composed of three main managers:

*   **`FileManager` (`server-file-manager.ts`)**:
    *   Scans the local project for `.strdl` files.
    *   Manages file information, including virtual buffers from Neovim.
    *   Watches for file changes and updates accordingly.

*   **`NeovimManager` (`server-neovim-manager.ts`)**:
    *   Connects to a running Neovim instance via a socket (`/tmp/strudel-nvim-socket`).
    *   Scans Neovim for open buffers and syncs their content with the `FileManager`.
    *   Provides the core link to read code directly from the editor.

*   **`PlaywrightManager` (`server-playwright-manager.ts`)**:
    *   Launches and controls a browser instance using Playwright.
    *   Navigates to a local page that embeds the Strudel.cc REPL.
    *   Injects code received from Neovim into the Strudel REPL for execution.

The server exposes a REST API for communication with the client UI and `curl` commands from the Neovim plugin.

### 2. Web UI (Client)

A simple but effective frontend application built with TypeScript that runs in the browser.

*   Provides a user-friendly interface for sending code to the Strudel REPL in a browser.
*   Uses HTML, CSS, and JavaScript to render the Strudel REPL.

### 3. Neovim Plugin (`strudel-integration.lua`)

A Lua plugin for Neovim that provides the in-editor user interface.

*   Provides commands (`:Strudel sendbuf`, `:Strudel browser`, `:Strudel stop`) and keymaps (`ss`, `si`, `sh`).
*   Sends code from the current buffer or visual selection to the server using asynchronous `curl` commands.
*   Includes logic to automatically start and manage the Neovim socket server (`vim.fn.serverstart`).

## Workflow

1.  The user starts the server with `bun run dev`.
2.  The server launches, starts a Playwright-controlled browser, and attempts to connect to a Neovim socket.
3.  The user configures their Neovim with the `strudel-integration.lua` plugin, which ensures a socket is available.
4.  Inside Neovim, the user writes Strudel code in a buffer.
5.  Using a keymap (e.g., `<leader>ss`), the user sends the code to the server.
6.  The server receives the code and uses Playwright to execute it within the Strudel.cc iframe.
7.  Change the code, hit send again (`<leader>ss`), and the REPL is updated with the contents of the Neovim buffer.

## Key Technologies

*   **Runtime**: [Bun](https://bun.sh/)
*   **Language**: TypeScript
*   **Server**: Bun's native HTTP server
*   **Browser Automation**: Playwright
*   **Editor Integration**: Neovim (Lua)
*   **Frontend**: HTML, CSS

## Setup and Usage

### Prerequisites

*   [Bun](https://bun.sh/) installed.
*   [Neovim](https://neovim.io/) (v0.10+ for best results).

### Installation

1.  Clone the repository:
    ```sh
    git clone https://github.com/PedroZappa/strudel.zedro.git
    cd strudel.zedro
    ```

2.  Install dependencies:
    ```sh
    bun install
    ```

### Running the Server

1.  Start the development server:
    ```sh
    bun run dev
    ```
2.  This will start the server, launch a browser window with the UI, and begin listening for a Neovim connection.

### Neovim Configuration

1.  Place the `strudel-integration.lua` file in your Neovim configuration directory (e.g., `~/.config/nvim/lua/strudel-integration.lua`).
2.  Load it in your `init.lua` or via a plugin manager:
    ```lua
    require('strudel-integration').setup({
      -- Optional configuration
      show_notifications = true,
    })
    ```
3.  The plugin will automatically start the required Neovim socket server. You can now use the keymaps (`ss` to send, `sh` to hush) to control Strudel from Neovim.
