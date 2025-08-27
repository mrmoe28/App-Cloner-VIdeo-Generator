const fs = require('fs-extra');
const path = require('path');

class Logger {
  constructor() {
    this.logsDir = path.join(process.cwd(), 'logs');
    this.errorLog = path.join(this.logsDir, 'error.log');
    this.accessLog = path.join(this.logsDir, 'access.log');
    this.debugLog = path.join(this.logsDir, 'debug.log');
    
    this.ensureLogsDirectory();
  }

  ensureLogsDirectory() {
    fs.ensureDirSync(this.logsDir);
  }

  formatMessage(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...metadata,
      pid: process.pid
    };
    return JSON.stringify(logEntry) + '\n';
  }

  async writeLog(filepath, level, message, metadata) {
    try {
      const logMessage = this.formatMessage(level, message, metadata);
      await fs.appendFile(filepath, logMessage);
      
      // Also log to console in development
      if (process.env.NODE_ENV !== 'production') {
        const colorMap = {
          ERROR: '\x1b[31m',   // Red
          WARN: '\x1b[33m',    // Yellow
          INFO: '\x1b[36m',    // Cyan
          DEBUG: '\x1b[90m',   // Gray
        };
        const color = colorMap[level] || '';
        const reset = '\x1b[0m';
        console.log(`${color}[${level}]${reset} ${message}`, metadata);
      }
    } catch (err) {
      console.error('Failed to write log:', err);
    }
  }

  async error(message, error = null, context = {}) {
    const metadata = {
      ...context,
      error: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code
      } : null
    };
    await this.writeLog(this.errorLog, 'ERROR', message, metadata);
  }

  async warn(message, context = {}) {
    await this.writeLog(this.errorLog, 'WARN', message, context);
  }

  async info(message, context = {}) {
    await this.writeLog(this.accessLog, 'INFO', message, context);
  }

  async debug(message, context = {}) {
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      await this.writeLog(this.debugLog, 'DEBUG', message, context);
    }
  }

  async logApiCall(endpoint, method, statusCode, duration, userId = null) {
    await this.info('API Call', {
      endpoint,
      method,
      statusCode,
      duration: `${duration}ms`,
      userId
    });
  }

  async logVideoProcessing(stage, videoId, details = {}) {
    await this.info(`Video Processing: ${stage}`, {
      videoId,
      stage,
      ...details
    });
  }

  async logSocialShare(platform, success, videoId, userId, error = null) {
    const level = success ? 'INFO' : 'ERROR';
    const message = `Social Share: ${platform}`;
    await this.writeLog(
      success ? this.accessLog : this.errorLog,
      level,
      message,
      {
        platform,
        success,
        videoId,
        userId,
        error: error?.message
      }
    );
  }

  // Get recent logs for debugging
  async getRecentLogs(type = 'error', lines = 100) {
    try {
      const logFile = type === 'error' ? this.errorLog : 
        type === 'access' ? this.accessLog : 
          this.debugLog;
      
      if (!await fs.pathExists(logFile)) {
        return [];
      }

      const content = await fs.readFile(logFile, 'utf-8');
      const allLines = content.trim().split('\n').filter(Boolean);
      const recentLines = allLines.slice(-lines);
      
      return recentLines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return { raw: line };
        }
      });
    } catch (error) {
      console.error('Failed to read logs:', error);
      return [];
    }
  }

  // Clean old logs
  async cleanOldLogs(daysToKeep = 30) {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    
    for (const logFile of [this.errorLog, this.accessLog, this.debugLog]) {
      try {
        if (!await fs.pathExists(logFile)) continue;
        
        const content = await fs.readFile(logFile, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);
        
        const recentLines = lines.filter(line => {
          try {
            const entry = JSON.parse(line);
            const timestamp = new Date(entry.timestamp).getTime();
            return timestamp > cutoffTime;
          } catch {
            return true; // Keep malformed lines
          }
        });
        
        await fs.writeFile(logFile, recentLines.join('\n') + '\n');
        await this.info(`Cleaned old logs from ${path.basename(logFile)}`, {
          removed: lines.length - recentLines.length,
          kept: recentLines.length
        });
      } catch (error) {
        console.error(`Failed to clean ${logFile}:`, error);
      }
    }
  }
}

module.exports = new Logger();