# Vercel Environment Variable Setup Guide

## Steps to Add OpenAI API Key to Vercel

1. **Go to Vercel Dashboard**
   - Visit https://vercel.com/dashboard
   - Select your project: `app-cloner-v-ideo-generator`

2. **Navigate to Settings**
   - Click on the "Settings" tab at the top of your project page

3. **Go to Environment Variables**
   - In the left sidebar, click on "Environment Variables"

4. **Add New Environment Variable**
   - Click the "Add New" button
   - Fill in the following:
     - **Key (Name):** `OPENAI_API_KEY`
     - **Value:** Your OpenAI API key (starting with sk-proj-...)
     - **Environment:** Select all three:
       - ✅ Production
       - ✅ Preview  
       - ✅ Development

5. **Save the Variable**
   - Click "Save" to add the environment variable

6. **Redeploy Your Application**
   - Go to the "Deployments" tab
   - Click on the three dots (...) next to your latest deployment
   - Select "Redeploy"
   - Wait for the deployment to complete

## Verification

After deployment, your app will:
- Automatically use the server-configured API key
- Hide the API key input field from users
- Display "AI Ready (Server Configured)" status
- No longer require users to enter their own API keys

## Security Note

⚠️ **IMPORTANT**: Never commit your actual API key to version control. Always use environment variables for sensitive data.

## Local Development

For local testing, create a `.env` file in your project root:
```
OPENAI_API_KEY=your_api_key_here
```

This file is gitignored and won't be committed to your repository.