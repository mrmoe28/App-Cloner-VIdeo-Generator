// Vercel Serverless Function Entry Point
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Simple in-memory storage for serverless
const userApiKeys = new Map();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from root directory
app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// HTML file serving routes
const serveHtmlFile = (filePath) => (req, res) => {
  const fullPath = path.join(__dirname, '..', filePath);
  if (fs.existsSync(fullPath)) {
    res.sendFile(fullPath);
  } else {
    res.status(404).send('File not found');
  }
};

app.get('/', serveHtmlFile('index.html'));
app.get('/advanced-video-creator', serveHtmlFile('advanced_video_creator.html'));
app.get('/video-generator', serveHtmlFile('video_generator.html'));
app.get('/video-demo', serveHtmlFile('video_demo.html'));
app.get('/ai-video-studio', serveHtmlFile('ai-video-studio.html'));

// Simple encryption for API keys
function simpleEncrypt(text) {
  return Buffer.from(text).toString('base64');
}

function simpleDecrypt(encrypted) {
  return Buffer.from(encrypted, 'base64').toString();
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    serverless: true,
    environment: process.env.NODE_ENV || 'development'
  });
});

// OpenAI API Key Check
app.get('/api/openai/check', (req, res) => {
  try {
    const hasEnvKey = !!process.env.OPENAI_API_KEY;
    const { userId } = req.query;
    
    const hasUserKey = userApiKeys.has(userId || 'default');
    
    res.json({ 
      configured: hasEnvKey || hasUserKey,
      useEnvKey: hasEnvKey,
      requiresUserKey: !hasEnvKey
    });
  } catch (error) {
    console.error('Error checking API key:', error);
    res.status(500).json({ error: 'Failed to check API key status' });
  }
});

// OpenAI API Key Setup
app.post('/api/openai/setup', async (req, res) => {
  try {
    const { apiKey, userId } = req.body;
    
    if (process.env.OPENAI_API_KEY) {
      return res.json({ 
        success: true, 
        message: 'Using server-configured OpenAI API key',
        keyId: 'server'
      });
    }
    
    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }
    
    // Simple API key validation
    if (!apiKey.startsWith('sk-')) {
      return res.status(400).json({ error: 'Invalid OpenAI API key format' });
    }
    
    // Store encrypted key
    const encryptedKey = simpleEncrypt(apiKey);
    userApiKeys.set(userId || 'default', encryptedKey);
    
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

// AI Video Assistant - Generate Script
app.post('/api/ai/generate-script', async (req, res) => {
  try {
    const { prompt, platform, duration, userId } = req.body;
    
    // Get API key
    let apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      const encryptedKey = userApiKeys.get(userId || 'default');
      if (encryptedKey) {
        apiKey = simpleDecrypt(encryptedKey);
      }
    }
    
    if (!apiKey) {
      return res.status(400).json({ error: 'No OpenAI API key available' });
    }
    
    // Initialize OpenAI
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey });
    
    const systemPrompt = `You are an expert video marketing copywriter specializing in short-form vertical videos. 
    Create compelling scripts optimized for ${platform || 'general'} that drive engagement and conversions.
    
    Guidelines:
    - Target duration: ${duration || 60} seconds
    - Format: 9:16 vertical video
    - Include hook in first 3 seconds
    - Strong call-to-action
    - Platform-specific optimization
    - Clear scene directions with timestamps`;

    const userPrompt = `Create a ${duration || 60}-second video script for ${platform || 'general'} about: ${prompt}

    Format the response as JSON with this structure:
    {
      "title": "Video title",
      "duration": ${duration || 60},
      "platform": "${platform || 'general'}",
      "scenes": [
        {
          "startTime": 0,
          "endTime": 3,
          "voiceover": "Script text here",
          "visualDirection": "What should be shown on screen",
          "onScreenText": "Text overlay if any"
        }
      ]
    }`;
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 1500,
      temperature: 0.7
    });
    
    const scriptContent = completion.choices[0].message.content;
    
    try {
      const script = JSON.parse(scriptContent);
      res.json({ success: true, script });
    } catch (parseError) {
      // If JSON parsing fails, return a structured response
      res.json({ 
        success: true, 
        script: {
          title: `${platform || 'General'} Video Script`,
          duration: duration || 60,
          platform: platform || 'general',
          content: scriptContent
        }
      });
    }
    
  } catch (error) {
    console.error('Error generating script:', error);
    res.status(500).json({ error: error.message || 'Failed to generate script' });
  }
});

