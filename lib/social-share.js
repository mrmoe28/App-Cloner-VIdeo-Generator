const axios = require('axios');
const { DatabaseService } = require('./database');
const oauthManager = require('./oauth-manager');
const logger = require('./logger');

class SocialShareService {
  constructor() {
    this.database = null;
    this.platforms = {
      youtube: {
        name: 'YouTube',
        apiUrl: 'https://www.googleapis.com/youtube/v3',
        uploadUrl: 'https://www.googleapis.com/upload/youtube/v3/videos',
        scopes: ['https://www.googleapis.com/auth/youtube.upload'],
        maxFileSize: 128 * 1024 * 1024 * 1024, // 128GB
        supportedFormats: ['mp4', 'mov', 'avi', 'wmv', 'flv', 'webm']
      },
      tiktok: {
        name: 'TikTok',
        apiUrl: 'https://open-api.tiktok.com',
        maxFileSize: 287 * 1024 * 1024, // 287MB
        supportedFormats: ['mp4', 'mov', 'webm'],
        maxDuration: 180 // 3 minutes
      },
      instagram: {
        name: 'Instagram',
        apiUrl: 'https://graph.facebook.com/v18.0',
        maxFileSize: 100 * 1024 * 1024, // 100MB
        supportedFormats: ['mp4', 'mov'],
        aspectRatio: '9:16',
        maxDuration: 60
      },
      twitter: {
        name: 'Twitter/X',
        apiUrl: 'https://upload.twitter.com/1.1/media',
        maxFileSize: 512 * 1024 * 1024, // 512MB
        supportedFormats: ['mp4', 'mov'],
        maxDuration: 140
      },
      facebook: {
        name: 'Facebook',
        apiUrl: 'https://graph.facebook.com/v18.0',
        maxFileSize: 10 * 1024 * 1024 * 1024, // 10GB
        supportedFormats: ['mp4', 'mov', 'avi'],
        maxDuration: 240
      },
      linkedin: {
        name: 'LinkedIn',
        apiUrl: 'https://api.linkedin.com/v2',
        maxFileSize: 200 * 1024 * 1024, // 200MB
        supportedFormats: ['mp4', 'mov', 'wmv'],
        maxDuration: 600 // 10 minutes
      }
    };

    this.initializeDatabase();
  }

  async initializeDatabase() {
    if (!this.database) {
      this.database = new DatabaseService();
      await this.database.initialize();
    }
  }

  async shareVideo({ platform, videoId, caption, userId = 'default', accessToken }) {
    try {
      await this.initializeDatabase();
      
      // Use provided token or get from OAuth manager
      const validToken = accessToken || await oauthManager.getValidToken(userId, platform);
      
      console.log(`📤 Sharing video ${videoId} to ${platform}`);

      // Get video details from database
      const video = await this.database.getVideo(videoId);
      if (!video) {
        throw new Error('Video not found');
      }

      // Validate platform support
      if (!this.platforms[platform]) {
        throw new Error(`Platform ${platform} not supported`);
      }

      // Record share attempt
      const shareId = await this.database.recordSocialShare({
        videoId,
        platform,
        caption,
        status: 'processing'
      });

      let shareResult;
      
      // Platform-specific sharing logic
      switch (platform) {
      case 'youtube':
        shareResult = await this.shareToYouTube(video, caption, validToken);
        break;
      case 'tiktok':
        shareResult = await this.shareToTikTok(video, caption, validToken);
        break;
      case 'instagram':
        shareResult = await this.shareToInstagram(video, caption, validToken);
        break;
      case 'twitter':
        shareResult = await this.shareToTwitter(video, caption, validToken);
        break;
      case 'facebook':
        shareResult = await this.shareToFacebook(video, caption, validToken);
        break;
      case 'linkedin':
        shareResult = await this.shareToLinkedIn(video, caption, validToken);
        break;
      default:
        throw new Error(`Sharing to ${platform} not implemented yet`);
      }

      // Update share record with results
      await this.database.updateSocialShare(shareId, {
        status: shareResult.success ? 'completed' : 'failed',
        shareUrl: shareResult.url,
        postId: shareResult.postId,
        errorMessage: shareResult.error
      });

      return {
        success: shareResult.success,
        shareId,
        platform,
        url: shareResult.url,
        postId: shareResult.postId,
        message: shareResult.message
      };

    } catch (error) {
      console.error(`Error sharing to ${platform}:`, error);
      throw error;
    }
  }

