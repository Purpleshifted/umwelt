#!/bin/bash
# Start both NoiseCraft server and Next.js dev server
echo "🎛  Starting NoiseCraft server on port 4000..."
cd "$(dirname "$0")/noisecraft" && node server.js &
NC_PID=$!

echo "🌐 Starting Next.js dev server on port 3000..."
cd "$(dirname "$0")" && npm run dev &
NEXT_PID=$!

echo ""
echo "═══════════════════════════════════════════"
echo "  UMWELT — Somatic Acoustic Sculpture"
echo "═══════════════════════════════════════════"
echo "  Next.js:     http://localhost:3000"
echo "  NoiseCraft:  http://localhost:4000"
echo "═══════════════════════════════════════════"
echo ""
echo "Press Ctrl+C to stop both servers"

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $NC_PID $NEXT_PID 2>/dev/null
  wait $NC_PID $NEXT_PID 2>/dev/null
  echo "Done."
}

trap cleanup SIGINT SIGTERM
wait