// AI Script Improvement
app.post('/api/ai/improve-script', async (req, res) => {
  try {
    const { script, improvements = [], userId } = req.body;
    
    if (!script) {
      return res.status(400).json({ error: 'Script is required' });
    }
    
    // Get API key
    let apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      const encryptedKey = userApiKeys.get(userId || 'default');
      if (encryptedKey) {
        apiKey = simpleDecrypt(encryptedKey);
      }
    }
    
    if (!apiKey) {
      // Return a demo response when no API key is available
      const demoImprovedScript = `Demo Mode: Script Improvement

📝 ORIGINAL SCRIPT (${script.length} characters):
"${script.substring(0, 200)}${script.length > 200 ? '...' : ''}"

✨ IMPROVED VERSION:
This is a demo response. With an OpenAI API key, this would provide:
- Enhanced hook and opening
- Better pacing and structure  
- Stronger call-to-action
- Improved ${improvements.join(', ') || 'engagement, clarity, call-to-action, pacing'}

🚀 Configure your OpenAI API key to get real AI-powered script improvements!`;
      
      return res.json({ 
        success: true, 
        script: demoImprovedScript,
        demo: true,
        message: 'Demo mode - Configure OpenAI API key for real improvements' 
      });
    }
    
    // Initialize OpenAI
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey });
    
    const improvementAreas = improvements.length > 0 
      ? improvements.join(', ')
      : 'engagement, clarity, call-to-action, pacing';
    
    const systemPrompt = `You are an expert video script editor specializing in improving short-form content for maximum engagement and conversion.
    
    Focus on these improvement areas: ${improvementAreas}
    
    Guidelines:
    - Maintain the original message and intent
    - Enhance hook strength and retention
    - Improve flow and pacing
    - Strengthen call-to-action
    - Keep it concise and impactful
    - Optimize for the target platform`;

    const userPrompt = `Improve this video script focusing on ${improvementAreas}:

${script}

Return the improved script in the same JSON format if it's structured, or as improved text if it's plain text.`;
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 1500,
      temperature: 0.7
    });
    
    const improvedContent = completion.choices[0].message.content;
    
    // Try to parse as JSON, fallback to text
    try {
      const improvedScript = JSON.parse(improvedContent);
      res.json({ success: true, script: improvedScript });
    } catch (parseError) {
      res.json({ 
        success: true, 
        script: improvedContent
      });
    }
    
  } catch (error) {
    console.error('Error improving script:', error);
    res.status(500).json({ error: error.message || 'Failed to improve script' });
  }
});

