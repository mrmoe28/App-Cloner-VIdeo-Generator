const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');

class DatabaseService {
  constructor() {
    this.dbPath = path.join(__dirname, '..', 'data', 'videos.db');
    this.db = null;
  }

  async initialize() {
    try {
      // Ensure data directory exists
      await fs.ensureDir(path.dirname(this.dbPath));
      
      return new Promise((resolve, reject) => {
        this.db = new sqlite3.Database(this.dbPath, (err) => {
          if (err) {
            console.error('Error opening database:', err);
            reject(err);
          } else {
            console.log('✅ Database connected successfully');
            this.createTables().then(resolve).catch(reject);
          }
        });
      });
    } catch (error) {
      console.error('Database initialization error:', error);
      throw error;
    }
  }

  async createTables() {
    const tables = [
      // Users table
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        password_hash TEXT,
        api_key TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Videos table
      `CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY,
        user_id TEXT DEFAULT 'default',
        title TEXT NOT NULL,
        description TEXT,
        script TEXT,
        duration INTEGER,
        platform TEXT,
        status TEXT DEFAULT 'draft',
        file_path TEXT,
        file_url TEXT,
        thumbnail_url TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,

      // Uploaded files table
      `CREATE TABLE IF NOT EXISTS uploaded_files (
        id TEXT PRIMARY KEY,
        user_id TEXT DEFAULT 'default',
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_url TEXT,
        mimetype TEXT,
        size INTEGER,
        category TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,

      // Stock content cache
      `CREATE TABLE IF NOT EXISTS stock_content (
        id TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        type TEXT NOT NULL,
        provider TEXT NOT NULL,
        url TEXT NOT NULL,
        thumbnail_url TEXT,
        title TEXT,
        description TEXT,
        license TEXT,
        cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Social media shares
      `CREATE TABLE IF NOT EXISTS social_shares (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        share_url TEXT,
        post_id TEXT,
        caption TEXT,
        status TEXT DEFAULT 'pending',
        shared_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (video_id) REFERENCES videos (id)
      )`,

      // Video processing jobs
      `CREATE TABLE IF NOT EXISTS processing_jobs (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        status TEXT DEFAULT 'queued',
        progress INTEGER DEFAULT 0,
        error_message TEXT,
        started_at DATETIME,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (video_id) REFERENCES videos (id)
      )`
    ];

    for (const sql of tables) {
      await this.run(sql);
    }

    console.log('✅ Database tables created successfully');
  }

  // Helper method to run SQL commands
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          console.error('SQL Error:', err, '\nQuery:', sql);
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  // Helper method to get single row
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          console.error('SQL Error:', err, '\nQuery:', sql);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Helper method to get all rows
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          console.error('SQL Error:', err, '\nQuery:', sql);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // User API Key Management
  async storeUserApiKey(userId, encryptedKey) {
    const sql = `INSERT OR REPLACE INTO users (id, api_key, updated_at) 
                 VALUES (?, ?, CURRENT_TIMESTAMP)`;
    return await this.run(sql, [userId, JSON.stringify(encryptedKey)]);
  }

  async getUserApiKey(userId) {
    const sql = 'SELECT api_key FROM users WHERE id = ?';
    const result = await this.get(sql, [userId]);
    
    if (result?.api_key) {
      try {
        return JSON.parse(result.api_key);
      } catch {
        return result.api_key;
      }
    }
    return null;
  }

  // Video Project Management  
  async saveVideoProject(projectData) {
    const sql = `INSERT OR REPLACE INTO videos 
                 (id, user_id, title, description, script, duration, platform, status, 
                  file_path, file_url, metadata, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;
    
    const params = [
      projectData.id,
      projectData.userId || 'default',
      projectData.title,
      projectData.description,
      typeof projectData.script === 'object' ? JSON.stringify(projectData.script) : projectData.script,
      projectData.duration,
      projectData.platform,
      projectData.status || 'completed',
      projectData.videoPath,
      projectData.videoUrl,
      JSON.stringify({
        timeline: projectData.timeline,
        options: projectData.options,
        createdAt: projectData.createdAt
      })
    ];
    
    await this.run(sql, params);
    return { ...projectData, id: projectData.id };
  }

  async getSavedVideos(limit = 50, offset = 0) {
    const sql = `SELECT * FROM videos 
                 WHERE status = 'completed' 
                 ORDER BY created_at DESC 
                 LIMIT ? OFFSET ?`;
    
    const rows = await this.all(sql, [limit, offset]);
    
    return rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      duration: row.duration,
      platform: row.platform,
      videoUrl: row.file_url,
      thumbnailUrl: row.thumbnail_url,
      createdAt: row.created_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : null
    }));
  }

