#!/bin/bash
# strudel-send.sh - Send current file or stdin to Strudel (Fixed version with timeout)

SERVER_URL="http://localhost:3001"
TIMEOUT=10  # 10 second timeout for requests

show_usage() {
  echo "Usage: $0 [OPTIONS] [FILE]"
  echo ""
  echo "Send code to Strudel REPL via server automation"
  echo ""
  echo "OPTIONS:"
  echo "  -h, --help     Show this help message"
  echo "  -s, --stop     Stop Strudel playback (hush)"
  echo "  -i, --init     Initialize browser"
  echo "  --status       Show server status"
  echo "  -t, --timeout  Set timeout in seconds (default: 10)"
  echo ""
  echo "EXAMPLES:"
  echo "  $0 my-pattern.strdl      # Send file to Strudel"
  echo "  echo 's(\"bd hh\")' | $0   # Send from stdin"
  echo "  $0 --stop                # Stop playback"
  echo "  $0 --init                # Start browser"
  echo "  $0 -t 5 file.strdl       # Use 5 second timeout"
  echo ""
  echo "FROM NEOVIM:"
  echo "  :!$0 %                   # Send current file"
  echo "  :'<,'>w !$0             # Send visual selection"
}

send_to_strudel() {
  local data="$1"
  local endpoint="$2"

  if [ -z "$data" ]; then
    echo "❌ No data to send"
    return 1
  fi

  echo "📤 Sending to Strudel (timeout: ${TIMEOUT}s)..."

  local response
  response=$(echo "$data" | curl -s -X POST \
    -H "Content-Type: text/plain" \
    --data-binary @- \
    --max-time "$TIMEOUT" \
    --connect-timeout 5 \
    "$SERVER_URL$endpoint")

  local exit_code=$?

  if [ $exit_code -eq 0 ]; then
    echo "$response"
    return 0
  elif [ $exit_code -eq 28 ]; then
    echo "❌ Request timed out after ${TIMEOUT} seconds"
    echo "💡 Try: Check if server is running, increase timeout with -t option"
    return 1
  else
    echo "❌ Failed to connect to server (curl exit code: $exit_code)"
    echo "💡 Make sure the server is running at $SERVER_URL"
    return 1
  fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      show_usage
      exit 0
      ;;
    -t|--timeout)
      TIMEOUT="$2"
      if ! [[ "$TIMEOUT" =~ ^[0-9]+$ ]] || [ "$TIMEOUT" -lt 1 ]; then
        echo "❌ Invalid timeout value: $TIMEOUT"
        exit 1
      fi
      shift 2
      ;;
    -s|--stop)
      echo "⏹️ Stopping Strudel..."
      curl -s -X POST --max-time "$TIMEOUT" --connect-timeout 5 "$SERVER_URL/api/hush"
      exit_code=$?
      if [ $exit_code -eq 0 ]; then
        echo "✅ Stop command sent"
      elif [ $exit_code -eq 28 ]; then
        echo "❌ Request timed out"
      else
        echo "❌ Failed to send stop command"
      fi
      exit $exit_code
      ;;
    -i|--init)
      echo "🎭 Initializing browser..."
      response=$(curl -s -X POST --max-time "$TIMEOUT" --connect-timeout 5 "$SERVER_URL/api/browser/init")
      exit_code=$?
      if [ $exit_code -eq 0 ] && echo "$response" | grep -q success; then
        echo "✅ Browser initialized"
      elif [ $exit_code -eq 28 ]; then
        echo "❌ Request timed out"
      else
        echo "❌ Failed to initialize browser"
      fi
      exit $exit_code
      ;;
    --status)
      echo "📊 Checking server status..."
      curl -s --max-time "$TIMEOUT" "$SERVER_URL/health" | python3 -m json.tool 2>/dev/null
      exit_code=${PIPESTATUS[0]}
      if [ $exit_code -eq 28 ]; then
        echo "❌ Request timed out"
      elif [ $exit_code -ne 0 ]; then
        echo "❌ Server not responding"
      fi
      exit $exit_code
      ;;
    -*)
      echo "Unknown option: $1"
      show_usage
      exit 1
      ;;
    *)
      # File argument
      if [ -f "$1" ]; then
        send_to_strudel "$(cat "$1")" "/api/send-current-buffer"
        exit $?
      else
        echo "❌ File not found: $1"
        exit 1
      fi
      ;;
  esac
done

# If no arguments, read from stdin
if [ -t 0 ]; then
  echo "❌ No input provided. Use --help for usage."
  exit 1
else
  data=$(cat)
  send_to_strudel "$data" "/api/send-current-buffer"
fi
