import { Tool } from '@modelcontextprotocol/sdk/types.js';
import sqlite3 from 'sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { StockMediaItem, LibraryItem } from '../types/index.js';
import path from 'path';

export class LibraryManagerTool {
  private db: sqlite3.Database;
  private dbPath: string;

  constructor() {
    // Use relative path from project root
    this.dbPath = path.join(process.cwd(), '..', 'data', 'media-library.db');
    this.db = new sqlite3.Database(this.dbPath);
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS media_library (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        type TEXT NOT NULL,
        url TEXT NOT NULL,
        thumbnail_url TEXT,
        title TEXT NOT NULL,
        description TEXT,
        license TEXT NOT NULL,
        download_url TEXT NOT NULL,
        author TEXT,
        author_url TEXT,
        width INTEGER,
        height INTEGER,
        duration REAL,
        views INTEGER,
        downloads INTEGER,
        avg_color TEXT,
        filesize INTEGER,
        preview_url TEXT,
        added_at TEXT NOT NULL,
        tags TEXT,
        category TEXT,
        notes TEXT
      )
    `;

    const createIndexQuery = `
      CREATE INDEX IF NOT EXISTS idx_media_type ON media_library(type);
      CREATE INDEX IF NOT EXISTS idx_media_provider ON media_library(provider);
      CREATE INDEX IF NOT EXISTS idx_media_category ON media_library(category);
      CREATE INDEX IF NOT EXISTS idx_media_added_at ON media_library(added_at);
    `;

    this.db.serialize(() => {
      this.db.run(createTableQuery);
      this.db.exec(createIndexQuery);
    });
  }

  getTools(): Tool[] {
    return [
      {
        name: 'add_to_media_library',
        description: 'Add a stock media item to the personal media library',
        inputSchema: {
          type: 'object',
          properties: {
            mediaItem: {
              type: 'object',
              description: 'Stock media item to add to library',
              properties: {
                id: { type: 'string' },
                provider: { type: 'string' },
                type: { type: 'string' },
                url: { type: 'string' },
                thumbnailUrl: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                license: { type: 'string' },
                downloadUrl: { type: 'string' },
                author: { type: 'string' },
                authorUrl: { type: 'string' },
                width: { type: 'number' },
                height: { type: 'number' },
                duration: { type: 'number' },
                views: { type: 'number' },
                downloads: { type: 'number' },
                avgColor: { type: 'string' },
                filesize: { type: 'number' },
                previewUrl: { type: 'string' }
              },
              required: ['id', 'provider', 'type', 'url', 'title', 'license', 'downloadUrl']
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags to categorize the media item'
            },
            category: {
              type: 'string',
              description: 'Category for the media item',
              enum: ['promotional', 'background', 'logo', 'social-media', 'presentation', 'other']
            },
            notes: {
              type: 'string',
              description: 'Personal notes about the media item'
            }
          },
          required: ['mediaItem']
        }
      },
      {
        name: 'get_library_media',
        description: 'Retrieve media items from the personal library with filtering options',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['image', 'video', 'audio'],
              description: 'Filter by media type'
            },
            category: {
              type: 'string',
              enum: ['promotional', 'background', 'logo', 'social-media', 'presentation', 'other'],
              description: 'Filter by category'
            },
            provider: {
              type: 'string',
              enum: ['unsplash', 'pixabay', 'pexels', 'freesound'],
              description: 'Filter by provider'
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by tags (AND operation)'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
              default: 50
            },
            offset: {
              type: 'number',
              description: 'Offset for pagination',
              default: 0
            }
          }
        }
      },
      {
        name: 'remove_from_library',
        description: 'Remove a media item from the personal library',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID of the media item to remove'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'update_library_item',
        description: 'Update tags, category, or notes for a library item',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID of the media item to update'
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Updated tags for the item'
            },
            category: {
              type: 'string',
              enum: ['promotional', 'background', 'logo', 'social-media', 'presentation', 'other'],
              description: 'Updated category'
            },
            notes: {
              type: 'string',
              description: 'Updated notes'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'get_library_stats',
        description: 'Get statistics about the media library',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ];
  }

  async addToLibrary(mediaItem: StockMediaItem, tags: string[] = [], category: string = 'other', notes?: string): Promise<LibraryItem> {
    return new Promise((resolve, reject) => {
      const libraryId = uuidv4();
      const addedAt = new Date().toISOString();
      const tagsJson = JSON.stringify(tags);

      const query = `
        INSERT INTO media_library (
          id, provider, type, url, thumbnail_url, title, description, license,
          download_url, author, author_url, width, height, duration, views,
          downloads, avg_color, filesize, preview_url, added_at, tags, category, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        libraryId, mediaItem.provider, mediaItem.type, mediaItem.url, mediaItem.thumbnailUrl,
        mediaItem.title, mediaItem.description, mediaItem.license, mediaItem.downloadUrl,
        mediaItem.author, mediaItem.authorUrl, mediaItem.width, mediaItem.height,
        mediaItem.duration, mediaItem.views, mediaItem.downloads, mediaItem.avgColor,
        mediaItem.filesize, mediaItem.previewUrl, addedAt, tagsJson, category, notes
      ];

      this.db.run(query, params, function(err) {
        if (err) {
          reject(err);
        } else {
          const libraryItem: LibraryItem = {
            ...mediaItem,
            id: libraryId,
            addedAt,
            tags,
            category,
            notes
          };
          resolve(libraryItem);
        }
      });
    });
  }

  async getLibraryMedia(filters: {
    type?: string;
    category?: string;
    provider?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
  } = {}): Promise<LibraryItem[]> {
    return new Promise((resolve, reject) => {
      const { type, category, provider, tags, limit = 50, offset = 0 } = filters;
      
      let query = 'SELECT * FROM media_library WHERE 1=1';
      const params: any[] = [];

      if (type) {
        query += ' AND type = ?';
        params.push(type);
      }

      if (category) {
        query += ' AND category = ?';
        params.push(category);
      }

      if (provider) {
        query += ' AND provider = ?';
        params.push(provider);
      }

      if (tags && tags.length > 0) {
        // Check if all tags are present in the tags JSON array
        for (const tag of tags) {
          query += ' AND tags LIKE ?';
          params.push(`%"${tag}"%`);
        }
      }

      query += ' ORDER BY added_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      this.db.all(query, params, (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          const items: LibraryItem[] = rows.map(row => ({
            id: row.id,
            provider: row.provider,
            type: row.type,
            url: row.url,
            thumbnailUrl: row.thumbnail_url,
            title: row.title,
            description: row.description,
            license: row.license,
            downloadUrl: row.download_url,
            author: row.author,
            authorUrl: row.author_url,
            width: row.width,
            height: row.height,
            duration: row.duration,
            views: row.views,
            downloads: row.downloads,
            avgColor: row.avg_color,
            filesize: row.filesize,
            previewUrl: row.preview_url,
            addedAt: row.added_at,
            tags: JSON.parse(row.tags || '[]'),
            category: row.category,
            notes: row.notes
          }));
          resolve(items);
        }
      });
    });
  }

  async removeFromLibrary(id: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM media_library WHERE id = ?', [id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  }

  async updateLibraryItem(id: string, updates: {
    tags?: string[];
    category?: string;
    notes?: string;
  }): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const fields: string[] = [];
      const params: any[] = [];

      if (updates.tags !== undefined) {
        fields.push('tags = ?');
        params.push(JSON.stringify(updates.tags));
      }

      if (updates.category !== undefined) {
        fields.push('category = ?');
        params.push(updates.category);
      }

      if (updates.notes !== undefined) {
        fields.push('notes = ?');
        params.push(updates.notes);
      }

      if (fields.length === 0) {
        resolve(false);
        return;
      }

      params.push(id);
      const query = `UPDATE media_library SET ${fields.join(', ')} WHERE id = ?`;

      this.db.run(query, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  }

  async getLibraryStats(): Promise<{
    total: number;
    byType: Record<string, number>;
    byProvider: Record<string, number>;
    byCategory: Record<string, number>;
  }> {
    return new Promise((resolve, reject) => {
      const queries = [
        'SELECT COUNT(*) as total FROM media_library',
        'SELECT type, COUNT(*) as count FROM media_library GROUP BY type',
        'SELECT provider, COUNT(*) as count FROM media_library GROUP BY provider',
        'SELECT category, COUNT(*) as count FROM media_library GROUP BY category'
      ];

      let completed = 0;
      const results: any = {
        total: 0,
        byType: {},
        byProvider: {},
        byCategory: {}
      };

      // Get total count
      this.db.get(queries[0], (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }
        results.total = row.total;
        completed++;
        if (completed === 4) resolve(results);
      });

      // Get counts by type
      this.db.all(queries[1], (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        rows.forEach(row => {
          results.byType[row.type] = row.count;
        });
        completed++;
        if (completed === 4) resolve(results);
      });

      // Get counts by provider
      this.db.all(queries[2], (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        rows.forEach(row => {
          results.byProvider[row.provider] = row.count;
        });
        completed++;
        if (completed === 4) resolve(results);
      });

      // Get counts by category
      this.db.all(queries[3], (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        rows.forEach(row => {
          results.byCategory[row.category] = row.count;
        });
        completed++;
        if (completed === 4) resolve(results);
      });
    });
  }
}