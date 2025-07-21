#!/bin/bash

# build.sh - Build script for the refactored Neovim + Strudel server

set -e  # Exit on any error

echo "🔨 Building Neovim + Strudel Integration Server v2.0"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if Bun is installed
if ! command -v bun &> /dev/null; then
    error "Bun is not installed. Please install Bun first:"
    echo "  curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

info "Bun version: $(bun --version)"

# Clean previous builds
info "Cleaning previous builds..."
rm -rf dist/ build/
mkdir -p dist/{client,server}

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    info "Installing dependencies..."
    bun install
    success "Dependencies installed"
fi

# Type checking
# info "Running TypeScript type checking..."
# if bun run type-check; then
#     success "Type checking passed"
# else
#     error "Type checking failed"
#     exit 1
# fi

# Build client-side modules (for browser)
info "Building client-side TypeScript modules..."
bun build \
    --target=browser \
    --outdir=dist/client \
    --sourcemap=external \
    --minify \
    client-types.ts \
    client-api.ts \
    client-ui.ts \
    client-app.ts

if [ $? -eq 0 ]; then
    success "Client modules built successfully"
else
    error "Client build failed"
    exit 1
fi

# Build server-side modules (for Bun runtime)
info "Building server-side TypeScript modules..."
bun build \
    --target=bun \
    --outdir=dist/server \
    --sourcemap=external \
    file-manager.ts \
    neovim-manager.ts \
    playwright-manager.ts

if [ $? -eq 0 ]; then
    success "Server modules built successfully"
else
    error "Server build failed"
    exit 1
fi

# Build main server
info "Building main server..."
bun build \
    --target=bun \
    --outdir=dist \
    --sourcemap=external \
    refactored-server.ts

if [ $? -eq 0 ]; then
    success "Main server built successfully"
else
    error "Main server build failed"
    exit 1
fi

# Copy static assets
info "Copying static assets..."
cp refactored-template.html dist/template.html
cp styles.css dist/styles.css 2>/dev/null || warning "styles.css not found, skipping"
cp *.md dist/ 2>/dev/null || warning "No markdown files found"

# Update HTML template to use built JavaScript
info "Updating HTML template to reference built modules..."
sed -i.bak 's/client-types\.js/client\/client-types.js/g' dist/template.html
sed -i.bak 's/client-api\.js/client\/client-api.js/g' dist/template.html
sed -i.bak 's/client-ui\.js/client\/client-ui.js/g' dist/template.html
sed -i.bak 's/client-app\.js/client\/client-app.js/g' dist/template.html
rm dist/template.html.bak

# Create production package.json
info "Creating production package.json..."
cat > dist/package.json << EOF
{
  "name": "neovim-strudel-server",
  "version": "2.0.0",
  "type": "module",
  "main": "refactored-server.js",
  "scripts": {
    "start": "bun run refactored-server.js"
  },
  "dependencies": {
    "neovim": "^4.10.1",
    "find-process": "^1.4.7",
    "playwright": "^1.40.0"
  }
}
EOF

# Calculate build sizes
info "Build summary:"
echo "=================================================="

if [ -d "dist" ]; then
    CLIENT_SIZE=$(du -sh dist/client 2>/dev/null | cut -f1 || echo "N/A")
    SERVER_SIZE=$(du -sh dist/server 2>/dev/null | cut -f1 || echo "N/A")
    TOTAL_SIZE=$(du -sh dist 2>/dev/null | cut -f1 || echo "N/A")
    
    echo "📦 Client modules: $CLIENT_SIZE"
    echo "🖥️  Server modules: $SERVER_SIZE"
    echo "📊 Total build size: $TOTAL_SIZE"
    echo ""
    
    echo "📁 Build structure:"
    tree dist/ -L 2 2>/dev/null || find dist -type f | head -10
fi

echo "=================================================="
success "Build completed successfully!"
echo ""
info "To run the built server:"
echo "  cd dist && bun start"
echo ""
info "To run in development mode:"
echo "  bun run dev"
echo ""
info "To test the server:"
echo "  curl http://localhost:3001/health"
