const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');

class ConfigManager {
  constructor() {
    this.configDir = path.join(process.cwd(), 'config');
    this.configFile = path.join(this.configDir, 'app-config.json');
    this.userConfigsDir = path.join(this.configDir, 'users');
    this.presetConfigsDir = path.join(this.configDir, 'presets');
    
    this.defaultConfig = {
      video: {
        defaultWidth: 720,
        defaultHeight: 1280,
        defaultFps: 30,
        defaultDuration: 60,
        defaultFormat: 'mp4',
        defaultQuality: 23,
        defaultPreset: 'medium',
        maxWidth: 1920,
        maxHeight: 1920,
        maxDuration: 600,
        supportedFormats: ['mp4', 'mov', 'avi', 'mkv'],
        supportedCodecs: ['libx264', 'libx265', 'h264_videotoolbox'],
        supportedPresets: ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow']
      },
      audio: {
        defaultBitrate: '128k',
        defaultSampleRate: 44100,
        supportedFormats: ['aac', 'mp3', 'wav'],
        supportedBitrates: ['64k', '128k', '192k', '256k', '320k']
      },
      processing: {
        maxConcurrentJobs: 3,
        tempDirectory: './temp',
        outputDirectory: './output',
        cleanupInterval: 3600000, // 1 hour
        maxTempAge: 86400000, // 24 hours
        progressUpdateInterval: 1000, // 1 second
        enableHardwareAcceleration: false
      },
      platforms: {
        youtube: {
          maxDuration: 60,
          aspectRatio: '9:16',
          recommendedWidth: 1080,
          recommendedHeight: 1920,
          maxFileSize: 256 * 1024 * 1024 // 256MB
        },
        tiktok: {
          maxDuration: 180,
          aspectRatio: '9:16',
          recommendedWidth: 1080,
          recommendedHeight: 1920,
          maxFileSize: 100 * 1024 * 1024 // 100MB
        },
        instagram: {
          maxDuration: 90,
          aspectRatio: '9:16',
          recommendedWidth: 1080,
          recommendedHeight: 1920,
          maxFileSize: 100 * 1024 * 1024 // 100MB
        },
        facebook: {
          maxDuration: 240,
          aspectRatio: 'multiple',
          recommendedWidth: 1080,
          recommendedHeight: 1920,
          maxFileSize: 1024 * 1024 * 1024 // 1GB
        }
      },
      api: {
        rateLimit: {
          windowMs: 900000, // 15 minutes
          max: 100 // requests per windowMs
        },
        requestTimeout: 30000,
        maxRequestSize: '50mb'
      },
      security: {
        jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
        sessionTimeout: 604800000, // 7 days
        passwordMinLength: 8,
        requireStrongPassword: true,
        maxLoginAttempts: 5,
        lockoutDuration: 300000 // 5 minutes
      },
      storage: {
        provider: 'local', // local, aws-s3, gcs, azure
        local: {
          path: './storage'
        },
        aws: {
          bucket: process.env.AWS_S3_BUCKET,
          region: process.env.AWS_REGION,
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      },
      notifications: {
        enabled: true,
        email: {
          enabled: false,
          smtp: {
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT || 587,
            secure: false,
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS
            }
          }
        },
        webhook: {
          enabled: false,
          url: process.env.WEBHOOK_URL
        }
      }
    };

    this.cache = new Map();
    this.initialized = false;
  }

  // Initialize configuration system
  async initialize() {
    if (this.initialized) return;

    try {
      // Ensure directories exist
      await fs.ensureDir(this.configDir);
      await fs.ensureDir(this.userConfigsDir);
      await fs.ensureDir(this.presetConfigsDir);

      // Load or create main config
      await this.loadMainConfig();

      // Load preset configurations
      await this.loadPresets();

      this.initialized = true;
      await logger.info('Configuration manager initialized');
    } catch (error) {
      await logger.error('Failed to initialize configuration', error);
      throw error;
    }
  }