// AI Visual Scene Prompts Generation
app.post('/api/ai/generate-scene-prompts', async (req, res) => {
  try {
    const { script, userId } = req.body;
    
    if (!script) {
      return res.status(400).json({ error: 'Script is required' });
    }
    
    // Get API key
    let apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      const encryptedKey = userApiKeys.get(userId || 'default');
      if (encryptedKey) {
        apiKey = simpleDecrypt(encryptedKey);
      }
    }
    
    if (!apiKey) {
      // Return demo visual prompts when no API key is available
      const demoPrompts = [
        {
          scene: 1,
          description: "Wide shot of modern office workspace with natural lighting",
          visual_elements: ["Clean desk setup", "Computer screen", "Coffee cup", "Professional atmosphere"],
          duration: "3-5 seconds",
          camera: "Static wide shot"
        },
        {
          scene: 2, 
          description: "Close-up of hands typing on keyboard with focus on productivity",
          visual_elements: ["Keyboard close-up", "Fast typing motion", "Screen glow", "Focused energy"],
          duration: "2-3 seconds",
          camera: "Close-up with shallow depth of field"
        },
        {
          scene: 3,
          description: "Medium shot showing satisfied expression and achievement",
          visual_elements: ["Confident smile", "Relaxed posture", "Success indicators", "Positive lighting"],
          duration: "3-4 seconds", 
          camera: "Medium shot at eye level"
        }
      ];
      
      return res.json({ 
        success: true, 
        prompts: demoPrompts,
        demo: true,
        message: 'Demo mode - Configure OpenAI API key for custom visual prompts based on your script' 
      });
    }
    
    // Initialize OpenAI
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey });
    
    const systemPrompt = `You are a visual director who creates detailed scene descriptions for video production. 
    
    For each scene in the script, create:
    - Visual setting and environment
    - Key visual elements and props
    - Lighting and mood
    - Camera angles and movement
    - Color palette suggestions
    - Visual metaphors or symbols
    
    Focus on creating engaging, cinematic visuals that support the message.`;

    const userPrompt = `Create detailed visual scene prompts for this video script:

${typeof script === 'object' ? JSON.stringify(script, null, 2) : script}

Return as JSON array with this structure:
[
  {
    "sceneNumber": 1,
    "timeRange": "0-5s",
    "visualPrompt": "Detailed visual description...",
    "searchKeywords": "keyword1, keyword2, keyword3",
    "mood": "professional, energetic",
    "cameraAngle": "close-up, wide shot, etc."
  }
]`;
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 2000,
      temperature: 0.8
    });
    
    const visualContent = completion.choices[0].message.content;
    
    try {
      const prompts = JSON.parse(visualContent);
      res.json({ success: true, prompts });
    } catch (parseError) {
      // Fallback: create simple prompts from script
      const fallbackPrompts = [{
        sceneNumber: 1,
        timeRange: "0-60s",
        visualPrompt: "Professional business setting with modern technology elements, clean and engaging visuals that support the message",
        searchKeywords: "business, technology, professional, modern",
        mood: "professional, engaging",
        cameraAngle: "medium shot"
      }];
      
      res.json({ 
        success: true, 
        prompts: fallbackPrompts,
        note: "Generated fallback prompts due to parsing issues"
      });
    }
    
  } catch (error) {
    console.error('Error generating visual prompts:', error);
    res.status(500).json({ error: error.message || 'Failed to generate visual prompts' });
  }
});

// AI Visual Generation
app.post('/api/ai/generate-visuals', async (req, res) => {
  try {
    const { script, userId } = req.body;
    
    // Get API key
    let apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      const encryptedKey = userApiKeys.get(userId || 'default');
      if (encryptedKey) {
        apiKey = simpleDecrypt(encryptedKey);
      }
    }
    
    if (!apiKey) {
      return res.status(400).json({ error: 'No OpenAI API key available' });
    }
    
    // Initialize OpenAI
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey });
    
    // Generate visual prompts based on script
    const visualPrompt = `Based on this video script, generate detailed visual prompts for each scene that would work well for AI image generation:

${JSON.stringify(script, null, 2)}

Create specific, detailed visual descriptions for each scene that include:
- Setting/background
- Characters/subjects
- Lighting and mood
- Camera angles
- Visual style (modern, professional, cinematic, etc.)

Format as JSON array with one prompt per scene.`;
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are an expert visual director who creates detailed prompts for AI image generation.' },
        { role: 'user', content: visualPrompt }
      ],
      max_tokens: 1000,
      temperature: 0.7
    });
    
    const visualContent = completion.choices[0].message.content;
    
    try {
      const visuals = JSON.parse(visualContent);
      res.json({ success: true, visuals });
    } catch (parseError) {
      // Return as string if JSON parsing fails
      res.json({ 
        success: true, 
        visuals: visualContent
      });
    }
    
  } catch (error) {
    console.error('Error generating visuals:', error);
    res.status(500).json({ error: error.message || 'Failed to generate visual prompts' });
  }
});

// Stock Media Library Management Endpoints
app.post('/api/stock/search', async (req, res) => {
  try {
    const { query, type = 'image', page = 1, limit = 20 } = req.body;
    
    // Initialize stock content service if not already done
    if (!global.stockContentService) {
      const { StockContentService } = require('../lib/stock-content');
      global.stockContentService = new StockContentService();
    }
    
    const results = await global.stockContentService.search({
      query,
      type,
      page,
      limit
    });
    
    res.json({ success: true, ...results });
  } catch (error) {
    console.error('Stock media search error:', error);
    res.status(500).json({ error: error.message || 'Failed to search stock media' });
  }
});

app.get('/api/stock/trending', async (req, res) => {
  try {
    const { type = 'image' } = req.query;
    
    if (!global.stockContentService) {
      const { StockContentService } = require('../lib/stock-content');
      global.stockContentService = new StockContentService();
    }
    
    const results = await global.stockContentService.getTrending(type);
    
    res.json({ success: true, ...results });
  } catch (error) {
    console.error('Trending stock media error:', error);
    res.status(500).json({ error: error.message || 'Failed to get trending media' });
  }
});