  async getVideoProject(videoId) {
    const sql = 'SELECT * FROM videos WHERE id = ?';
    const row = await this.get(sql, [videoId]);
    
    if (!row) return null;
    
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      script: row.script ? JSON.parse(row.script) : null,
      duration: row.duration,
      platform: row.platform,
      status: row.status,
      videoPath: row.file_path,
      videoUrl: row.file_url,
      createdAt: row.created_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : null
    };
  }

  async deleteVideoProject(videoId) {
    const sql = 'DELETE FROM videos WHERE id = ?';
    const result = await this.run(sql, [videoId]);
    return result.changes > 0;
  }

  async updateVideoStatus(videoId, status, progress = null) {
    const sql = `UPDATE videos 
                 SET status = ?, updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`;
    await this.run(sql, [status, videoId]);
  }

  // Video Management (legacy compatibility)
  async saveVideo(videoData) {
    const id = videoData.id || require('crypto').randomUUID();
    const sql = `INSERT OR REPLACE INTO videos 
                 (id, user_id, title, description, script, duration, platform, status, 
                  file_path, file_url, thumbnail_url, metadata, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;
    
    const params = [
      id,
      videoData.userId || 'default',
      videoData.title || 'Untitled Video',
      videoData.description || '',
      JSON.stringify(videoData.script || {}),
      videoData.duration || 60,
      videoData.platform || 'general',
      videoData.status || 'draft',
      videoData.filePath || null,
      videoData.fileUrl || null,
      videoData.thumbnailUrl || null,
      JSON.stringify(videoData.metadata || {})
    ];

    await this.run(sql, params);
    return id;
  }

  async getUserVideos({ userId = 'default', page = 1, limit = 10 }) {
    const offset = (page - 1) * limit;
    const sql = `SELECT * FROM videos 
                 WHERE user_id = ? 
                 ORDER BY created_at DESC 
                 LIMIT ? OFFSET ?`;
    
    const videos = await this.all(sql, [userId, limit, offset]);
    
    // Parse JSON fields
    return videos.map(video => ({
      ...video,
      script: this.parseJSON(video.script),
      metadata: this.parseJSON(video.metadata)
    }));
  }

  async getVideo(videoId) {
    const sql = 'SELECT * FROM videos WHERE id = ?';
    const video = await this.get(sql, [videoId]);
    
    if (video) {
      video.script = this.parseJSON(video.script);
      video.metadata = this.parseJSON(video.metadata);
    }
    
    return video;
  }

  // File Management
  async storeUploadedFile(fileData) {
    const id = require('crypto').randomUUID();
    const sql = `INSERT INTO uploaded_files 
                 (id, user_id, filename, original_name, file_path, file_url, mimetype, size, category)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const params = [
      id,
      fileData.userId || 'default',
      fileData.filename,
      fileData.originalname,
      fileData.path,
      fileData.url || `/uploads/${fileData.filename}`,
      fileData.mimetype,
      fileData.size,
      this.categorizeFile(fileData.mimetype)
    ];

    await this.run(sql, params);
    return id;
  }

  async getUserFiles(userId = 'default', category = null) {
    let sql = 'SELECT * FROM uploaded_files WHERE user_id = ?';
    const params = [userId];
    
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    return await this.all(sql, params);
  }

  // Stock Content Caching
  async cacheStockContent(content) {
    const id = require('crypto').randomUUID();
    const sql = `INSERT OR REPLACE INTO stock_content 
                 (id, query, type, provider, url, thumbnail_url, title, description, license)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const params = [
      id,
      content.query,
      content.type,
      content.provider,
      content.url,
      content.thumbnailUrl,
      content.title,
      content.description,
      content.license
    ];

    await this.run(sql, params);
    return id;
  }

  async getCachedStockContent(query, type) {
    const sql = `SELECT * FROM stock_content 
                 WHERE query = ? AND type = ? 
                 AND cached_at > datetime('now', '-1 hour')
                 ORDER BY cached_at DESC`;
    
    return await this.all(sql, [query, type]);
  }

  // Social Media Shares
  async recordSocialShare(shareData) {
    const id = require('crypto').randomUUID();
    const sql = `INSERT INTO social_shares 
                 (id, video_id, platform, share_url, post_id, caption, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
    
    const params = [
      id,
      shareData.videoId,
      shareData.platform,
      shareData.shareUrl || null,
      shareData.postId || null,
      shareData.caption || '',
      shareData.status || 'pending'
    ];

    await this.run(sql, params);
    return id;
  }

  // Processing Jobs
  async createProcessingJob(videoId) {
    const id = require('crypto').randomUUID();
    const sql = `INSERT INTO processing_jobs (id, video_id, status, started_at)
                 VALUES (?, ?, 'processing', CURRENT_TIMESTAMP)`;
    
    await this.run(sql, [id, videoId]);
    return id;
  }

  async updateProcessingJob(jobId, updates) {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    
    const sql = `UPDATE processing_jobs SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    return await this.run(sql, [...values, jobId]);
  }

  async getProcessingJob(jobId) {
    const sql = 'SELECT * FROM processing_jobs WHERE id = ?';
    return await this.get(sql, [jobId]);
  }

  // Utility methods
  parseJSON(jsonString) {
    if (!jsonString) return {};
    try {
      return JSON.parse(jsonString);
    } catch {
      return {};
    }
  }

  categorizeFile(mimetype) {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'audio';
    return 'other';
  }

  async close() {
    if (this.db) {
      return new Promise((resolve) => {
        this.db.close((err) => {
          if (err) console.error('Error closing database:', err);
          else console.log('Database connection closed');
          resolve();
        });
      });
    }
  }
}

module.exports = { DatabaseService };