  // Load main application config
  async loadMainConfig() {
    try {
      if (await fs.pathExists(this.configFile)) {
        const configData = await fs.readJSON(this.configFile);
        this.mainConfig = { ...this.defaultConfig, ...configData };
      } else {
        this.mainConfig = { ...this.defaultConfig };
        await this.saveMainConfig();
      }
    } catch (error) {
      await logger.error('Failed to load main config, using defaults', error);
      this.mainConfig = { ...this.defaultConfig };
    }
  }

  // Save main configuration
  async saveMainConfig() {
    try {
      await fs.writeJSON(this.configFile, this.mainConfig, { spaces: 2 });
      await logger.info('Main configuration saved');
    } catch (error) {
      await logger.error('Failed to save main config', error);
      throw error;
    }
  }

  // Load video processing presets
  async loadPresets() {
    try {
      const presetFiles = await fs.readdir(this.presetConfigsDir);
      this.presets = new Map();

      for (const file of presetFiles) {
        if (path.extname(file) === '.json') {
          const presetName = path.basename(file, '.json');
          const presetPath = path.join(this.presetConfigsDir, file);
          const preset = await fs.readJSON(presetPath);
          this.presets.set(presetName, preset);
        }
      }

      // Create default presets if none exist
      if (this.presets.size === 0) {
        await this.createDefaultPresets();
      }

      await logger.info('Presets loaded', { count: this.presets.size });
    } catch (error) {
      await logger.error('Failed to load presets', error);
      this.presets = new Map();
    }
  }

  // Create default video processing presets
  async createDefaultPresets() {
    const defaultPresets = {
      'high-quality': {
        name: 'High Quality',
        description: 'Best quality for final output',
        video: {
          codec: 'libx264',
          preset: 'slow',
          crf: 18,
          pixelFormat: 'yuv420p'
        },
        audio: {
          codec: 'aac',
          bitrate: '192k',
          sampleRate: 48000
        },
        container: 'mp4'
      },
      'fast-encode': {
        name: 'Fast Encoding',
        description: 'Quick processing for previews',
        video: {
          codec: 'libx264',
          preset: 'veryfast',
          crf: 23,
          pixelFormat: 'yuv420p'
        },
        audio: {
          codec: 'aac',
          bitrate: '128k',
          sampleRate: 44100
        },
        container: 'mp4'
      },
      'social-media': {
        name: 'Social Media Optimized',
        description: 'Optimized for social platforms',
        video: {
          codec: 'libx264',
          preset: 'medium',
          crf: 20,
          pixelFormat: 'yuv420p',
          width: 1080,
          height: 1920
        },
        audio: {
          codec: 'aac',
          bitrate: '128k',
          sampleRate: 44100
        },
        container: 'mp4'
      },
      'web-optimized': {
        name: 'Web Optimized',
        description: 'Small file size for web streaming',
        video: {
          codec: 'libx264',
          preset: 'fast',
          crf: 28,
          pixelFormat: 'yuv420p'
        },
        audio: {
          codec: 'aac',
          bitrate: '96k',
          sampleRate: 44100
        },
        container: 'mp4',
        additionalOptions: ['-movflags', '+faststart']
      }
    };

    for (const [name, preset] of Object.entries(defaultPresets)) {
      await this.savePreset(name, preset);
      this.presets.set(name, preset);
    }
  }

  // Get configuration value
  get(key, defaultValue = null) {
    if (!this.initialized) {
      throw new Error('Configuration not initialized. Call initialize() first.');
    }

    const keys = key.split('.');
    let value = this.mainConfig;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }

