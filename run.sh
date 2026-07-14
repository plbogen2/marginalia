#!/bin/bash

# Kill background processes on exit
trap 'kill $(jobs -p) 2>/dev/null' EXIT

echo "Starting Backend Server (port 3000)..."
cd backend
npm run dev &

echo "Starting Frontend Dev Server (port 5173)..."
cd ../frontend
npm run dev &

# Wait for background processes to keep script running
wait
