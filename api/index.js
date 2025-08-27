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
    
    // Simple mock response for now to test connectivity
    const mockScript = {
      title: `${platform || 'General'} Video Script`,
      duration: duration || 60,
      platform: platform || 'general',
      scenes: [
        {
          startTime: 0,
          endTime: 10,
          voiceover: `Hook: ${prompt}`,
          visualDirection: "Show engaging opening visual",
          onScreenText: "Attention-grabbing text"
        }
      ]
    };
    
    res.json({ success: true, script: mockScript });
  } catch (error) {
    console.error('Error generating script:', error);
    res.status(500).json({ error: error.message || 'Failed to generate script' });
  }
});

// Export for Vercel
module.exports = app;