    return value;
  }

  // Set configuration value
  async set(key, value) {
    if (!this.initialized) {
      throw new Error('Configuration not initialized. Call initialize() first.');
    }

    const keys = key.split('.');
    let target = this.mainConfig;

    // Navigate to parent object
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in target) || typeof target[k] !== 'object') {
        target[k] = {};
      }
      target = target[k];
    }

    // Set the value
    target[keys[keys.length - 1]] = value;

    // Save to file
    await this.saveMainConfig();

    await logger.info('Configuration updated', { key, value });
  }

  // Get video configuration for specific platform
  getVideoConfig(platform, userPreferences = {}) {
    const platformConfig = this.get(`platforms.${platform}`, {});
    const defaultVideoConfig = this.get('video', {});
    
    return {
      ...defaultVideoConfig,
      ...platformConfig,
      ...userPreferences
    };
  }

  // Get processing configuration
  getProcessingConfig() {
    return this.get('processing');
  }

  // Get preset configuration
  getPreset(presetName) {
    return this.presets.get(presetName);
  }

  // List available presets
  listPresets() {
    return Array.from(this.presets.keys());
  }

  // Save custom preset
  async savePreset(name, config) {
    try {
      const presetPath = path.join(this.presetConfigsDir, `${name}.json`);
      await fs.writeJSON(presetPath, config, { spaces: 2 });
      this.presets.set(name, config);
      
      await logger.info('Preset saved', { name });
      return true;
    } catch (error) {
      await logger.error('Failed to save preset', error, { name });
      throw error;
    }
  }

  // Delete preset
  async deletePreset(name) {
    try {
      const presetPath = path.join(this.presetConfigsDir, `${name}.json`);
      await fs.remove(presetPath);
      this.presets.delete(name);
      
      await logger.info('Preset deleted', { name });
      return true;
    } catch (error) {
      await logger.error('Failed to delete preset', error, { name });
      throw error;
    }
  }

  // Load user-specific configuration
  async getUserConfig(userId) {
    const cacheKey = `user_${userId}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const userConfigPath = path.join(this.userConfigsDir, `${userId}.json`);
      
      if (await fs.pathExists(userConfigPath)) {
        const userConfig = await fs.readJSON(userConfigPath);
        this.cache.set(cacheKey, userConfig);
        return userConfig;
      }
    } catch (error) {
      await logger.warn('Failed to load user config', { userId, error: error.message });
    }

    return {};
  }

  // Save user-specific configuration
  async saveUserConfig(userId, config) {
    try {
      const userConfigPath = path.join(this.userConfigsDir, `${userId}.json`);
      await fs.writeJSON(userConfigPath, config, { spaces: 2 });
      
      const cacheKey = `user_${userId}`;
      this.cache.set(cacheKey, config);
      
      await logger.info('User config saved', { userId });
      return true;
    } catch (error) {
      await logger.error('Failed to save user config', error, { userId });
      throw error;
    }
  }

  // Validate configuration
  validateConfig(config, schema = null) {
    // Basic validation - can be extended with JSON schema validation
    const errors = [];

    if (config.video) {
      if (config.video.width && (config.video.width < 1 || config.video.width > 4096)) {
        errors.push('Video width must be between 1 and 4096');
      }
      
      if (config.video.height && (config.video.height < 1 || config.video.height > 4096)) {
        errors.push('Video height must be between 1 and 4096');
      }
      
      if (config.video.fps && (config.video.fps < 1 || config.video.fps > 120)) {
        errors.push('Video FPS must be between 1 and 120');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Get merged configuration for video concatenation
  getConcatenationConfig(userConfig = {}, presetName = null) {
    let config = {
      ...this.get('video'),
      ...this.get('audio')
    };

    // Apply preset if specified
    if (presetName) {
      const preset = this.getPreset(presetName);
      if (preset) {
        config = {
          ...config,
          ...preset.video,
          ...preset.audio,
          container: preset.container,
          additionalOptions: preset.additionalOptions
        };
      }
    }

    // Apply user overrides
    config = {
      ...config,
      ...userConfig
    };

    return config;
  }
}

module.exports = new ConfigManager();