// Vercel Serverless Function Entry Point
const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Simple in-memory storage for serverless
const userApiKeys = new Map();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// Export for Vercel
module.exports = app;