#!/bin/bash
# setup.sh - Setup script for Neovim + Strudel integration

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

echo -e "${BLUE}"
echo "🎵 Neovim + Strudel.cc Integration Setup"
echo "========================================"
echo -e "${NC}"

# Check if Bun is installed
log_info "Checking for Bun runtime..."
if ! command -v bun &> /dev/null; then
    log_error "Bun is not installed. Installing Bun..."
    curl -fsSL https://bun.sh/install | bash

    # Source the shell profile to get bun in PATH
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"

    if ! command -v bun &> /dev/null; then
        log_error "Bun installation failed. Please install manually:"
        echo "   curl -fsSL https://bun.sh/install | bash"
        exit 1
    fi
fi
log_success "Bun is installed"

# Check Node.js for Playwright
log_info "Checking for Node.js (required for Playwright)..."
if ! command -v node &> /dev/null; then
    log_warning "Node.js not found. Playwright may not work properly."
    log_info "Install Node.js from: https://nodejs.org/"
else
    log_success "Node.js is installed"
fi

# Check for cURL
log_info "Checking for cURL..."
if ! command -v curl &> /dev/null; then
    log_error "cURL is required but not installed. Please install curl."
    exit 1
fi
log_success "cURL is installed"

# Install dependencies
log_info "Installing project dependencies..."
bun install
log_success "Dependencies installed"

# Install Playwright browsers
log_info "Installing Playwright browsers (this may take a while)..."
bunx playwright install chromium
if [ $? -eq 0 ]; then
    log_success "Playwright browsers installed"
else
    log_warning "Playwright browser installation may have failed"
fi

# Make scripts executable
log_info "Making scripts executable..."
chmod +x strudel-send.sh
chmod +x setup.sh
log_success "Scripts are executable"

# Check for files to serve
log_info "Scanning for Strudel files..."
file_count=$(find . -name "*.strudel" -o -name "*.strdl" -o -name "*.js" -o -name "*.ts" | grep -v node_modules | wc -l)
log_info "Found $file_count files to serve"

if [ $file_count -eq 0 ]; then
    log_warning "No Strudel files found. Create some .strudel or .strdl files to get started!"
fi

# Neovim integration setup
if command -v nvim &> /dev/null; then
    log_info "Neovim found. Setting up integration..."

    NVIM_CONFIG_DIR="$HOME/.config/nvim"
    NVIM_LUA_DIR="$NVIM_CONFIG_DIR/lua"

    # Create directories if they don't exist
    mkdir -p "$NVIM_LUA_DIR"

    # Copy the Lua plugin
    if [ -f "strudel-integration.lua" ]; then
        cp strudel-integration.lua "$NVIM_LUA_DIR/"
        log_success "Neovim plugin installed to $NVIM_LUA_DIR/strudel-integration.lua"

        log_info "Add this to your Neovim config (~/.config/nvim/init.lua):"
        echo ""
        echo -e "${YELLOW}require('strudel-integration').setup()${NC}"
        echo ""
    else
        log_warning "strudel-integration.lua not found"
    fi
else
    log_warning "Neovim not found. Skipping Neovim integration setup."
fi

# Create example files
log_info "Creating example files..."

cat > example-pattern.strdl << 'EOF'
// Example Strudel pattern
// Try sending this to Strudel with: ./strudel-send.sh example-pattern.strdl

setcps(120/60/4)

s("bd hh sd hh")
  .bank("RolandTR808")
  .lpf(sine.range(400, 4000).slow(8))
  .room(0.2)
  .delay(0.1)

// Uncomment for bass:
// s("~ c3 ~ c3").n("<0 2 1 4>").s("sawtooth").lpf(800).room(0.1)
EOF

cat > example-acid.strdl << 'EOF'
// Acid bassline example

setcps(130/60/4)

s("~ c3 ~ c3 ~ c3 ~ c3")
  .n("<0 2 1 4 3 1 2 0>".slow(2))
  .s("sawtooth")
  .lpf(sine.range(200, 2000).slow(16))
  .resonance(15)
  .distort(0.3)
  .room(0.1)
  .delay(0.05)

stack(
  s("bd ~ ~ ~"),
  s("~ ~ sd ~"),
  s("~ hh ~ hh").gain(0.3)
).bank("RolandTR808")
EOF

log_success "Created example files: example-pattern.strdl, example-acid.strdl"

echo ""
echo -e "${GREEN}🚀 Setup complete! Here's how to get started:${NC}"
echo ""
echo -e "${BLUE}1. Start the server:${NC}"
echo "   bun run start"
echo ""
echo -e "${BLUE}2. Test the integration:${NC}" 
echo "   ./strudel-send.sh example-pattern.strdl"
echo ""
echo -e "${BLUE}3. From Neovim:${NC}"
echo "   - Open a .strdl file"
echo "   - Press <leader>ss to send to Strudel"
echo "   - Press <leader>sh to stop playback"
echo ""
echo -e "${BLUE}4. Open web interface:${NC}"
echo "   http://localhost:3001/strudel"
echo ""
echo -e "${BLUE}📚 Available commands:${NC}"
echo "   bun run start          - Start the server"
echo "   bun run dev            - Start with hot reloading" 
echo "   ./strudel-send.sh --help - Command line usage"
echo ""
echo -e "${BLUE}🎹 Neovim key bindings (after setup):${NC}"
echo "   <leader>ss - Send buffer/selection to Strudel"
echo "   <leader>sh - Stop Strudel (hush)"
echo "   <leader>si - Initialize browser"
echo ""
echo -e "${GREEN}💡 Pro tip: Start with the example files to test everything works!${NC}"
echo ""
echo -e "${YELLOW}🎵 Happy live coding! 🎶${NC}"
