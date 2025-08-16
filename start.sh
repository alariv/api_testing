#!/bin/bash

echo "🚀 Starting API Testing Application..."
echo ""

# Start backend in background
echo "📡 Starting Backend Server..."
cd backend
npm run dev &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 3

# Start frontend in background
echo "⚛️  Starting Frontend Application..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ Both services are starting..."
echo "📡 Backend: http://localhost:3001"
echo "⚛️  Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both services"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo "✅ Services stopped"
    exit 0
}

# Trap Ctrl+C and call cleanup
trap cleanup SIGINT

# Wait for both processes
wait