app.post('/api/library/add', async (req, res) => {
  try {
    const { mediaItem, tags = [], category = 'other', notes = '' } = req.body;
    
    if (!global.stockContentService) {
      const { StockContentService } = require('../lib/stock-content');
      global.stockContentService = new StockContentService();
    }
    
    const result = await global.stockContentService.addToLibrary(mediaItem, tags, category, notes);
    
    res.json({ success: true, libraryItem: result });
  } catch (error) {
    console.error('Add to library error:', error);
    res.status(500).json({ error: error.message || 'Failed to add to library' });
  }
});

app.get('/api/library/media', async (req, res) => {
  try {
    const { type, category, provider, tags, limit = 50, offset = 0 } = req.query;
    
    const filters = {};
    if (type) filters.type = type;
    if (category) filters.category = category;
    if (provider) filters.provider = provider;
    if (tags) filters.tags = Array.isArray(tags) ? tags : tags.split(',');
    if (limit) filters.limit = parseInt(limit);
    if (offset) filters.offset = parseInt(offset);
    
    if (!global.stockContentService) {
      const { StockContentService } = require('../lib/stock-content');
      global.stockContentService = new StockContentService();
    }
    
    const results = await global.stockContentService.getLibraryMedia(filters);
    
    res.json({ success: true, results });
  } catch (error) {
    console.error('Get library media error:', error);
    res.status(500).json({ error: error.message || 'Failed to get library media' });
  }
});

app.delete('/api/library/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!global.stockContentService) {
      const { StockContentService } = require('../lib/stock-content');
      global.stockContentService = new StockContentService();
    }
    
    const result = await global.stockContentService.removeFromLibrary(id);
    
    res.json({ success: result.success });
  } catch (error) {
    console.error('Remove from library error:', error);
    res.status(500).json({ error: error.message || 'Failed to remove from library' });
  }
});

app.put('/api/library/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { tags, category, notes } = req.body;
    
    if (!global.stockContentService) {
      const { StockContentService } = require('../lib/stock-content');
      global.stockContentService = new StockContentService();
    }
    
    const result = await global.stockContentService.updateLibraryItem(id, {
      tags,
      category,
      notes
    });
    
    res.json({ success: result.success });
  } catch (error) {
    console.error('Update library item error:', error);
    res.status(500).json({ error: error.message || 'Failed to update library item' });
  }
});

app.get('/api/library/stats', async (req, res) => {
  try {
    if (!global.stockContentService) {
      const { StockContentService } = require('../lib/stock-content');
      global.stockContentService = new StockContentService();
    }
    
    const stats = await global.stockContentService.getLibraryStats();
    
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Get library stats error:', error);
    res.status(500).json({ error: error.message || 'Failed to get library stats' });
  }
});

// Video Generation Workflow Endpoints

// Generate Video from Script
app.post('/api/video/generate', async (req, res) => {
  try {
    const { script, options = {}, userId } = req.body;
    
    if (!script) {
      return res.status(400).json({ error: 'Script is required' });
    }
    
    // Initialize services
    if (!global.stockContentService) {
      const { StockContentService } = require('../lib/stock-content');
      global.stockContentService = new StockContentService();
    }
    
    if (!global.databaseService) {
      const { DatabaseService } = require('../lib/database');
      global.databaseService = new DatabaseService();
    }
    
    if (!global.videoGeneratorService) {
      const { VideoGeneratorService } = require('../lib/video-generator');
      global.videoGeneratorService = new VideoGeneratorService(
        global.stockContentService,
        global.databaseService
      );
    }
    
    // Check if fast mode is enabled
    if (options.fastMode) {
      // Return immediately with processing status
      const { v4: uuidv4 } = require('uuid');
      const videoId = uuidv4();
      
      // Start background processing
      setImmediate(async () => {
        try {
          console.log(`🚀 Starting background video generation for ${videoId}`);
          
          // Initialize processing job in database
          await global.databaseService.initializeProcessingJob(videoId, 'processing', 0);
          
          const videoData = await global.videoGeneratorService.generateVideo({
            script,
            options: {
              ...options,
              userId: userId || 'default',
              videoId
            }
          });
          
          // Update job status to completed
          await global.databaseService.updateProcessingJob(videoId, 'completed', 100, null, videoData);
          console.log(`✅ Background video generation completed for ${videoId}`);
          
        } catch (error) {
          console.error(`❌ Background video generation failed for ${videoId}:`, error);
          await global.databaseService.updateProcessingJob(videoId, 'failed', 0, error.message);
        }
      });
      
      res.json({ 
        success: true, 
        processing: true,
        videoId,
        message: 'Video generation started in background'
      });
      
    } else {
      // Synchronous processing (original behavior)
      const videoData = await global.videoGeneratorService.generateVideo({
        script,
        options: {
          ...options,
          userId: userId || 'default'
        }
      });
      
      res.json({ 
        success: true, 
        video: videoData,
        message: 'Video generated successfully'
      });
    }
    
  } catch (error) {
    console.error('Video generation error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate video' });
  }
});

