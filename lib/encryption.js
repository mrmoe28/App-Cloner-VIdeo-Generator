const crypto = require('crypto');

class EncryptionService {
  constructor() {
    // Use environment variable for encryption key, or generate a default one
    this.encryptionKey = process.env.ENCRYPTION_KEY || this.generateDefaultKey();
    this.algorithm = 'aes-256-gcm';
  }

  generateDefaultKey() {
    // Generate a default key based on some system properties
    // In production, you should use a proper environment variable
    const systemInfo = require('os').hostname() + require('os').platform();
    return crypto.scryptSync(systemInfo, 'salt', 32);
  }

  encrypt(text) {
    if (!text) return null;
    
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(this.algorithm, this.encryptionKey);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return {
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        encrypted: encrypted
      };
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  decrypt(encryptedData) {
    if (!encryptedData) return null;
    
    try {
      // Handle both object and string formats
      let data;
      if (typeof encryptedData === 'string') {
        try {
          data = JSON.parse(encryptedData);
        } catch {
          // If it's not JSON, assume it's a plain text API key
          return encryptedData;
        }
      } else {
        data = encryptedData;
      }

      if (!data.encrypted || !data.iv || !data.authTag) {
        // Assume it's a plain text API key
        return encryptedData;
      }

      const decipher = crypto.createDecipher(this.algorithm, this.encryptionKey);
      decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));
      
      let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      // If decryption fails, return the original data (might be plain text)
      return typeof encryptedData === 'object' ? encryptedData.encrypted : encryptedData;
    }
  }

  hashPassword(password) {
    return crypto.pbkdf2Sync(password, 'salt', 10000, 64, 'sha512').toString('hex');
  }

  validatePassword(password, hash) {
    const testHash = this.hashPassword(password);
    return testHash === hash;
  }

  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  generateUserId() {
    return crypto.randomUUID();
  }
}

module.exports = { EncryptionService };