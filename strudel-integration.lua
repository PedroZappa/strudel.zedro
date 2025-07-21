-- strudel-integration.lua - Neovim plugin for seamless Strudel integration
-- Usage: Place this file somewhere in ~/.config/nvim/lua/...

local M = {}

-- Configuration
M.config = {
  server_url = "http://localhost:3001",
  auto_init_browser = true,
  show_notifications = true
}

-- Setup function
function M.setup(opts)
  M.config = vim.tbl_deep_extend("force", M.config, opts or {})

  -- Create user commands
  vim.api.nvim_create_user_command('StrudelSendBuffer', M.send_buffer, {})
  vim.api.nvim_create_user_command('StrudelSendSelection', M.send_selection, {})
  vim.api.nvim_create_user_command('StrudelStop', M.stop_strudel, {})
  vim.api.nvim_create_user_command('StrudelInit', M.init_browser, {})
  vim.api.nvim_create_user_command('StrudelStatus', M.show_status, {})

  -- Default key mappings (can be overridden by user)
  vim.keymap.set('n', '<leader>ss', M.send_buffer, { desc = 'Send buffer to Strudel' })
  vim.keymap.set('v', '<leader>ss', M.send_selection, { desc = 'Send selection to Strudel' })
  vim.keymap.set('n', '<leader>sh', M.stop_strudel, { desc = 'Stop Strudel (hush)' })
  vim.keymap.set('n', '<leader>si', M.init_browser, { desc = 'Initialize Strudel browser' })

  if M.config.show_notifications then
    vim.notify("Strudel integration loaded! Use <leader>ss to send code", vim.log.levels.INFO)
  end
end

-- Helper function to make HTTP requests using curl
local function curl_post(endpoint, data, callback)
  local url = M.config.server_url .. endpoint
  local temp_file = vim.fn.tempname()

  -- Write data to temp file
  vim.fn.writefile(type(data) == "table" and data or {data}, temp_file)

  -- Build curl command
  local cmd = string.format(
    "curl -s -X POST -H 'Content-Type: text/plain' --data-binary '@%s' %s",
    temp_file, url
  )

  -- Execute curl command
  vim.fn.system(cmd)
  local exit_code = vim.v.shell_error

  -- Clean up temp file
  vim.fn.delete(temp_file)

  if callback then
    callback(exit_code == 0)
  end
end

-- Send current buffer to Strudel
function M.send_buffer()
  local lines = vim.api.nvim_buf_get_lines(0, 0, -1, false)
  local content = table.concat(lines, "\n")

  if content:match("^%s*$") then
    if M.config.show_notifications then
      vim.notify("Buffer is empty!", vim.log.levels.WARN)
    end
    return
  end

  curl_post("/api/send-current-buffer", content, function(success)
    if M.config.show_notifications then
      if success then
        vim.notify("🎵 Buffer sent to Strudel!", vim.log.levels.INFO)
      else
        vim.notify("❌ Failed to send buffer", vim.log.levels.ERROR)
      end
    end
  end)
end

-- Send visual selection to Strudel
function M.send_selection()
  local start_pos = vim.fn.getpos("'<")
  local end_pos = vim.fn.getpos("'>")
  local lines = vim.api.nvim_buf_get_lines(0, start_pos[2] - 1, end_pos[2], false)

  if #lines == 0 then
    if M.config.show_notifications then
      vim.notify("No selection found!", vim.log.levels.WARN)
    end
    return
  end

  -- Handle partial line selections
  if #lines == 1 then
    lines[1] = string.sub(lines[1], start_pos[3], end_pos[3])
  else
    lines[1] = string.sub(lines[1], start_pos[3])
    lines[#lines] = string.sub(lines[#lines], 1, end_pos[3])
  end

  local content = table.concat(lines, "\n")

  curl_post("/api/send-selection", content, function(success)
    if M.config.show_notifications then
      if success then
        vim.notify("🎵 Selection sent to Strudel!", vim.log.levels.INFO)
      else
        vim.notify("❌ Failed to send selection", vim.log.levels.ERROR)
      end
    end
  end)
end

-- Stop Strudel playback
function M.stop_strudel()
  curl_post("/api/hush", "", function(success)
    if M.config.show_notifications then
      if success then
        vim.notify("⏹️  Strudel stopped", vim.log.levels.INFO)
      else
        vim.notify("❌ Failed to stop Strudel", vim.log.levels.ERROR)
      end
    end
  end)
end

-- Initialize browser
function M.init_browser()
  curl_post("/api/browser/init", "", function(success)
    if M.config.show_notifications then
      if success then
        vim.notify("🎭 Browser initialized", vim.log.levels.INFO)
      else
        vim.notify("❌ Failed to initialize browser", vim.log.levels.ERROR)
      end
    end
  end)
end

-- Show server status
function M.show_status()
  local cmd = string.format("curl -s %s/health", M.config.server_url)
  local result = vim.fn.system(cmd)

  if vim.v.shell_error == 0 then
    local status = vim.fn.json_decode(result)
    local message = string.format(
      "Server: %s | Neovim: %s | Browser: %s | Files: %d",
      status.status or "unknown",
      status.neovim and "connected" or "disconnected",
      status.browser and "connected" or "disconnected", 
      status.files or 0
    )
    vim.notify(message, vim.log.levels.INFO)
  else
    vim.notify("❌ Server not reachable", vim.log.levels.ERROR)
  end
end

-- Auto-initialization
if M.config.auto_init_browser then
  vim.defer_fn(M.init_browser, 1000) -- Wait 1 second after loading
end

return M