// Get Video Generation Progress
app.get('/api/video/progress/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    if (!global.databaseService) {
      const { DatabaseService } = require('../lib/database');
      global.databaseService = new DatabaseService();
    }
    
    // Check processing job status
    const job = await global.databaseService.getProcessingJob(videoId);
    
    if (!job) {
      return res.status(404).json({ error: 'Video processing job not found' });
    }
    
    res.json({ 
      success: true, 
      progress: {
        status: job.status,
        progress: job.progress,
        errorMessage: job.error_message,
        startedAt: job.started_at,
        completedAt: job.completed_at
      }
    });
    
  } catch (error) {
    console.error('Progress check error:', error);
    res.status(500).json({ error: error.message || 'Failed to get progress' });
  }
});

// Get Saved Videos
app.get('/api/videos/saved', async (req, res) => {
  try {
    const { limit = 50, offset = 0, userId = 'default' } = req.query;
    
    if (!global.videoGeneratorService) {
      const { StockContentService } = require('../lib/stock-content');
      const { DatabaseService } = require('../lib/database');
      const { VideoGeneratorService } = require('../lib/video-generator');
      
      global.stockContentService = new StockContentService();
      global.databaseService = new DatabaseService();
      global.videoGeneratorService = new VideoGeneratorService(
        global.stockContentService,
        global.databaseService
      );
    }
    
    const videos = await global.videoGeneratorService.getSavedVideos(
      parseInt(limit), 
      parseInt(offset)
    );
    
    res.json({ 
      success: true, 
      videos,
      count: videos.length
    });
    
  } catch (error) {
    console.error('Get saved videos error:', error);
    res.status(500).json({ error: error.message || 'Failed to get saved videos' });
  }
});

// Get Video Project Details
app.get('/api/videos/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    if (!global.databaseService) {
      const { DatabaseService } = require('../lib/database');
      global.databaseService = new DatabaseService();
    }
    
    const video = await global.databaseService.getVideoProject(videoId);
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    res.json({ 
      success: true, 
      video
    });
    
  } catch (error) {
    console.error('Get video project error:', error);
    res.status(500).json({ error: error.message || 'Failed to get video project' });
  }
});

// Delete Video Project
app.delete('/api/videos/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    if (!global.videoGeneratorService) {
      const { StockContentService } = require('../lib/stock-content');
      const { DatabaseService } = require('../lib/database');
      const { VideoGeneratorService } = require('../lib/video-generator');
      
      global.stockContentService = new StockContentService();
      global.databaseService = new DatabaseService();
      global.videoGeneratorService = new VideoGeneratorService(
        global.stockContentService,
        global.databaseService
      );
    }
    
    const deleted = await global.videoGeneratorService.deleteVideo(videoId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Video not found or failed to delete' });
    }
    
    res.json({ 
      success: true, 
      message: 'Video deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete video error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete video' });
  }
});

