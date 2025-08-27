// Vercel Serverless Function Entry Point
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
require('dotenv').config();

const { AIVideoAssistant } = require('../lib/ai-assistant');
const { StockContentService } = require('../lib/stock-content');
const { DatabaseService } = require('../lib/database');
const { EncryptionService } = require('../lib/encryption');
const { SocialShareService } = require('../lib/social-share');
const { VideoProcessingService } = require('../lib/video-processing');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize services
let aiAssistant, stockContent, database, encryption, socialShare, videoProcessor;
let servicesInitialized = false;

async function initializeServices() {
  if (servicesInitialized) return;
  
  try {
    encryption = new EncryptionService();
    database = new DatabaseService();
    await database.initialize();
    
    aiAssistant = new AIVideoAssistant();
    stockContent = new StockContentService();
    socialShare = new SocialShareService();
    videoProcessor = new VideoProcessingService();
    
    servicesInitialized = true;
    console.log('✅ All services initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing services:', error);
  }
}

// Health check
app.get('/api/health', async (req, res) => {
  await initializeServices();
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

// OpenAI API Key Check
app.get('/api/openai/check', async (req, res) => {
  await initializeServices();
  try {
    const hasEnvKey = !!process.env.OPENAI_API_KEY;
    const { userId } = req.query;
    
    let hasUserKey = false;
    if (userId && database) {
      hasUserKey = !!(await database.getUserApiKey(userId || 'default'));
    }
    
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
  await initializeServices();
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
    
    const isValid = await aiAssistant.testApiKey(apiKey);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid OpenAI API key' });
    }
    
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

// AI Video Assistant - Generate Script
app.post('/api/ai/generate-script', async (req, res) => {
  await initializeServices();
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

// Export for Vercel
module.exports = app;