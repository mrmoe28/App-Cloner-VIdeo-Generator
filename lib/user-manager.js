const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { DatabaseService } = require('./database');
const { EncryptionService } = require('./encryption');
const logger = require('./logger');
const crypto = require('crypto');

class UserManager {
  constructor() {
    this.database = null;
    this.encryption = new EncryptionService();
    this.sessions = new Map();
    this.initializeDatabase();
  }

  async initializeDatabase() {
    if (!this.database) {
      this.database = new DatabaseService();
      await this.database.initialize();
      await this.createUserTables();
    }
  }

  async createUserTables() {
    // Users table
    await this.database.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        status TEXT DEFAULT 'active',
        api_key TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        preferences TEXT,
        quota_limits TEXT,
        metadata TEXT
      )
    `);

    // User sessions table
    await this.database.run(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        device_info TEXT,
        ip_address TEXT,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // User activity log
    await this.database.run(`
      CREATE TABLE IF NOT EXISTS user_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource TEXT,
        resource_id TEXT,
        details TEXT,
        ip_address TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // User quotas
    await this.database.run(`
      CREATE TABLE IF NOT EXISTS user_quotas (
        user_id TEXT PRIMARY KEY,
        videos_created INTEGER DEFAULT 0,
        videos_limit INTEGER DEFAULT 100,
        storage_used INTEGER DEFAULT 0,
        storage_limit INTEGER DEFAULT 5368709120,
        api_calls INTEGER DEFAULT 0,
        api_calls_limit INTEGER DEFAULT 10000,
        reset_date DATETIME,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    await logger.info('User management tables initialized');
  }

  // Create new user
  async createUser({ username, email, password, role = 'user' }) {
    await this.initializeDatabase();

    try {
      // Validate input
      if (!username || !email || !password) {
        throw new Error('Username, email, and password are required');
      }

      // Check if user exists
      const existingUser = await this.database.get(
        'SELECT id FROM users WHERE username = ? OR email = ?',
        [username, email]
      );

      if (existingUser) {
        throw new Error('Username or email already exists');
      }

      // Generate user ID and API key
      const userId = crypto.randomBytes(16).toString('hex');
      const apiKey = `sk_${crypto.randomBytes(32).toString('hex')}`;

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user
      await this.database.run(
        `INSERT INTO users (id, username, email, password_hash, role, api_key) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, username, email, passwordHash, role, apiKey]
      );

      // Initialize user quotas
      await this.database.run(
        'INSERT INTO user_quotas (user_id) VALUES (?)',
        [userId]
      );

      // Log activity
      await this.logActivity(userId, 'user_created', 'user', userId);

      await logger.info('User created', { userId, username, email, role });

      return {
        id: userId,
        username,
        email,
        role,
        apiKey
      };
    } catch (error) {
      await logger.error('Failed to create user', error, { username, email });
      throw error;
    }
  }

  // Authenticate user
  async authenticateUser(username, password) {
    await this.initializeDatabase();

    try {
      // Get user by username or email
      const user = await this.database.get(
        'SELECT * FROM users WHERE (username = ? OR email = ?) AND status = \'active\'',
        [username, username]
      );

      if (!user) {
        throw new Error('Invalid credentials');
      }

      // Verify password
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        throw new Error('Invalid credentials');
      }

      // Update last login
      await this.database.run(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
        [user.id]
      );

      // Create session
      const session = await this.createSession(user.id);

      // Log activity
      await this.logActivity(user.id, 'login', 'session', session.id);

      await logger.info('User authenticated', { userId: user.id, username: user.username });

      return {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          apiKey: user.api_key
        },
        session
      };
    } catch (error) {
      await logger.error('Authentication failed', error, { username });
      throw error;
    }
  }

  // Create user session
  async createSession(userId, deviceInfo = null, ipAddress = null) {
    const sessionId = crypto.randomBytes(16).toString('hex');
    const token = jwt.sign(
      { userId, sessionId },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.database.run(
      `INSERT INTO user_sessions (id, user_id, token, device_info, ip_address, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [sessionId, userId, token, deviceInfo, ipAddress, expiresAt.toISOString()]
    );

    // Cache session
    this.sessions.set(token, {
      userId,
      sessionId,
      expiresAt
    });

    return {
      id: sessionId,
      token,
      expiresAt
    };
  }

  // Validate session token
  async validateSession(token) {
    // Check cache first
    const cached = this.sessions.get(token);
    if (cached && new Date(cached.expiresAt) > new Date()) {
      return cached;
    }

    try {
      // Verify JWT
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

      // Check database
      const session = await this.database.get(
        `SELECT s.*, u.username, u.email, u.role, u.status 
         FROM user_sessions s 
         JOIN users u ON s.user_id = u.id 
         WHERE s.token = ? AND s.expires_at > datetime('now')`,
        [token]
      );

      if (!session || session.status !== 'active') {
        return null;
      }

      // Update cache
      this.sessions.set(token, {
        userId: session.user_id,
        sessionId: session.id,
        expiresAt: session.expires_at,
        user: {
          username: session.username,
          email: session.email,
          role: session.role
        }
      });

      return this.sessions.get(token);
    } catch (error) {
      await logger.warn('Invalid session token', { error: error.message });
      return null;
    }
  }

  // Get user by ID
  async getUser(userId) {
    await this.initializeDatabase();

    const user = await this.database.get(
      `SELECT u.*, q.* 
       FROM users u 
       LEFT JOIN user_quotas q ON u.id = q.user_id 
       WHERE u.id = ?`,
      [userId]
    );

    if (!user) return null;

    // Parse JSON fields
    if (user.preferences) {
      try {
        user.preferences = JSON.parse(user.preferences);
      } catch {}
    }

    if (user.quota_limits) {
      try {
        user.quota_limits = JSON.parse(user.quota_limits);
      } catch {}
    }

    // Don't return password hash
    delete user.password_hash;

    return user;
  }

  // Update user preferences
  async updateUserPreferences(userId, preferences) {
    await this.initializeDatabase();

    try {
      await this.database.run(
        'UPDATE users SET preferences = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [JSON.stringify(preferences), userId]
      );

      await this.logActivity(userId, 'preferences_updated', 'user', userId);
      
      return true;
    } catch (error) {
      await logger.error('Failed to update preferences', error, { userId });
      throw error;
    }
  }

  // Check and update user quotas
  async checkQuota(userId, resource = 'videos') {
    await this.initializeDatabase();

    const quotas = await this.database.get(
      'SELECT * FROM user_quotas WHERE user_id = ?',
      [userId]
    );

    if (!quotas) {
      // Initialize quotas if not exist
      await this.database.run(
        'INSERT INTO user_quotas (user_id) VALUES (?)',
        [userId]
      );
      return { allowed: true, remaining: 100 };
    }

    // Check if quotas need reset (monthly)
    const resetDate = quotas.reset_date ? new Date(quotas.reset_date) : null;
    const now = new Date();
    
    if (!resetDate || resetDate < now) {
      // Reset monthly quotas
      const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      await this.database.run(
        `UPDATE user_quotas 
         SET videos_created = 0, api_calls = 0, reset_date = ? 
         WHERE user_id = ?`,
        [nextReset.toISOString(), userId]
      );
      
      quotas.videos_created = 0;
      quotas.api_calls = 0;
    }

    // Check specific resource
    switch (resource) {
    case 'videos':
      return {
        allowed: quotas.videos_created < quotas.videos_limit,
        used: quotas.videos_created,
        limit: quotas.videos_limit,
        remaining: quotas.videos_limit - quotas.videos_created
      };
      
    case 'storage':
      return {
        allowed: quotas.storage_used < quotas.storage_limit,
        used: quotas.storage_used,
        limit: quotas.storage_limit,
        remaining: quotas.storage_limit - quotas.storage_used
      };
      
    case 'api':
      return {
        allowed: quotas.api_calls < quotas.api_calls_limit,
        used: quotas.api_calls,
        limit: quotas.api_calls_limit,
        remaining: quotas.api_calls_limit - quotas.api_calls
      };
      
    default:
      return { allowed: true };
    }
  }

  // Update quota usage
  async updateQuota(userId, resource, amount = 1) {
    await this.initializeDatabase();

    const updates = {
      videos: 'videos_created = videos_created + ?',
      storage: 'storage_used = storage_used + ?',
      api: 'api_calls = api_calls + ?'
    };

    if (updates[resource]) {
      await this.database.run(
        `UPDATE user_quotas SET ${updates[resource]} WHERE user_id = ?`,
        [amount, userId]
      );
    }
  }

  // Log user activity
  async logActivity(userId, action, resource = null, resourceId = null, details = null, ipAddress = null) {
    await this.initializeDatabase();

    await this.database.run(
      `INSERT INTO user_activity (user_id, action, resource, resource_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, action, resource, resourceId, details ? JSON.stringify(details) : null, ipAddress]
    );
  }

  // Get user activity
  async getUserActivity(userId, limit = 50) {
    await this.initializeDatabase();

    return await this.database.all(
      `SELECT * FROM user_activity 
       WHERE user_id = ? 
       ORDER BY timestamp DESC 
       LIMIT ?`,
      [userId, limit]
    );
  }

  // Delete user session
  async deleteSession(token) {
    await this.database.run(
      'DELETE FROM user_sessions WHERE token = ?',
      [token]
    );
    
    this.sessions.delete(token);
  }

  // Clean expired sessions
  async cleanExpiredSessions() {
    const deleted = await this.database.run(
      'DELETE FROM user_sessions WHERE expires_at < datetime(\'now\')'
    );

    // Clean cache
    for (const [token, session] of this.sessions.entries()) {
      if (new Date(session.expiresAt) < new Date()) {
        this.sessions.delete(token);
      }
    }

    if (deleted.changes > 0) {
      await logger.info('Cleaned expired sessions', { count: deleted.changes });
    }

    return deleted.changes;
  }

  // Change user password
  async changePassword(userId, oldPassword, newPassword) {
    await this.initializeDatabase();

    try {
      const user = await this.database.get(
        'SELECT password_hash FROM users WHERE id = ?',
        [userId]
      );

      if (!user) {
        throw new Error('User not found');
      }

      // Verify old password
      const isValid = await bcrypt.compare(oldPassword, user.password_hash);
      if (!isValid) {
        throw new Error('Invalid old password');
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      // Update password
      await this.database.run(
        'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newPasswordHash, userId]
      );

      // Invalidate all sessions for security
      await this.database.run(
        'DELETE FROM user_sessions WHERE user_id = ?',
        [userId]
      );

      await this.logActivity(userId, 'password_changed', 'user', userId);
      await logger.info('Password changed', { userId });

      return true;
    } catch (error) {
      await logger.error('Failed to change password', error, { userId });
      throw error;
    }
  }

  // Get user statistics
  async getUserStatistics(userId) {
    await this.initializeDatabase();

    const stats = {
      videos: await this.database.get(
        'SELECT COUNT(*) as count FROM videos WHERE user_id = ?',
        [userId]
      ),
      shares: await this.database.get(
        'SELECT COUNT(*) as count FROM social_shares WHERE user_id = ?',
        [userId]
      ),
      activity: await this.database.get(
        `SELECT COUNT(*) as total,
         COUNT(DISTINCT DATE(timestamp)) as active_days
         FROM user_activity WHERE user_id = ?`,
        [userId]
      ),
      quotas: await this.database.get(
        'SELECT * FROM user_quotas WHERE user_id = ?',
        [userId]
      )
    };

    return stats;
  }
}

module.exports = new UserManager();