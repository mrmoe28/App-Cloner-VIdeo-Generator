# 🚀 AI Video Studio Setup Guide

Complete guide to set up and run your AI-powered video generation platform.

## 📋 Prerequisites

- **Node.js** (v16 or higher)
- **FFmpeg** (for video processing)
- **OpenAI API Key** (required for AI features)

## 🛠️ Installation

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/mrmoe28/App-Cloner-VIdeo-Generator.git
cd App-Cloner-VIdeo-Generator
npm install
```

### 2. Install FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install ffmpeg
```

**Windows:**
- Download from https://ffmpeg.org/download.html
- Add to PATH environment variable

### 3. Environment Setup

Copy and configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` file with your API keys:
```env
# Required
OPENAI_API_KEY=sk-your-openai-api-key-here

# Optional (for enhanced features)
UNSPLASH_ACCESS_KEY=your-unsplash-key
PIXABAY_API_KEY=your-pixabay-key
PEXELS_API_KEY=your-pexels-key
FREESOUND_API_KEY=your-freesound-key
```

## 🔑 API Keys Setup

### OpenAI API Key (Required)

1. Visit https://platform.openai.com/api-keys
2. Create a new API key
3. Add to `.env` file or enter in the web interface

### Stock Content APIs (Optional)

**Unsplash** (Free Images):
1. Visit https://unsplash.com/developers
2. Register application
3. Get Access Key

**Pixabay** (Images & Videos):
1. Visit https://pixabay.com/api/docs/
2. Create account and get API key
3. 5000 requests/hour free

**Pexels** (Images & Videos):
1. Visit https://www.pexels.com/api/
2. Create account and get API key
3. 200 requests/hour free

**Freesound** (Audio):
1. Visit https://freesound.org/apiv2/
2. Create account and get API key
3. 60 requests/minute free

## 🚀 Running the Application

### Start the Server
```bash
npm start
```

### Development Mode
```bash
npm run dev
```

### Access the Application
- **AI Video Studio**: http://localhost:3000/ai-video-studio.html
- **Basic Creator**: http://localhost:3000/advanced_video_creator.html
- **API Health**: http://localhost:3000/api/health

## 🎯 Quick Start

1. **Open AI Video Studio**: Navigate to the AI Video Studio interface
2. **Setup API**: Enter your OpenAI API key in the header
3. **Create Video**: 
   - Describe your video in the AI prompt
   - Generate script with AI
   - Create video with one click
4. **Share**: Export or share to social media platforms

## 📱 Features Overview

### 🤖 AI-Powered Creation
- **Script Generation**: AI creates video scripts from prompts
- **Content Optimization**: Platform-specific formatting
- **Visual Suggestions**: AI generates scene descriptions
- **Script Improvement**: Enhance engagement and clarity

### 🎨 Content Library
- **Stock Images**: Search millions of free images
- **Stock Videos**: Find royalty-free video clips
- **Music Library**: Discover background music
- **File Uploads**: Use your own content

### 📹 Video Processing
- **Multiple Formats**: Generate for all platforms
- **Real-time Preview**: See your video as you create
- **Custom Branding**: Add logos and overlays
- **Professional Effects**: Automated transitions and animations

### 📱 Social Media Integration
- **YouTube Shorts**: Optimized vertical videos
- **TikTok**: Perfect aspect ratio and duration
- **Instagram Reels**: Platform-specific formatting
- **Twitter/X**: Ideal for social sharing
- **Facebook & LinkedIn**: Professional content

## 🔧 API Endpoints

### Health Check
```
GET /api/health
```

### OpenAI Setup
```
POST /api/openai/setup
Body: { "apiKey": "sk-...", "userId": "default" }
```

### Generate Script
```
POST /api/ai/generate-script
Body: { "prompt": "...", "platform": "tiktok", "duration": 60 }
```

### Stock Content Search
```
GET /api/stock/search?query=technology&type=image&limit=20
```

### File Upload
```
POST /api/upload
Form Data: files[]
```

### Social Media Sharing
```
POST /api/social/share
Body: { "platform": "youtube", "videoId": "...", "caption": "..." }
```

## 📊 Database Schema

The application uses SQLite with these main tables:
- **users**: User accounts and API keys
- **videos**: Generated videos and metadata
- **uploaded_files**: User-uploaded content
- **stock_content**: Cached stock content
- **social_shares**: Sharing history
- **processing_jobs**: Video generation status

## 🔒 Security Features

- **Encrypted API Keys**: User API keys are encrypted at rest
- **Input Validation**: All inputs are validated and sanitized
- **Rate Limiting**: Built-in protection against API abuse
- **Secure File Handling**: Safe file upload and processing

## 🚨 Troubleshooting

### Common Issues

**"OpenAI API key not found"**
- Ensure API key is correctly set in `.env` or web interface
- Check API key has sufficient credits

**"FFmpeg not found"**
- Install FFmpeg and ensure it's in PATH
- Restart the application after installation

**"Stock content search failed"**
- Check internet connection
- Verify API keys for stock content providers
- Some providers have rate limits

**"Video generation failed"**
- Ensure FFmpeg is properly installed
- Check disk space for temporary files
- Verify input files are valid formats

### Logs and Debugging

Enable debug logging:
```bash
NODE_ENV=development npm start
```

Check logs for detailed error messages and API responses.

## 🚀 Deployment

### Local Production
```bash
NODE_ENV=production npm start
```

### Docker (Optional)
```bash
# Build image
docker build -t ai-video-studio .

# Run container
docker run -p 3000:3000 --env-file .env ai-video-studio
```

### Cloud Deployment
The application can be deployed to:
- **Heroku**: Add buildpacks for Node.js and FFmpeg
- **AWS EC2**: Install dependencies and run
- **DigitalOcean**: Use App Platform
- **Railway**: Connect GitHub repo

## 📈 Performance Tips

1. **API Keys**: Use your own API keys for best performance
2. **Caching**: Stock content is cached for 1 hour
3. **File Size**: Keep uploaded files under 100MB
4. **Concurrent Users**: SQLite supports moderate traffic
5. **Scaling**: Consider PostgreSQL for high traffic

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

- **GitHub Issues**: https://github.com/mrmoe28/App-Cloner-VIdeo-Generator/issues
- **Documentation**: Check README files in each directory
- **API Reference**: Built-in at `/api/health`

---

🎬 **Happy Video Creating!** 

Your AI Video Studio is ready to transform ideas into engaging videos!