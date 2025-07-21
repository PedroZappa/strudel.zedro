-- strudel-integration.lua - Neovim plugin for seamless Strudel integration
-- Usage: Place this file somewhere in ~/.config/nvim/lua/...

local M = {}

-- Configuration
M.config = {
  server_url = "http://localhost:3001",
  auto_init_browser = true,
  show_notifications = true,
  timeout = 5000  -- 5 second timeout for HTTP requests
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

-- SOLUTION 1: Use Neovim's async vim.system() for HTTP requests (Neovim 0.10+)
local function async_curl_post(endpoint, data, callback)
  local url = M.config.server_url .. endpoint

  -- Use vim.system for async HTTP requests (requires Neovim 0.10+)
  vim.system({
    'curl', '-s', '-X', 'POST',
    '-H', 'Content-Type: text/plain',
    '--data-binary', data,
    '--max-time', tostring(M.config.timeout / 1000), -- Convert to seconds
    url
  }, {
    text = true,
    timeout = M.config.timeout,
  }, function(obj)
    local success = obj.code == 0
    if callback then
      -- Schedule callback to run in main thread
      vim.schedule(function()
        callback(success, obj.stdout or obj.stderr)
      end)
    end
  end)
end

-- SOLUTION 2: Alternative using vim.fn.jobstart() for async requests (older Neovim versions)
local function async_curl_post_job(endpoint, data, callback)
  local url = M.config.server_url .. endpoint
  local temp_file = vim.fn.tempname()

  -- Write data to temp file
  vim.fn.writefile(type(data) == "table" and data or {data}, temp_file)

  local cmd = {
    'curl', '-s', '-X', 'POST',
    '-H', 'Content-Type: text/plain',
    '--data-binary', '@' .. temp_file,
    '--max-time', tostring(M.config.timeout / 1000),
    url
  }

  vim.fn.jobstart(cmd, {
    on_exit = function(_, exit_code)
      -- Clean up temp file
      vim.fn.delete(temp_file)

      if callback then
        vim.schedule(function()
          callback(exit_code == 0)
        end)
      end
    end,
    timeout = M.config.timeout
  })
end

-- Choose the appropriate async function based on Neovim version
local function curl_post_async(endpoint, data, callback)
  if vim.fn.has('nvim-0.10') == 1 then
    async_curl_post(endpoint, data, callback)
  else
    async_curl_post_job(endpoint, data, callback)
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

  if M.config.show_notifications then
    vim.notify("🎵 Sending buffer to Strudel...", vim.log.levels.INFO)
  end

  curl_post_async("/api/send-current-buffer", content, function(success, response)
    if M.config.show_notifications then
      if success then
        vim.notify("✅ Buffer sent to Strudel!", vim.log.levels.INFO)
      else
        vim.notify("❌ Failed to send buffer: " .. (response or "Network error"), vim.log.levels.ERROR)
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

  if M.config.show_notifications then
    vim.notify("🎵 Sending selection to Strudel...", vim.log.levels.INFO)
  end

  curl_post_async("/api/send-selection", content, function(success, response)
    if M.config.show_notifications then
      if success then
        vim.notify("✅ Selection sent to Strudel!", vim.log.levels.INFO)
      else
        vim.notify("❌ Failed to send selection: " .. (response or "Network error"), vim.log.levels.ERROR)
      end
    end
  end)
end

-- Stop Strudel playback
function M.stop_strudel()
  curl_post_async("/api/hush", "", function(success, response)
    if M.config.show_notifications then
      if success then
        vim.notify("⏹️  Strudel stopped", vim.log.levels.INFO)
      else
        vim.notify("❌ Failed to stop Strudel: " .. (response or "Network error"), vim.log.levels.ERROR)
      end
    end
  end)
end

-- Initialize browser
function M.init_browser()
  curl_post_async("/api/browser/init", "", function(success, response)
    if M.config.show_notifications then
      if success then
        vim.notify("🎭 Browser initialized", vim.log.levels.INFO)
      else
        vim.notify("❌ Failed to initialize browser: " .. (response or "Network error"), vim.log.levels.ERROR)
      end
    end
  end)
end

-- Show server status (can remain sync as it's user-initiated)
function M.show_status()
  local cmd = string.format("curl -s --max-time 3 %s/health", M.config.server_url)
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

-- Auto-initialization with async handling
if M.config.auto_init_browser then
  vim.defer_fn(function()
    M.init_browser()
  end, 1000) -- Wait 1 second after loading
end

return M
