# Vercel GitHub Actions Setup Guide

This guide walks you through setting up automatic deployments to Vercel using GitHub Actions.

## Prerequisites

- GitHub repository with your code
- Vercel account and project
- Vercel CLI installed locally

## Step 1: Get Vercel Project Information

Run these commands in your project directory to get the required IDs:

```bash
# Install Vercel CLI if not already installed
npm install -g vercel

# Link your project (if not already linked)
vercel link

# Get your Vercel token (save this for later)
vercel whoami

# Get organization and project IDs
cat .vercel/project.json
```

## Step 2: Get Vercel Token

1. Go to [Vercel Account Settings](https://vercel.com/account/tokens)
2. Click "Create Token"
3. Give it a name like "GitHub Actions"
4. Copy the token (you won't see it again)

## Step 3: Add GitHub Secrets

Go to your GitHub repository settings:

1. Navigate to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret** and add these three secrets:

### Required Secrets:

- **`VERCEL_TOKEN`**: Your Vercel token from Step 2
- **`VERCEL_ORG_ID`**: From `.vercel/project.json` file (orgId field)
- **`VERCEL_PROJECT_ID`**: From `.vercel/project.json` file (projectId field)

Example `.vercel/project.json`:
```json
{
  "orgId": "team_abc123xyz",
  "projectId": "prj_def456uvw"
}
```

## Step 4: Test the Workflow

1. Push changes to your main branch
2. Check the **Actions** tab in your GitHub repository
3. Look for the "Vercel Deployment" workflow

## Workflow Features

- **Preview Deployments**: Automatically created for pull requests
- **Production Deployments**: Automatically created for pushes to main/master
- **PR Comments**: Preview URLs are automatically posted as comments
- **Linting**: Runs lint checks before deployment
- **Dependency Caching**: Speeds up builds with Node.js caching

## Troubleshooting

### Common Issues:

1. **Missing secrets**: Ensure all three secrets are set correctly
2. **Wrong branch**: Workflow only runs on main/master branches
3. **Vercel project not linked**: Run `vercel link` in your project

### Debug Steps:

1. Check the Actions tab for detailed logs
2. Verify your `.vercel/project.json` exists and has correct IDs
3. Test Vercel CLI locally: `vercel --prod`

## Manual Deployment

You can still deploy manually using:

```bash
# Preview deployment
vercel

# Production deployment  
vercel --prod
```

## Environment Variables

If your app needs environment variables:

1. Set them in Vercel dashboard: Project Settings → Environment Variables
2. Or use `vercel env` commands locally

The GitHub Actions workflow will automatically use the environment variables configured in your Vercel project.