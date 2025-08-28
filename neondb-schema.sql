-- NeonDB Schema for App Cloner Video Generator
-- Run this script in your NeonDB dashboard to create all required tables

-- Users table for authentication and user management
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    password_hash TEXT,
    api_key TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Videos table for storing video projects and metadata
CREATE TABLE IF NOT EXISTS videos (
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
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Uploaded files table for user media assets
CREATE TABLE IF NOT EXISTS uploaded_files (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'default',
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_url TEXT,
    mimetype TEXT,
    size BIGINT,
    category TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Stock content cache for performance optimization
CREATE TABLE IF NOT EXISTS stock_content (
    id TEXT PRIMARY KEY,
    query TEXT NOT NULL,
    type TEXT NOT NULL,
    provider TEXT NOT NULL,
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    title TEXT,
    description TEXT,
    license TEXT,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Social media shares for tracking video distribution
CREATE TABLE IF NOT EXISTS social_shares (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    share_url TEXT,
    post_id TEXT,
    caption TEXT,
    status TEXT DEFAULT 'pending',
    shared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE CASCADE
);

-- Video processing jobs for background task management
CREATE TABLE IF NOT EXISTS processing_jobs (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL,
    status TEXT DEFAULT 'queued',
    progress INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE CASCADE
);

-- Media library for organized asset management
CREATE TABLE IF NOT EXISTS media_library (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'default',
    media_item_id TEXT NOT NULL,
    tags TEXT[],
    category TEXT,
    notes TEXT,
    provider TEXT,
    url TEXT,
    thumbnail_url TEXT,
    title TEXT,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- OAuth tokens for social media integrations
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT 'default',
    platform TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMP,
    scope TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Analytics for tracking video performance
CREATE TABLE IF NOT EXISTS video_analytics (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL,
    platform TEXT,
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    engagement_rate DECIMAL(5,2),
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE CASCADE
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_platform ON videos(platform);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_user_id ON uploaded_files(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_content_query ON stock_content(query);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_video_id ON processing_jobs(video_id);
CREATE INDEX IF NOT EXISTS idx_social_shares_video_id ON social_shares(video_id);
CREATE INDEX IF NOT EXISTS idx_media_library_user_id ON media_library(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_platform ON oauth_tokens(user_id, platform);
CREATE INDEX IF NOT EXISTS idx_video_analytics_video_id ON video_analytics(video_id);

-- Create a default user for development
INSERT INTO users (id, email, created_at) VALUES ('default', 'admin@appcloner.com', CURRENT_TIMESTAMP) 
ON CONFLICT (id) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE users IS 'User accounts and authentication data';
COMMENT ON TABLE videos IS 'Video projects with metadata and processing status';
COMMENT ON TABLE uploaded_files IS 'User uploaded media files and assets';
COMMENT ON TABLE stock_content IS 'Cached stock content for faster retrieval';
COMMENT ON TABLE social_shares IS 'Social media sharing tracking';
COMMENT ON TABLE processing_jobs IS 'Background video processing job queue';
COMMENT ON TABLE media_library IS 'Organized media asset library';
COMMENT ON TABLE oauth_tokens IS 'OAuth tokens for social media platforms';
COMMENT ON TABLE video_analytics IS 'Video performance metrics and analytics';