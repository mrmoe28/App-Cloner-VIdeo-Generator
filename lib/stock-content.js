const axios = require('axios');
const cheerio = require('cheerio');
const { DatabaseService } = require('./database');

class StockContentService {
  constructor() {
    this.database = null;
    this.providers = {
      unsplash: {
        name: 'Unsplash',
        baseUrl: 'https://api.unsplash.com',
        apiKey: process.env.UNSPLASH_ACCESS_KEY,
        type: 'image',
        rateLimit: 50 // requests per hour for free tier
      },
      pixabay: {
        name: 'Pixabay',
        baseUrl: 'https://pixabay.com/api',
        apiKey: process.env.PIXABAY_API_KEY,
        type: 'both', // images and videos
        rateLimit: 5000 // requests per hour
      },
      pexels: {
        name: 'Pexels',
        baseUrl: 'https://api.pexels.com/v1',
        apiKey: process.env.PEXELS_API_KEY,
        type: 'both',
        rateLimit: 200 // requests per hour for free tier
      },
      freesound: {
        name: 'Freesound',
        baseUrl: 'https://freesound.org/apiv2',
        apiKey: process.env.FREESOUND_API_KEY,
        type: 'audio',
        rateLimit: 60 // requests per minute
      }
    };
    
    // Rate limiting
    this.rateLimits = new Map();
    this.initializeDatabase();
  }

  async initializeDatabase() {
    if (!this.database) {
      this.database = new DatabaseService();
      await this.database.initialize();
    }
  }

