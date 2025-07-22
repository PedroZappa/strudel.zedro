# strudel.zedro

This repository contains the source code for **strudel.zedro**, an integration that connects the **Neovim** code editor with the **Strudel.cc** web-based live-coding music environment.

It allows a user to write code in a local Neovim instance and send it directly to the Strudel REPL running in a browser, enabling a seamless live-coding workflow without leaving the editor.

### Core Components

1.  **Node.js Server (`server.ts`)**:
    *   Built with **Bun** and written in **TypeScript**.
    *   Acts as the central bridge between Neovim and the browser.
    *   Serves a web-based UI (`strudel-template.html`).
    *   Provides a REST API to:
        *   List and serve files (`.strdl`, etc.).
        *   Connect to a running Neovim instance to get buffer contents.
        *   Receive code from Neovim and forward it to the browser.
    *   Uses **Playwright** to control the browser instance where Strudel.cc is running, injecting code into its REPL.

2.  **Web UI (`client-app.ts`, `strudel-template.html`)**:
    *   A simple frontend application that displays a list of files available from the connected Neovim instance.
    *   It embeds the official `strudel.cc` REPL in an `<iframe>`.
    *   Allows users to select files, view their content, and manually copy-paste code.

3.  **Neovim Plugin (`strudel-integration.lua`)**:
    *   A Lua plugin for Neovim that provides user commands and keymaps.
    *   Allows sending the content of the current buffer or a visual selection to the server via `curl` commands.
    *   Includes commands like `:StrudelSendBuffer`, `:StrudelSendSelection`, and `:StrudelStop` (hush).

### Workflow

1.  The user starts the server using `bun run dev`.
2.  The server starts and can optionally launch a browser window with the Strudel UI.
3.  The user configures their Neovim with the `strudel-integration.lua` plugin.
4.  Inside Neovim, the user writes Strudel code in a buffer.
5.  Using a keymap (e.g., `ss`), the user sends the code to the server.
6.  The server receives the code and uses Playwright to execute it within the Strudel.cc iframe.
7.  The music/pattern updates in real-time.

### Key Technologies

*   **Runtime**: [Bun](https://bun.sh/)
*   **Language**: TypeScript
*   **Server**: Bun's native HTTP server
*   **Browser Automation**: Playwright
*   **Editor Integration**: Neovim (Lua)
*   **Frontend**: HTML, CSS, TypeScript

This setup provides a powerful and flexible environment for live-coding music with Strudel, leveraging the advanced editing capabilities of Neovim.

