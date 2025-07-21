#!/bin/bash
# strudel-send.sh - Send current file or stdin to Strudel

SERVER_URL="http://localhost:3001"

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
  echo ""
  echo "EXAMPLES:"
  echo "  $0 my-pattern.strdl      # Send file to Strudel"
  echo "  echo 's("bd hh")' | $0   # Send from stdin"
  echo "  $0 --stop                # Stop playback"
  echo "  $0 --init                # Start browser"
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

  local response
  response=$(echo "$data" | curl -s -X POST \
    -H "Content-Type: text/plain" \
    --data-binary @- \
    "$SERVER_URL$endpoint")

  local exit_code=$?

  if [ $exit_code -eq 0 ]; then
    echo "$response"
  else
    echo "❌ Failed to connect to server (is it running?)"
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
    -s|--stop)
      send_to_strudel "" "/api/hush"
      exit $?
      ;;
    -i|--init)
      curl -s -X POST "$SERVER_URL/api/browser/init" | grep -q success
      if [ $? -eq 0 ]; then
        echo "🎭 Browser initialized"
      else
        echo "❌ Failed to initialize browser"
      fi
      exit $?
      ;;
    --status)
      curl -s "$SERVER_URL/health" | python3 -m json.tool 2>/dev/null || echo "❌ Server not responding"
      exit $?
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
      else
        echo "❌ File not found: $1"
        exit 1
      fi
      exit $?
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