  async search({ query, type = 'image', page = 1, limit = 20 }) {
    try {
      await this.initializeDatabase();

      // Check cache first
      const cached = await this.database.getCachedStockContent(query, type);
      if (cached.length > 0) {
        console.log(`📦 Returning ${cached.length} cached results for "${query}" (${type})`);
        return this.formatResults(cached);
      }

      // Search across multiple providers
      const results = await Promise.allSettled([
        this.searchUnsplash(query, page, limit),
        this.searchPixabay(query, type, page, limit),
        this.searchPexels(query, type, page, limit),
        type === 'audio' ? this.searchFreesound(query, page, limit) : Promise.resolve([])
      ]);

      // Combine results from all providers
      const allResults = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          allResults.push(...result.value);
        } else if (result.status === 'rejected') {
          console.warn(`Provider ${index} failed:`, result.reason?.message);
        }
      });

      // Cache results
      for (const item of allResults) {
        await this.database.cacheStockContent({
          ...item,
          query,
          type
        });
      }

      console.log(`🔍 Found ${allResults.length} new results for "${query}" (${type})`);
      return this.formatResults(allResults);

    } catch (error) {
      console.error('Stock content search error:', error);
      return { results: [], total: 0, error: error.message };
    }
  }

  async searchUnsplash(query, page = 1, limit = 20) {
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
          orientation: 'portrait' // For mobile video format
        }
      });

      return response.data.results.map(item => ({
        id: item.id,
        provider: 'unsplash',
        type: 'image',
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
      console.error('Unsplash API error:', error.response?.data || error.message);
      return [];
    }
  }

  async searchPixabay(query, type = 'image', page = 1, limit = 20) {
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
      
      return items.map(item => ({
        id: item.id.toString(),
        provider: 'pixabay',
        type: type,
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
      console.error('Pixabay API error:', error.response?.data || error.message);
      return [];
    }
  }

  async searchPexels(query, type = 'image', page = 1, limit = 20) {
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
      
      return items.map(item => ({
        id: item.id.toString(),
        provider: 'pexels',
        type: type,
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
      console.error('Pexels API error:', error.response?.data || error.message);
      return [];
    }
  }

  async searchFreesound(query, page = 1, limit = 20) {
    if (!this.providers.freesound.apiKey) {
      console.warn('Freesound API key not configured');
      return [];
    }

    if (!this.checkRateLimit('freesound')) {
      return [];
    }

    try {
      const response = await axios.get(`${this.providers.freesound.baseUrl}/search/text/`, {
        headers: {
          'Authorization': `Token ${this.providers.freesound.apiKey}`
        },
        params: {
          query,
          page,
          page_size: Math.min(limit, 150),
          filter: 'duration:[1.0 TO 30.0]', // 1-30 seconds for video use
          sort: 'score',
          fields: 'id,name,description,url,previews,download,filesize,duration,license'
        }
      });

      return response.data.results.map(item => ({
        id: item.id.toString(),
        provider: 'freesound',
        type: 'audio',
        url: item.previews['preview-lq-mp3'],
        thumbnailUrl: null,
        title: item.name,
        description: item.description || '',
        license: item.license,
        downloadUrl: item.download,
        duration: item.duration,
        filesize: item.filesize,
        previewUrl: item.previews['preview-hq-mp3']
      }));

    } catch (error) {
      console.error('Freesound API error:', error.response?.data || error.message);
      return [];
    }
  }

  async getTrending(type = 'image') {
    // Get trending content by searching for popular terms
    const trendingQueries = {
      image: ['technology', 'business', 'modern', 'creative', 'digital', 'startup'],
      video: ['motion graphics', 'abstract', 'technology', 'business', 'animation'],
      audio: ['corporate', 'upbeat', 'tech', 'modern', 'background music']
    };

    const queries = trendingQueries[type] || trendingQueries.image;
    const randomQuery = queries[Math.floor(Math.random() * queries.length)];
    
    return await this.search({
      query: randomQuery,
      type,
      page: 1,
      limit: 12
    });
  }

  checkRateLimit(provider) {
    const now = Date.now();
    const key = `${provider}_${Math.floor(now / (60 * 1000))}`; // per minute
    
    if (!this.rateLimits.has(key)) {
      this.rateLimits.set(key, 0);
    }
    
    const currentCount = this.rateLimits.get(key);
    const limit = this.providers[provider].rateLimit;
    
    if (currentCount >= limit) {
      console.warn(`Rate limit reached for ${provider}: ${currentCount}/${limit}`);
      return false;
    }
    
    this.rateLimits.set(key, currentCount + 1);
    return true;
  }

  formatResults(results) {
    // Group by provider and type
    const grouped = results.reduce((acc, item) => {
      const key = `${item.provider}_${item.type}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

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
          name: this.providers[provider]?.name || provider
        };
      })
    };
  }

  // Web scraping fallbacks for when APIs are not available
  async scrapeFreeImages(query) {
    try {
      console.log('🕷️ Scraping free images for:', query);
      
      // Scrape from free image sites
      const sources = [
        {
          name: 'Unsplash',
          url: `https://unsplash.com/s/photos/${encodeURIComponent(query)}`,
          selector: 'img[srcset]'
        }
      ];

      const results = [];
      
      for (const source of sources) {
        try {
          const response = await axios.get(source.url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; VideoGenerator/1.0)'
            },
            timeout: 5000
          });

          const $ = cheerio.load(response.data);
          
          $(source.selector).each((i, el) => {
            if (i >= 10) return false; // Limit results
            
            const src = $(el).attr('src') || $(el).attr('data-src');
            const alt = $(el).attr('alt') || '';
            
            if (src && src.includes('unsplash')) {
              results.push({
                id: `scraped_${Date.now()}_${i}`,
                provider: 'scraped_unsplash',
                type: 'image',
                url: src,
                thumbnailUrl: src,
                title: alt || `Free Image ${i + 1}`,
                description: alt,
                license: 'Unsplash License (verify usage)'
              });
            }
          });
        } catch (scrapeError) {
          console.warn(`Failed to scrape ${source.name}:`, scrapeError.message);
        }
      }

      return results;
    } catch (error) {
      console.error('Web scraping error:', error);
      return [];
    }
  }
}

module.exports = { StockContentService };