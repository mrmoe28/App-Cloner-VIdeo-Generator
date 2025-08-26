#!/bin/bash

echo "🚀 Starting AI Video Studio..."
echo "================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo "✅ Dependencies installed"
fi

# Check if FFmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  FFmpeg is not installed. Video processing may not work."
    echo "   Please install FFmpeg:"
    echo "   - macOS: brew install ffmpeg"
    echo "   - Ubuntu: sudo apt install ffmpeg"
    echo ""
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✅ .env file created. Please edit it with your API keys."
    echo ""
fi

echo "🎬 Starting AI Video Studio server..."
echo "📱 Open your browser and go to:"
echo "   🔹 AI Studio: http://localhost:3000/ai-video-studio.html"
echo "   🔹 Basic Creator: http://localhost:3000/advanced_video_creator.html"
echo "   🔹 API Health: http://localhost:3000/api/health"
echo ""
echo "⏹️  Press Ctrl+C to stop the server"
echo "================================"

# Start the server
npm start