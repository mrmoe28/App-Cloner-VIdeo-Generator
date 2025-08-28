# NeonDB Setup Guide

This guide will help you set up NeonDB (PostgreSQL) for the App Cloner Video Generator.

## Prerequisites

1. **NeonDB Account**: Sign up at [neon.tech](https://neon.tech)
2. **Node.js**: Ensure you have Node.js installed
3. **Git**: Your repository should be connected to Vercel

## Quick Setup

### Method 1: Automatic Setup (Recommended)

1. **Install dependencies**:
   ```bash
   npm install pg dotenv
   ```

2. **Get your NeonDB connection string**:
   - Go to your NeonDB dashboard
   - Navigate to your project
   - Copy the connection string (looks like `postgresql://username:password@hostname/database?sslmode=require`)

3. **Create environment file**:
   ```bash
   echo "NEON_DATABASE_URL=your_connection_string_here" > .env
   ```

4. **Run the setup script**:
   ```bash
   node setup-neondb.js
   ```

### Method 2: Manual Setup

1. **Open NeonDB SQL Editor**:
   - Go to your NeonDB dashboard
   - Click on "SQL Editor"

2. **Run the schema**:
   - Copy the contents of `neondb-schema.sql`
   - Paste and execute in the SQL Editor

## Database Tables Created

The setup creates the following tables:

| Table | Description |
|-------|-------------|
| `users` | User accounts and authentication |
| `videos` | Video projects and metadata |
| `uploaded_files` | User uploaded media files |
| `stock_content` | Cached stock content |
| `social_shares` | Social media sharing tracking |
| `processing_jobs` | Background video processing queue |
| `media_library` | Organized media asset library |
| `oauth_tokens` | OAuth tokens for social platforms |
| `video_analytics` | Video performance metrics |

## Vercel Environment Variables

Add these environment variables to your Vercel project:

1. **In Vercel Dashboard**:
   - Go to your project settings
   - Navigate to "Environment Variables"
   - Add the following:

```bash
NEON_DATABASE_URL=postgresql://username:password@hostname/database?sslmode=require
NODE_ENV=production
```

2. **Optional variables**:
```bash
OPENAI_API_KEY=your_openai_api_key
JWT_SECRET=your_jwt_secret_for_auth
```

## Testing the Connection

You can test your database connection by visiting:
```
https://your-app.vercel.app/api/health
```

This should return a JSON response indicating the database status.

## Troubleshooting

### Connection Issues
- Ensure your connection string is correct
- Check that SSL is enabled (`?sslmode=require`)
- Verify your NeonDB project is active

### Permission Issues
- Make sure your database user has CREATE and INSERT permissions
- Check that the database exists and is accessible

### Performance Optimization
- The schema includes indexes for better performance
- Consider upgrading your NeonDB plan for production use
- Monitor query performance in the NeonDB dashboard

## Security Notes

- Never commit `.env` files to version control
- Use Vercel's environment variables for production
- Regularly rotate database credentials
- Monitor database access logs

## Database Migration

If you need to update the schema later:

1. Create migration files in a `migrations/` folder
2. Use a migration tool like `node-pg-migrate`
3. Test migrations on a staging database first

## Support

- **NeonDB Issues**: Check [neon.tech/docs](https://neon.tech/docs)
- **App Issues**: Create an issue in this repository
- **Performance**: Monitor your NeonDB dashboard for insights

---

🎬 **Ready to generate amazing videos with persistent data storage!**