  async shareToYouTube(video, caption, accessToken) {
    try {
      // YouTube Shorts requirements: vertical video, max 60 seconds
      const metadata = {
        snippet: {
          title: video.title || 'Video from App Cloner Generator',
          description: caption || video.description || '',
          tags: ['shorts', 'ai', 'video', 'appcloner'],
          categoryId: '22', // People & Blogs
          defaultLanguage: 'en'
        },
        status: {
          privacyStatus: 'public',
          selfDeclaredMadeForKids: false
        }
      };

      // For now, return sharing URL (actual upload requires OAuth setup)
      const shareUrl = this.generateYouTubeShareUrl(video, metadata);
      
      return {
        success: true,
        url: shareUrl,
        postId: null,
        message: 'YouTube sharing URL generated. Complete upload manually.',
        requiresManualAction: true
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async shareToTikTok(video, caption, accessToken) {
    try {
      // TikTok sharing via web URL
      const shareUrl = this.generateTikTokShareUrl(video, caption);
      
      return {
        success: true,
        url: shareUrl,
        postId: null,
        message: 'TikTok sharing URL generated. Complete upload manually.',
        requiresManualAction: true
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async shareToInstagram(video, caption, accessToken) {
    try {
      // Instagram Reels sharing
      const shareUrl = this.generateInstagramShareUrl(video, caption);
      
      return {
        success: true,
        url: shareUrl,
        postId: null,
        message: 'Instagram sharing URL generated. Complete upload manually.',
        requiresManualAction: true
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async shareToTwitter(video, caption, accessToken) {
    try {
      const shareText = encodeURIComponent(caption || 'Check out this video created with App Cloner Video Generator!');
      const shareUrl = `https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(video.file_url || '')}`;
      
      return {
        success: true,
        url: shareUrl,
        postId: null,
        message: 'Twitter sharing URL generated.',
        requiresManualAction: true
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async shareToFacebook(video, caption, accessToken) {
    try {
      const shareUrl = this.generateFacebookShareUrl(video, caption);
      
      return {
        success: true,
        url: shareUrl,
        postId: null,
        message: 'Facebook sharing URL generated. Complete upload manually.',
        requiresManualAction: true
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async shareToLinkedIn(video, caption, accessToken) {
    try {
      const shareUrl = this.generateLinkedInShareUrl(video, caption);
      
      return {
        success: true,
        url: shareUrl,
        postId: null,
        message: 'LinkedIn sharing URL generated. Complete upload manually.',
        requiresManualAction: true
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // URL Generators for manual sharing
  generateYouTubeShareUrl(video, metadata) {
    // Generate YouTube Studio upload URL
    const params = new URLSearchParams({
      'upload': '1',
      'title': metadata.snippet.title,
      'description': metadata.snippet.description,
      'tags': metadata.snippet.tags.join(','),
      'privacy': metadata.status.privacyStatus
    });
    
    return `https://studio.youtube.com/channel/UC/videos/upload?${params.toString()}`;
  }

  generateTikTokShareUrl(video, caption) {
    // TikTok Creator Center upload URL
    return 'https://www.tiktok.com/creator-center/upload';
  }

  generateInstagramShareUrl(video, caption) {
    // Instagram web upload (requires mobile or desktop app)
    return 'https://www.instagram.com/';
  }

  generateFacebookShareUrl(video, caption) {
    const params = new URLSearchParams({
      'u': video.file_url || window.location.origin + video.file_path,
      'quote': caption || ''
    });
    
    return `https://www.facebook.com/sharer/sharer.php?${params.toString()}`;
  }

  generateLinkedInShareUrl(video, caption) {
    const params = new URLSearchParams({
      'url': video.file_url || window.location.origin + video.file_path,
      'title': video.title || 'Check out this video!',
      'summary': caption || '',
      'source': 'App Cloner Video Generator'
    });
    
    return `https://www.linkedin.com/sharing/share-offsite/?${params.toString()}`;
  }

  // Direct API sharing (requires proper OAuth setup)
  async shareToYouTubeAPI(video, metadata, accessToken) {
    // This requires proper OAuth 2.0 setup with YouTube API
    // For now, we'll return the manual sharing approach
    throw new Error('Direct YouTube API upload requires OAuth setup');
  }

  async shareToInstagramAPI(video, caption, accessToken) {
    // This requires Facebook Business API and Instagram Business Account
    throw new Error('Direct Instagram API upload requires Business API setup');
  }

  // Utility methods
  validateVideo(video, platform) {
    const platformConfig = this.platforms[platform];
    const errors = [];

    // Check file size
    if (video.size > platformConfig.maxFileSize) {
      errors.push(`File size exceeds ${platform} limit of ${this.formatFileSize(platformConfig.maxFileSize)}`);
    }

    // Check duration
    if (platformConfig.maxDuration && video.duration > platformConfig.maxDuration) {
      errors.push(`Duration exceeds ${platform} limit of ${platformConfig.maxDuration} seconds`);
    }

    // Check format
    const videoExtension = video.file_path?.split('.').pop()?.toLowerCase();
    if (videoExtension && !platformConfig.supportedFormats.includes(videoExtension)) {
      errors.push(`Format ${videoExtension} not supported by ${platform}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  async getSocialShareHistory(videoId) {
    await this.initializeDatabase();
    
    const sql = 'SELECT * FROM social_shares WHERE video_id = ? ORDER BY shared_at DESC';
    return await this.database.all(sql, [videoId]);
  }

  async getAllSocialShares(userId = 'default') {
    await this.initializeDatabase();
    
    const sql = `
      SELECT ss.*, v.title as video_title 
      FROM social_shares ss 
      JOIN videos v ON ss.video_id = v.id 
      WHERE v.user_id = ? 
      ORDER BY ss.shared_at DESC
    `;
    return await this.database.all(sql, [userId]);
  }

  // Generate shareable content suggestions
  generateSocialCopy(video, platform) {
    const platformSpecs = {
      youtube: {
        titleLimit: 100,
        descriptionLimit: 5000,
        hashtagSuggestions: ['#Shorts', '#AI', '#VideoCreation', '#Tech']
      },
      tiktok: {
        captionLimit: 150,
        hashtagSuggestions: ['#AI', '#VideoMaking', '#Tech', '#Creative', '#AppCloner']
      },
      instagram: {
        captionLimit: 2200,
        hashtagSuggestions: ['#Reels', '#AI', '#VideoCreation', '#TechTool', '#AppDev']
      },
      twitter: {
        textLimit: 280,
        hashtagSuggestions: ['#AI', '#VideoGen', '#Tech', '#AppCloner']
      },
      facebook: {
        textLimit: 63206,
        hashtagSuggestions: ['#VideoCreation', '#AI', '#Technology', '#AppCloner']
      },
      linkedin: {
        textLimit: 3000,
        hashtagSuggestions: ['#VideoMarketing', '#AI', '#TechTools', '#ContentCreation']
      }
    };

    const spec = platformSpecs[platform];
    if (!spec) return null;

    const baseText = video.description || video.title || 'Check out this amazing video!';
    const hashtags = spec.hashtagSuggestions.join(' ');
    
    let caption = `${baseText}\n\n${hashtags}`;
    
    // Truncate if necessary
    if (caption.length > spec.captionLimit || spec.textLimit) {
      const limit = spec.captionLimit || spec.textLimit;
      caption = caption.substring(0, limit - 3) + '...';
    }

    return {
      platform,
      caption,
      hashtags: spec.hashtagSuggestions,
      limits: spec
    };
  }
}

module.exports = { SocialShareService };