# 🚀 Vercel Deployment Guide

Deploy your AI Video Studio to Vercel in minutes with this comprehensive guide.

## 📋 Prerequisites

Before deploying, ensure you have:

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **OpenAI API Key**: Required for AI functionality ([Get one here](https://platform.openai.com/api-keys))
3. **GitHub Repository**: Your code should be pushed to GitHub

## 🔧 Quick Deploy

### Option 1: Deploy Button (Fastest)

Click this button to deploy directly to Vercel:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/mrmoe28/App-Cloner-VIdeo-Generator)

### Option 2: Manual Deployment

1. **Fork this repository** or use your own GitHub repo
2. **Connect to Vercel**:
   - Go to [vercel.com/dashboard](https://vercel.com/dashboard)
   - Click "New Project"
   - Import your GitHub repository
   - Click "Deploy"

## ⚙️ Environment Variables Setup

After deployment, configure these environment variables in Vercel Dashboard → Settings → Environment Variables:

### 🔑 Required Variables

```bash
# OpenAI Configuration (REQUIRED)
OPENAI_API_KEY=sk-your-openai-api-key-here
JWT_SECRET=your-super-secure-random-string-here
```

### 📱 Optional: Social Media APIs

For OAuth-based social sharing, add these as needed:

```bash
# YouTube (Google Cloud Console)
YOUTUBE_CLIENT_ID=your-youtube-client-id
YOUTUBE_CLIENT_SECRET=your-youtube-client-secret

# Facebook/Instagram (Meta Developers)
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret

# TikTok (TikTok Developers)
TIKTOK_CLIENT_KEY=your-tiktok-client-key
TIKTOK_CLIENT_SECRET=your-tiktok-client-secret

# LinkedIn (LinkedIn Developers)
LINKEDIN_CLIENT_ID=your-linkedin-client-id
LINKEDIN_CLIENT_SECRET=your-linkedin-client-secret

# Twitter (Twitter Developers)
TWITTER_CLIENT_ID=your-twitter-client-id
TWITTER_CLIENT_SECRET=your-twitter-client-secret
```

### 🖼️ Optional: Stock Content APIs

For free stock photos, videos, and audio:

```bash
# Stock Photos & Videos
UNSPLASH_ACCESS_KEY=your-unsplash-access-key
PIXABAY_API_KEY=your-pixabay-api-key
PEXELS_API_KEY=your-pexels-api-key

# Royalty-Free Audio
FREESOUND_API_KEY=your-freesound-api-key
```

### ☁️ Optional: Cloud Storage

For production file storage (recommended):

```bash
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name
```

## 🎯 Post-Deployment Setup

### 1. Test Your Deployment

Visit your Vercel URL and check:
- ✅ Main interface loads at `/ai-video-studio.html`
- ✅ API endpoints respond (check Network tab)
- ✅ OpenAI integration works (try generating a script)

### 2. Configure Custom Domain (Optional)

1. Go to Vercel Dashboard → Domains
2. Add your custom domain
3. Update DNS settings as instructed

### 3. Set Up OAuth Redirects

For social media integration, configure redirect URIs:

**YouTube/Google:**
- Redirect URI: `https://your-domain.vercel.app/api/auth/youtube/callback`

**Facebook/Instagram:**
- Valid OAuth Redirect URIs: `https://your-domain.vercel.app/api/auth/facebook/callback`

**TikTok:**
- Redirect URI: `https://your-domain.vercel.app/api/auth/tiktok/callback`

**LinkedIn:**
- Authorized redirect URLs: `https://your-domain.vercel.app/api/auth/linkedin/callback`

**Twitter:**
- Callback URLs: `https://your-domain.vercel.app/api/auth/twitter/callback`

## 🔒 Security Best Practices

### Generate Secure JWT Secret

```bash
# Generate a secure random string (32+ characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Environment Variables Security

- ✅ Never commit API keys to your repository
- ✅ Use strong, unique passwords/secrets
- ✅ Enable 2FA on all API provider accounts
- ✅ Regularly rotate API keys
- ✅ Monitor API usage for unusual activity

## 📊 Monitoring & Analytics

### Built-in Features

The application includes:
- 📈 **Progress Tracking**: Real-time video processing updates
- 📋 **Activity Logs**: User actions and system events
- 🛡️ **Error Logging**: Comprehensive error tracking
- 👥 **User Management**: Multi-user support with quotas

### Vercel Analytics

Enable Vercel Analytics for additional insights:
1. Go to Vercel Dashboard → Analytics
2. Enable analytics for your project
3. View performance and usage metrics

## 🚨 Troubleshooting

### Common Issues & Solutions

**1. Build Fails**
- Check that all dependencies are listed in `package.json`
- Verify Node.js version compatibility (16+)

**2. API Errors**
- Ensure `OPENAI_API_KEY` is set correctly
- Check API key has sufficient credits
- Verify environment variables are set in Vercel Dashboard

**3. File Upload Issues**
- Vercel has file size limits (50MB default)
- Consider using cloud storage for large files

**4. Database Issues**
- SQLite works for development but consider PostgreSQL for production
- Files are ephemeral on Vercel - database resets between deployments

### Logs & Debugging

View logs in Vercel Dashboard:
1. Go to your project → Functions
2. Click on any function execution
3. View real-time logs and errors

### Support Resources

- 📖 [Vercel Documentation](https://vercel.com/docs)
- 🐛 [Report Issues](https://github.com/mrmoe28/App-Cloner-VIdeo-Generator/issues)
- 💬 [Community Discussions](https://github.com/mrmoe28/App-Cloner-VIdeo-Generator/discussions)

## 🔄 Continuous Deployment

Once connected to GitHub, Vercel automatically:
- ✅ Deploys on every push to main branch
- ✅ Creates preview deployments for pull requests  
- ✅ Runs build checks and tests
- ✅ Provides deployment status updates

## 🎉 You're Ready!

Your AI Video Studio is now live on Vercel! 🚀

**Quick Links:**
- 🎬 **Create Videos**: `/ai-video-studio.html`
- 🔧 **Advanced Creator**: `/advanced-video-creator.html` 
- 📊 **Dashboard**: `/video_generator.html`

**Next Steps:**
1. Share your deployed app with users
2. Monitor usage and performance
3. Add custom domain for professional branding
4. Set up social media OAuth for enhanced sharing

---

💡 **Pro Tip**: Bookmark your Vercel dashboard for easy access to logs, analytics, and deployment management.

Happy video creating! 🎬✨