import { Tool } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import { SearchParams, SearchResult, StockMediaItem } from '../types/index.js';

export class StockSearchTool {
  private providers = {
    unsplash: {
      name: 'Unsplash',
      baseUrl: 'https://api.unsplash.com',
      apiKey: process.env.UNSPLASH_ACCESS_KEY,
      type: 'image' as const,
      rateLimit: 50
    },
    pixabay: {
      name: 'Pixabay', 
      baseUrl: 'https://pixabay.com/api',
      apiKey: process.env.PIXABAY_API_KEY,
      type: 'both' as const,
      rateLimit: 5000
    },
    pexels: {
      name: 'Pexels',
      baseUrl: 'https://api.pexels.com/v1',
      apiKey: process.env.PEXELS_API_KEY,
      type: 'both' as const,
      rateLimit: 200
    }
  };

  private rateLimits = new Map<string, number>();

  getTools(): Tool[] {
    return [
      {
        name: 'search_stock_media',
        description: 'Search for stock images, videos, and audio across multiple providers (Unsplash, Pixabay, Pexels)',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for finding stock media'
            },
            type: {
              type: 'string',
              enum: ['image', 'video', 'audio'],
              description: 'Type of media to search for',
              default: 'image'
            },
            page: {
              type: 'number',
              description: 'Page number for pagination',
              default: 1
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results per provider',
              default: 20
            },
            orientation: {
              type: 'string',
              enum: ['portrait', 'landscape', 'square'],
              description: 'Preferred orientation for images/videos'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'get_trending_stock_media',
        description: 'Get trending stock media content by category',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['image', 'video', 'audio'],
              description: 'Type of media to get trending content for',
              default: 'image'
            },
            category: {
              type: 'string',
              enum: ['technology', 'business', 'creative', 'modern', 'digital', 'startup'],
              description: 'Category for trending content'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
              default: 12
            }
          }
        }
      }
    ];
  }

  async searchStockMedia(params: SearchParams): Promise<SearchResult> {
    const { query, type = 'image', page = 1, limit = 20 } = params;

    try {
      // Search across multiple providers
      const results = await Promise.allSettled([
        this.searchUnsplash(query, page, limit),
        this.searchPixabay(query, type, page, limit),
        this.searchPexels(query, type, page, limit)
      ]);

      // Combine results from all providers
      const allResults: StockMediaItem[] = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          allResults.push(...result.value);
        } else if (result.status === 'rejected') {
          console.warn(`Provider ${index} failed:`, result.reason?.message);
        }
      });

      return this.formatResults(allResults);
    } catch (error) {
      console.error('Stock media search error:', error);
      throw error;
    }
  }

  async getTrendingMedia(type: 'image' | 'video' | 'audio' = 'image'): Promise<SearchResult> {
    const trendingQueries = {
      image: ['technology', 'business', 'modern', 'creative', 'digital', 'startup'],
      video: ['motion graphics', 'abstract', 'technology', 'business', 'animation'],
      audio: ['corporate', 'upbeat', 'tech', 'modern', 'background music']
    };

    const queries = trendingQueries[type] || trendingQueries.image;
    const randomQuery = queries[Math.floor(Math.random() * queries.length)];
    
    return await this.searchStockMedia({
      query: randomQuery,
      type,
      page: 1,
      limit: 12
    });
  }

  private async searchUnsplash(query: string, page: number, limit: number): Promise<StockMediaItem[]> {
    if (!this.providers.unsplash.apiKey) {
      console.warn('Unsplash API key not configured');
      return [];
    }

    if (!this.checkRateLimit('unsplash')) {
      return [];
    }

    try {
      const response = await axios.get(`${this.providers.unsplash.baseUrl}/search/photos`, {
        headers: {
          'Authorization': `Client-ID ${this.providers.unsplash.apiKey}`
        },
        params: {
          query,
          page,
          per_page: Math.min(limit, 30),
          orientation: 'portrait'
        }
      });

      return response.data.results.map((item: any) => ({
        id: item.id,
        provider: 'unsplash' as const,
        type: 'image' as const,
        url: item.urls.regular,
        thumbnailUrl: item.urls.thumb,
        title: item.alt_description || item.description || `Unsplash Image ${item.id}`,
        description: item.alt_description || item.description || '',
        license: 'Unsplash License',
        downloadUrl: item.urls.full,
        author: item.user.name,
        authorUrl: item.user.links.html,
        width: item.width,
        height: item.height
      }));
    } catch (error) {
      console.error('Unsplash API error:', error);
      return [];
    }
  }

  private async searchPixabay(query: string, type: string, page: number, limit: number): Promise<StockMediaItem[]> {
    if (!this.providers.pixabay.apiKey) {
      console.warn('Pixabay API key not configured');
      return [];
    }

    if (!this.checkRateLimit('pixabay')) {
      return [];
    }

    try {
      const endpoint = type === 'video' ? '/videos' : '';
      const response = await axios.get(`${this.providers.pixabay.baseUrl}${endpoint}/`, {
        params: {
          key: this.providers.pixabay.apiKey,
          q: query,
          page,
          per_page: Math.min(limit, 200),
          category: 'business,computer,education,industry',
          orientation: 'vertical',
          min_width: 720,
          min_height: 1080
        }
      });

      const items = response.data.hits || [];
      
      return items.map((item: any) => ({
        id: item.id.toString(),
        provider: 'pixabay' as const,
        type: type as 'image' | 'video',
        url: type === 'video' ? item.videos.medium.url : item.webformatURL,
        thumbnailUrl: type === 'video' ? item.picture_id : item.webformatURL,
        title: item.tags || `Pixabay ${type} ${item.id}`,
        description: item.tags || '',
        license: 'Pixabay License',
        downloadUrl: type === 'video' ? item.videos.large.url : item.largeImageURL,
        author: item.user,
        width: item.imageWidth || item.videos?.medium.width,
        height: item.imageHeight || item.videos?.medium.height,
        duration: item.duration,
        views: item.views,
        downloads: item.downloads
      }));
    } catch (error) {
      console.error('Pixabay API error:', error);
      return [];
    }
  }

  private async searchPexels(query: string, type: string, page: number, limit: number): Promise<StockMediaItem[]> {
    if (!this.providers.pexels.apiKey) {
      console.warn('Pexels API key not configured');
      return [];
    }

    if (!this.checkRateLimit('pexels')) {
      return [];
    }

    try {
      const endpoint = type === 'video' ? '/videos/search' : '/search';
      const response = await axios.get(`${this.providers.pexels.baseUrl}${endpoint}`, {
        headers: {
          'Authorization': this.providers.pexels.apiKey
        },
        params: {
          query,
          page,
          per_page: Math.min(limit, 80),
          orientation: 'portrait',
          size: type === 'image' ? 'large' : undefined
        }
      });

      const items = type === 'video' ? response.data.videos : response.data.photos;
      
      return items.map((item: any) => ({
        id: item.id.toString(),
        provider: 'pexels' as const,
        type: type as 'image' | 'video',
        url: type === 'video' ? item.video_files[0].link : item.src.large,
        thumbnailUrl: type === 'video' ? item.image : item.src.medium,
        title: item.alt || `Pexels ${type} ${item.id}`,
        description: item.alt || '',
        license: 'Pexels License',
        downloadUrl: type === 'video' ? item.video_files[0].link : item.src.original,
        author: item.photographer || item.user?.name,
        authorUrl: item.photographer_url || item.user?.url,
        width: item.width,
        height: item.height,
        duration: item.duration,
        avgColor: item.avg_color
      }));
    } catch (error) {
      console.error('Pexels API error:', error);
      return [];
    }
  }

  private checkRateLimit(provider: keyof typeof this.providers): boolean {
    const now = Date.now();
    const key = `${provider}_${Math.floor(now / (60 * 1000))}`; // per minute
    
    if (!this.rateLimits.has(key)) {
      this.rateLimits.set(key, 0);
    }
    
    const currentCount = this.rateLimits.get(key) || 0;
    const limit = this.providers[provider].rateLimit;
    
    if (currentCount >= limit) {
      console.warn(`Rate limit reached for ${provider}: ${currentCount}/${limit}`);
      return false;
    }
    
    this.rateLimits.set(key, currentCount + 1);
    return true;
  }

  private formatResults(results: StockMediaItem[]): SearchResult {
    // Group by provider and type
    const grouped = results.reduce((acc, item) => {
      const key = `${item.provider}_${item.type}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {} as Record<string, StockMediaItem[]>);

    return {
      results: results,
      total: results.length,
      grouped: grouped,
      providers: Object.keys(grouped).map(key => {
        const [provider, type] = key.split('_');
        return {
          provider,
          type,
          count: grouped[key].length,
          name: this.providers[provider as keyof typeof this.providers]?.name || provider
        };
      })
    };
  }
}