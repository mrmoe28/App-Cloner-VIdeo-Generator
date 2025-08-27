const crypto = require('crypto');
const { DatabaseService } = require('./database');
const { EncryptionService } = require('./encryption');
const logger = require('./logger');

class OAuthManager {
  constructor() {
    this.database = null;
    this.encryption = new EncryptionService();
    this.tokenCache = new Map();
    this.initializeDatabase();
  }

  async initializeDatabase() {
    if (!this.database) {
      this.database = new DatabaseService();
      await this.database.initialize();
      await this.createOAuthTable();
    }
  }

  async createOAuthTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS oauth_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        token_type TEXT DEFAULT 'Bearer',
        expires_at DATETIME,
        scope TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, platform)
      )
    `;
    
    await this.database.run(query);
    await logger.info('OAuth tokens table initialized');
  }

  // Store OAuth tokens securely
  async saveToken(userId, platform, tokenData) {
    await this.initializeDatabase();
    
    try {
      // Encrypt sensitive tokens
      const encryptedAccessToken = this.encryption.encrypt(tokenData.accessToken);
      const encryptedRefreshToken = tokenData.refreshToken ? 
        this.encryption.encrypt(tokenData.refreshToken) : null;
      
      const query = `
        INSERT OR REPLACE INTO oauth_tokens 
        (user_id, platform, access_token, refresh_token, token_type, expires_at, scope, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      
      const expiresAt = tokenData.expiresIn ? 
        new Date(Date.now() + tokenData.expiresIn * 1000).toISOString() : null;
      
      await this.database.run(query, [
        userId,
        platform,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenData.tokenType || 'Bearer',
        expiresAt,
        tokenData.scope || null
      ]);
      
      // Update cache
      const cacheKey = `${userId}:${platform}`;
      this.tokenCache.set(cacheKey, {
        ...tokenData,
        expiresAt
      });
      
      await logger.info('OAuth token saved', { userId, platform });
      return true;
    } catch (error) {
      await logger.error('Failed to save OAuth token', error, { userId, platform });
      throw error;
    }
  }

  // Retrieve and validate OAuth token
  async getValidToken(userId, platform) {
    await this.initializeDatabase();
    
    // Check cache first
    const cacheKey = `${userId}:${platform}`;
    const cached = this.tokenCache.get(cacheKey);
    
    if (cached && this.isTokenValid(cached)) {
      return cached.accessToken;
    }
    
    try {
      const query = `
        SELECT * FROM oauth_tokens 
        WHERE user_id = ? AND platform = ?
      `;
      
      const token = await this.database.get(query, [userId, platform]);
      
      if (!token) {
        await logger.info('No OAuth token found', { userId, platform });
        return null;
      }
      
      // Decrypt token
      const decryptedToken = {
        accessToken: this.encryption.decrypt(token.access_token),
        refreshToken: token.refresh_token ? 
          this.encryption.decrypt(token.refresh_token) : null,
        tokenType: token.token_type,
        expiresAt: token.expires_at,
        scope: token.scope
      };
      
      // Check if token is expired
      if (!this.isTokenValid(decryptedToken)) {
        await logger.info('OAuth token expired', { userId, platform });
        
        // Try to refresh if we have a refresh token
        if (decryptedToken.refreshToken) {
          return await this.refreshToken(userId, platform, decryptedToken.refreshToken);
        }
        
        return null;
      }
      
      // Update cache
      this.tokenCache.set(cacheKey, decryptedToken);
      
      return decryptedToken.accessToken;
    } catch (error) {
      await logger.error('Failed to get OAuth token', error, { userId, platform });
      return null;
    }
  }

  // Check if token is still valid
  isTokenValid(tokenData) {
    if (!tokenData.accessToken) return false;
    
    if (tokenData.expiresAt) {
      const expiryTime = new Date(tokenData.expiresAt).getTime();
      const now = Date.now();
      const buffer = 5 * 60 * 1000; // 5 minutes buffer
      
      return expiryTime > (now + buffer);
    }
    
    // If no expiry, assume valid
    return true;
  }

  // Platform-specific token refresh
  async refreshToken(userId, platform, refreshToken) {
    try {
      let newTokenData;
      
      switch (platform) {
      case 'youtube':
        newTokenData = await this.refreshYouTubeToken(refreshToken);
        break;
      case 'facebook':
      case 'instagram':
        newTokenData = await this.refreshFacebookToken(refreshToken);
        break;
      case 'linkedin':
        newTokenData = await this.refreshLinkedInToken(refreshToken);
        break;
      default:
        throw new Error(`Refresh not supported for platform: ${platform}`);
      }
      
      if (newTokenData) {
        await this.saveToken(userId, platform, newTokenData);
        return newTokenData.accessToken;
      }
      
      return null;
    } catch (error) {
      await logger.error('Failed to refresh token', error, { userId, platform });
      return null;
    }
  }

  // YouTube OAuth refresh
  async refreshYouTubeToken(refreshToken) {
    const axios = require('axios');
    
    try {
      const response = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: process.env.YOUTUBE_CLIENT_ID,
        client_secret: process.env.YOUTUBE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      });
      
      return {
        accessToken: response.data.access_token,
        tokenType: response.data.token_type,
        expiresIn: response.data.expires_in,
        scope: response.data.scope
      };
    } catch (error) {
      await logger.error('YouTube token refresh failed', error);
      throw error;
    }
  }

  // Facebook/Instagram OAuth refresh
  async refreshFacebookToken(refreshToken) {
    const axios = require('axios');
    
    try {
      const response = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: process.env.FACEBOOK_APP_ID,
          client_secret: process.env.FACEBOOK_APP_SECRET,
          fb_exchange_token: refreshToken
        }
      });
      
      return {
        accessToken: response.data.access_token,
        tokenType: 'Bearer',
        expiresIn: response.data.expires_in
      };
    } catch (error) {
      await logger.error('Facebook token refresh failed', error);
      throw error;
    }
  }

  // LinkedIn OAuth refresh  
  async refreshLinkedInToken(refreshToken) {
    const axios = require('axios');
    
    try {
      const response = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET
      });
      
      return {
        accessToken: response.data.access_token,
        tokenType: 'Bearer',
        expiresIn: response.data.expires_in
      };
    } catch (error) {
      await logger.error('LinkedIn token refresh failed', error);
      throw error;
    }
  }

  // Revoke OAuth token
  async revokeToken(userId, platform) {
    await this.initializeDatabase();
    
    try {
      const query = `
        DELETE FROM oauth_tokens 
        WHERE user_id = ? AND platform = ?
      `;
      
      await this.database.run(query, [userId, platform]);
      
      // Clear from cache
      const cacheKey = `${userId}:${platform}`;
      this.tokenCache.delete(cacheKey);
      
      await logger.info('OAuth token revoked', { userId, platform });
      return true;
    } catch (error) {
      await logger.error('Failed to revoke token', error, { userId, platform });
      return false;
    }
  }

  // Get all tokens for a user
  async getUserTokens(userId) {
    await this.initializeDatabase();
    
    try {
      const query = `
        SELECT platform, token_type, expires_at, scope, created_at, updated_at
        FROM oauth_tokens 
        WHERE user_id = ?
      `;
      
      const tokens = await this.database.all(query, [userId]);
      
      return tokens.map(token => ({
        ...token,
        isValid: this.isTokenValid({ expiresAt: token.expires_at })
      }));
    } catch (error) {
      await logger.error('Failed to get user tokens', error, { userId });
      return [];
    }
  }

  // OAuth URL generators for initial auth
  generateOAuthUrl(platform, userId, redirectUri) {
    const state = crypto.randomBytes(16).toString('hex');
    
    switch (platform) {
    case 'youtube':
      return this.generateYouTubeOAuthUrl(state, redirectUri);
    case 'facebook':
    case 'instagram':  
      return this.generateFacebookOAuthUrl(state, redirectUri);
    case 'tiktok':
      return this.generateTikTokOAuthUrl(state, redirectUri);
    case 'linkedin':
      return this.generateLinkedInOAuthUrl(state, redirectUri);
    case 'twitter':
      return this.generateTwitterOAuthUrl(state, redirectUri);
    default:
      throw new Error(`OAuth not supported for platform: ${platform}`);
    }
  }

  generateYouTubeOAuthUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/youtube.upload',
      state: state,
      access_type: 'offline',
      prompt: 'consent'
    });
    
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  generateFacebookOAuthUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: process.env.FACEBOOK_APP_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'publish_video,pages_manage_posts,instagram_basic,instagram_content_publish',
      state: state
    });
    
    return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
  }

  generateTikTokOAuthUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'video.upload',
      state: state
    });
    
    return `https://www.tiktok.com/auth/authorize?${params.toString()}`;
  }

  generateLinkedInOAuthUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: process.env.LINKEDIN_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'w_member_social',
      state: state
    });
    
    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  }

  generateTwitterOAuthUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: process.env.TWITTER_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'tweet.read tweet.write users.read offline.access',
      state: state,
      code_challenge: 'challenge', // Should be generated properly
      code_challenge_method: 'S256'
    });
    
    return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  }
}

module.exports = new OAuthManager();