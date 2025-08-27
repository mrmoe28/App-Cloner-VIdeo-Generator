const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
require('dotenv').config();

const { AIVideoAssistant } = require('./lib/ai-assistant');
const { StockContentService } = require('./lib/stock-content');
const { DatabaseService } = require('./lib/database');
const { EncryptionService } = require('./lib/encryption');
const { SocialShareService } = require('./lib/social-share');
const { VideoProcessingService } = require('./lib/video-processing');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('.'));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads';
    fs.ensureDirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|webm|wav|mp3|m4a/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, videos, and audio files are allowed.'));
    }
  }
});

// Initialize services
let aiAssistant, stockContent, database, encryption, socialShare, videoProcessor;

async function initializeServices() {
  try {
    encryption = new EncryptionService();
    database = new DatabaseService();
    await database.initialize();
    
    // Initialize AI Assistant - will handle API key setup
    aiAssistant = new AIVideoAssistant();
    
    stockContent = new StockContentService();
    socialShare = new SocialShareService();
    videoProcessor = new VideoProcessingService();
    
    console.log('✅ All services initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing services:', error);
  }
}

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    services: {
      ai: !!aiAssistant,
      stock: !!stockContent,
      database: !!database,
      social: !!socialShare,
      video: !!videoProcessor
    }
  });
});

// OpenAI API Key Management
app.post('/api/openai/setup', async (req, res) => {
  try {
    const { apiKey, userId } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }
    
    // Test the API key
    const isValid = await aiAssistant.testApiKey(apiKey);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid OpenAI API key' });
    }
    
    // Encrypt and store the API key
    const encryptedKey = encryption.encrypt(apiKey);
    await database.storeUserApiKey(userId || 'default', encryptedKey);
    
    res.json({ 
      success: true, 
      message: 'OpenAI API key stored securely',
      keyId: userId || 'default'
    });
  } catch (error) {
    console.error('Error setting up OpenAI API key:', error);
    res.status(500).json({ error: 'Failed to setup API key' });
  }
});

// AI Video Assistant
app.post('/api/ai/generate-script', async (req, res) => {
  try {
    const { prompt, platform, duration, userId } = req.body;
    
    const script = await aiAssistant.generateVideoScript({
      prompt,
      platform: platform || 'general',
      duration: duration || 60,
      userId: userId || 'default'
    });
    
    res.json({ success: true, script });
  } catch (error) {
    console.error('Error generating script:', error);
    res.status(500).json({ error: error.message || 'Failed to generate script' });
  }
});

app.post('/api/ai/improve-script', async (req, res) => {
  try {
    const { script, improvements, userId } = req.body;
    
    const improvedScript = await aiAssistant.improveScript({
      script,
      improvements: improvements || ['engagement', 'clarity'],
      userId: userId || 'default'
    });
    
    res.json({ success: true, script: improvedScript });
  } catch (error) {
    console.error('Error improving script:', error);
    res.status(500).json({ error: error.message || 'Failed to improve script' });
  }
});

app.post('/api/ai/generate-scene-prompts', async (req, res) => {
  try {
    const { script, userId } = req.body;
    
    const prompts = await aiAssistant.generateScenePrompts({
      script,
      userId: userId || 'default'
    });
    
    res.json({ success: true, prompts });
  } catch (error) {
    console.error('Error generating scene prompts:', error);
    res.status(500).json({ error: error.message || 'Failed to generate scene prompts' });
  }
});

// Stock Content Discovery
app.get('/api/stock/search', async (req, res) => {
  try {
    const { query, type, page, limit } = req.query;
    
    const results = await stockContent.search({
      query: query || 'technology',
      type: type || 'image',
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20
    });
    
    res.json({ success: true, results });
  } catch (error) {
    console.error('Error searching stock content:', error);
    res.status(500).json({ error: 'Failed to search stock content' });
  }
});

app.get('/api/stock/trending', async (req, res) => {
  try {
    const { type } = req.query;
    const trending = await stockContent.getTrending(type || 'image');
    
    res.json({ success: true, trending });
  } catch (error) {
    console.error('Error getting trending content:', error);
    res.status(500).json({ error: 'Failed to get trending content' });
  }
});

// File Upload
app.post('/api/upload', upload.array('files', 10), async (req, res) => {
  try {
    const files = req.files.map(file => ({
      filename: file.filename,
      originalname: file.originalname,
      path: file.path,
      size: file.size,
      mimetype: file.mimetype,
      url: `/uploads/${file.filename}`
    }));
    
    // Store in database
    for (const file of files) {
      await database.storeUploadedFile({
        filename: file.filename,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path,
        userId: req.body.userId || 'default'
      });
    }
    
    res.json({ success: true, files });
  } catch (error) {
    console.error('Error uploading files:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// Video Processing
app.post('/api/video/process', async (req, res) => {
  try {
    const { scenes, audio, settings } = req.body;
    
    const videoId = await videoProcessor.createVideo({
      scenes,
      audio,
      settings: {
        width: 360,
        height: 640,
        fps: 30,
        duration: 60,
        ...settings
      }
    });
    
    res.json({ success: true, videoId });
  } catch (error) {
    console.error('Error processing video:', error);
    res.status(500).json({ error: 'Failed to process video' });
  }
});

app.get('/api/video/status/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const status = await videoProcessor.getStatus(videoId);
    
    res.json({ success: true, status });
  } catch (error) {
    console.error('Error getting video status:', error);
    res.status(500).json({ error: 'Failed to get video status' });
  }
});

// Database Operations
app.get('/api/videos', async (req, res) => {
  try {
    const { userId, page, limit } = req.query;
    
    const videos = await database.getUserVideos({
      userId: userId || 'default',
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10
    });
    
    res.json({ success: true, videos });
  } catch (error) {
    console.error('Error getting videos:', error);
    res.status(500).json({ error: 'Failed to get videos' });
  }
});

app.post('/api/videos', async (req, res) => {
  try {
    const videoData = req.body;
    const videoId = await database.saveVideo(videoData);
    
    res.json({ success: true, videoId });
  } catch (error) {
    console.error('Error saving video:', error);
    res.status(500).json({ error: 'Failed to save video' });
  }
});

// Social Media Sharing
app.post('/api/social/share', async (req, res) => {
  try {
    const { platform, videoId, caption, userId } = req.body;
    
    const result = await socialShare.shareVideo({
      platform,
      videoId,
      caption,
      userId: userId || 'default'
    });
    
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error sharing to social media:', error);
    res.status(500).json({ error: 'Failed to share video' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: error.message || 'Internal server error' });
});

// Serve uploaded files
app.use('/uploads', express.static('./uploads'));

// Start server
async function startServer() {
  await initializeServices();
  
  app.listen(PORT, () => {
    console.log(`🚀 App Cloner Video Generator Server running on http://localhost:${PORT}`);
    console.log(`📁 Serving files from: ${__dirname}`);
    console.log(`🎬 Open http://localhost:${PORT}/advanced_video_creator.html to start creating videos`);
  });
}

startServer().catch(console.error);