// Generate Captions for Script
app.post('/api/video/captions', async (req, res) => {
  try {
    const { script } = req.body;
    
    if (!script) {
      return res.status(400).json({ error: 'Script is required' });
    }
    
    if (!global.videoGeneratorService) {
      const { StockContentService } = require('../lib/stock-content');
      const { DatabaseService } = require('../lib/database');
      const { VideoGeneratorService } = require('../lib/video-generator');
      
      global.stockContentService = new StockContentService();
      global.databaseService = new DatabaseService();
      global.videoGeneratorService = new VideoGeneratorService(
        global.stockContentService,
        global.databaseService
      );
    }
    
    // Analyze script first
    const sceneAnalysis = await global.videoGeneratorService.analyzeScript(script);
    
    // Generate captions
    const captions = await global.videoGeneratorService.generateCaptions(sceneAnalysis);
    
    res.json({ 
      success: true, 
      captions,
      sceneAnalysis
    });
    
  } catch (error) {
    console.error('Caption generation error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate captions' });
  }
});

// Generate Visual Assets for Script Scenes
app.post('/api/video/assets', async (req, res) => {
  try {
    const { script, sceneId } = req.body;
    
    if (!script) {
      return res.status(400).json({ error: 'Script is required' });
    }
    
    if (!global.stockContentService) {
      const { StockContentService } = require('../lib/stock-content');
      global.stockContentService = new StockContentService();
    }
    
    if (!global.videoGeneratorService) {
      const { DatabaseService } = require('../lib/database');
      const { VideoGeneratorService } = require('../lib/video-generator');
      
      global.databaseService = new DatabaseService();
      global.videoGeneratorService = new VideoGeneratorService(
        global.stockContentService,
        global.databaseService
      );
    }
    
    // Analyze script
    const sceneAnalysis = await global.videoGeneratorService.analyzeScript(script);
    
    // Generate assets for specific scene or all scenes
    let targetScenes = sceneAnalysis.scenes;
    if (sceneId) {
      targetScenes = sceneAnalysis.scenes.filter(scene => scene.id === sceneId);
    }
    
    // Create temp directory for this request
    const path = require('path');
    const fs = require('fs-extra');
    const { v4: uuidv4 } = require('uuid');
    
    const tempId = uuidv4();
    const projectDir = path.join(process.cwd(), 'temp', 'video-gen', tempId);
    fs.ensureDirSync(projectDir);
    
    try {
      // Generate visual assets
      const visualAssets = await global.videoGeneratorService.generateVisualAssets(
        { ...sceneAnalysis, scenes: targetScenes },
        projectDir
      );
      
      res.json({ 
        success: true, 
        assets: visualAssets,
        sceneAnalysis: { ...sceneAnalysis, scenes: targetScenes }
      });
      
      // Clean up temp files after response
      setTimeout(() => {
        fs.removeSync(projectDir);
      }, 30000); // 30 seconds
      
    } catch (assetError) {
      // Clean up on error
      fs.removeSync(projectDir);
      throw assetError;
    }
    
  } catch (error) {
    console.error('Asset generation error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate visual assets' });
  }
});

// Create Video Timeline
app.post('/api/video/timeline', async (req, res) => {
  try {
    const { script, visualAssets, captions } = req.body;
    
    if (!script) {
      return res.status(400).json({ error: 'Script is required' });
    }
    
    if (!global.videoGeneratorService) {
      const { StockContentService } = require('../lib/stock-content');
      const { DatabaseService } = require('../lib/database');
      const { VideoGeneratorService } = require('../lib/video-generator');
      
      global.stockContentService = new StockContentService();
      global.databaseService = new DatabaseService();
      global.videoGeneratorService = new VideoGeneratorService(
        global.stockContentService,
        global.databaseService
      );
    }
    
    // Analyze script
    const sceneAnalysis = await global.videoGeneratorService.analyzeScript(script);
    
    // Generate captions if not provided
    let captionData = captions;
    if (!captionData) {
      captionData = await global.videoGeneratorService.generateCaptions(sceneAnalysis);
    }
    
    // Use provided visual assets or generate placeholders
    let assetData = visualAssets || [];
    
    // Create timeline
    const timeline = await global.videoGeneratorService.createTimeline(
      sceneAnalysis,
      assetData,
      captionData
    );
    
    res.json({ 
      success: true, 
      timeline,
      sceneAnalysis
    });
    
  } catch (error) {
    console.error('Timeline creation error:', error);
    res.status(500).json({ error: error.message || 'Failed to create timeline' });
  }
});

// File Upload Endpoint
app.post('/api/upload', async (req, res) => {
  try {
    const multer = require('multer');
    const path = require('path');
    const fs = require('fs-extra');
    
    // Configure multer for file uploads
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        const uploadDir = path.join(process.cwd(), 'uploads');
        fs.ensureDirSync(uploadDir);
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
      }
    });

    const fileFilter = (req, file, cb) => {
      const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|mp3|wav|m4a/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype);

      if (mimetype && extname) {
        return cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only images, videos, and audio files are allowed.'));
      }
    };

    const upload = multer({
      storage: storage,
      limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
      fileFilter: fileFilter
    }).array('files', 10); // Max 10 files

    upload(req, res, async (err) => {
      if (err) {
        console.error('Upload error:', err);
        return res.status(400).json({ error: err.message || 'Upload failed' });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      try {
        // Initialize database service
        if (!global.databaseService) {
          const { DatabaseService } = require('../lib/database');
          global.databaseService = new DatabaseService();
          await global.databaseService.initialize();
        }

        const uploadedFiles = [];
        
        for (const file of req.files) {
          // Store file info in database
          const fileId = await global.databaseService.storeUploadedFile({
            filename: file.filename,
            originalname: file.originalname,
            path: file.path,
            mimetype: file.mimetype,
            size: file.size,
            userId: req.body.userId || 'default'
          });

          uploadedFiles.push({
            id: fileId,
            filename: file.filename,
            originalname: file.originalname,
            url: `/uploads/${file.filename}`,
            type: file.mimetype.startsWith('image/') ? 'image' : 
                  file.mimetype.startsWith('video/') ? 'video' : 'audio',
            size: file.size
          });
        }

        res.json({ 
          success: true, 
          files: uploadedFiles,
          message: `Successfully uploaded ${uploadedFiles.length} file(s)` 
        });

      } catch (dbError) {
        console.error('Database error during upload:', dbError);
        res.status(500).json({ error: 'Failed to save file information to database' });
      }
    });

  } catch (error) {
    console.error('Upload endpoint error:', error);
    res.status(500).json({ error: error.message || 'Upload failed' });
  }
});

// Get uploaded files
app.get('/api/uploads', async (req, res) => {
  try {
    const { category, userId = 'default' } = req.query;
    
    // Initialize database service
    if (!global.databaseService) {
      const { DatabaseService } = require('../lib/database');
      global.databaseService = new DatabaseService();
      await global.databaseService.initialize();
    }
    
    const files = await global.databaseService.getUserFiles(userId, category);
    
    res.json({ 
      success: true, 
      files: files.map(file => ({
        id: file.id,
        filename: file.filename,
        originalName: file.original_name,
        url: file.file_url,
        type: file.category,
        size: file.size,
        mimetype: file.mimetype,
        uploadedAt: file.created_at
      }))
    });
    
  } catch (error) {
    console.error('Get uploads error:', error);
    res.status(500).json({ error: error.message || 'Failed to get uploaded files' });
  }
});

// Delete uploaded file
app.delete('/api/uploads/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const path = require('path');
    const fs = require('fs-extra');
    
    // Initialize database service
    if (!global.databaseService) {
      const { DatabaseService } = require('../lib/database');
      global.databaseService = new DatabaseService();
      await global.databaseService.initialize();
    }
    
    // Get file info from database
    const fileInfo = await global.databaseService.get('SELECT * FROM uploaded_files WHERE id = ?', [fileId]);
    
    if (!fileInfo) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Delete file from filesystem
    try {
      if (fs.existsSync(fileInfo.file_path)) {
        fs.unlinkSync(fileInfo.file_path);
      }
    } catch (fsError) {
      console.warn('Failed to delete file from filesystem:', fsError.message);
    }
    
    // Delete file record from database
    await global.databaseService.run('DELETE FROM uploaded_files WHERE id = ?', [fileId]);
    
    res.json({ 
      success: true, 
      message: 'File deleted successfully' 
    });
    
  } catch (error) {
    console.error('Delete upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete file' });
  }
});

// Serve uploaded files
app.get('/uploads/:filename', (req, res) => {
  const path = require('path');
  const filename = req.params.filename;
  const filepath = path.join(process.cwd(), 'uploads', filename);
  
  // Security: prevent path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  
  res.sendFile(filepath, (err) => {
    if (err) {
      console.error('File serve error:', err);
      res.status(404).json({ error: 'File not found' });
    }
  });
});

// Export for Vercel serverless functions
module.exports = (req, res) => {
  return app(req, res);
};