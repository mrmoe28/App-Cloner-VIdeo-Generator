const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

class VideoGeneratorService {
  constructor(stockContentService, databaseService) {
    this.stockContentService = stockContentService;
    this.database = databaseService;
    this.outputDir = path.join(process.cwd(), 'output', 'videos');
    this.tempDir = path.join(process.cwd(), 'temp', 'video-gen');
    
    // Ensure directories exist
    fs.ensureDirSync(this.outputDir);
    fs.ensureDirSync(this.tempDir);
  }

  // Main workflow: Script → Video
  async generateVideo({ script, options = {} }) {
    const videoId = uuidv4();
    const projectDir = path.join(this.tempDir, videoId);
    fs.ensureDirSync(projectDir);

    console.log(`🎬 Starting video generation for project: ${videoId}`);

    try {
      // Stage 1: Analyze script and break down scenes
      const sceneAnalysis = await this.analyzeScript(script);
      console.log(`📝 Script analyzed: ${sceneAnalysis.scenes.length} scenes identified`);

      // Stage 2: Generate visual assets for each scene
      const visualAssets = await this.generateVisualAssets(sceneAnalysis, projectDir);
      console.log(`🎨 Generated ${visualAssets.length} visual assets`);

      // Stage 3: Generate captions and timing
      const captionData = await this.generateCaptions(sceneAnalysis);
      console.log(`💬 Generated captions for ${captionData.length} scenes`);

      // Stage 4: Create timeline and assemble video
      const timeline = await this.createTimeline(sceneAnalysis, visualAssets, captionData);
      console.log(`⏰ Timeline created with ${timeline.totalDuration}s duration`);

      // Stage 5: Render final video
      const videoPath = await this.renderVideo(timeline, projectDir, videoId, options);
      console.log(`🎥 Video rendered: ${videoPath}`);

      // Stage 6: Save to database and cleanup
      const videoData = await this.saveVideoProject({
        id: videoId,
        script,
        timeline,
        videoPath,
        options,
        createdAt: new Date().toISOString()
      });

      // Cleanup temp files
      setTimeout(() => {
        fs.removeSync(projectDir);
        console.log(`🧹 Cleaned up temp files for ${videoId}`);
      }, 5000);

      return videoData;

    } catch (error) {
      console.error(`❌ Video generation failed for ${videoId}:`, error);
      // Cleanup on error
      fs.removeSync(projectDir);
      throw error;
    }
  }

  // Analyze script and extract scenes
  async analyzeScript(script) {
    const scenes = script.scenes || [];
    const analysis = {
      title: script.title || 'Generated Video',
      totalDuration: script.duration || 30,
      platform: script.platform || 'general',
      scenes: []
    };

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const sceneAnalysis = {
        id: `scene_${i + 1}`,
        startTime: scene.startTime || 0,
        endTime: scene.endTime || 5,
        duration: (scene.endTime || 5) - (scene.startTime || 0),
        voiceover: scene.voiceover || '',
        visualDirection: scene.visualDirection || '',
        onScreenText: scene.onScreenText || '',
        searchKeywords: this.extractVisualKeywords(scene.visualDirection || scene.voiceover),
        mediaType: this.determineMediaType(scene.visualDirection)
      };
      
      analysis.scenes.push(sceneAnalysis);
    }

    return analysis;
  }

  // Extract keywords for visual search
  extractVisualKeywords(text) {
    // Remove common words and extract key visual terms
    const commonWords = ['show', 'display', 'see', 'watch', 'look', 'view', 'screen', 'appears'];
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !commonWords.includes(word));
    
    // Take most relevant keywords
    return words.slice(0, 5).join(' ');
  }

  // Determine if scene needs image or video
  determineMediaType(visualDirection) {
    const videoKeywords = ['motion', 'moving', 'animation', 'transition', 'time-lapse', 'action'];
    const hasVideoKeyword = videoKeywords.some(keyword => 
      visualDirection.toLowerCase().includes(keyword)
    );
    
    return hasVideoKeyword ? 'video' : 'image';
  }

  // Generate visual assets for all scenes
  async generateVisualAssets(sceneAnalysis, projectDir) {
    const assets = [];

    for (const scene of sceneAnalysis.scenes) {
      try {
        console.log(`🔍 Searching media for scene: ${scene.id}`);
        
        // Search for stock media using MCP server
        const searchResults = await this.stockContentService.search({
          query: scene.searchKeywords,
          type: scene.mediaType,
          limit: 5
        });

        let selectedAsset = null;
        
        if (searchResults.results && searchResults.results.length > 0) {
          // Select the best matching asset
          selectedAsset = searchResults.results[0];
          
          // Download asset to project directory
          const assetPath = await this.downloadAsset(selectedAsset, projectDir, scene.id);
          
          assets.push({
            sceneId: scene.id,
            type: selectedAsset.type,
            path: assetPath,
            originalUrl: selectedAsset.url,
            metadata: {
              title: selectedAsset.title,
              provider: selectedAsset.provider,
              duration: scene.duration,
              width: selectedAsset.width,
              height: selectedAsset.height
            }
          });
        } else {
          // Fallback: create a placeholder
          const placeholderPath = await this.createPlaceholder(scene, projectDir);
          assets.push({
            sceneId: scene.id,
            type: 'placeholder',
            path: placeholderPath,
            metadata: {
              title: `Placeholder for ${scene.id}`,
              duration: scene.duration
            }
          });
        }
        
      } catch (error) {
        console.warn(`Failed to generate asset for ${scene.id}:`, error.message);
        // Create fallback placeholder
        const placeholderPath = await this.createPlaceholder(scene, projectDir);
        assets.push({
          sceneId: scene.id,
          type: 'placeholder',
          path: placeholderPath,
          metadata: {
            title: `Placeholder for ${scene.id}`,
            duration: scene.duration
          }
        });
      }
    }

    return assets;
  }

  // Download media asset
  async downloadAsset(asset, projectDir, sceneId) {
    const axios = require('axios');
    const extension = asset.type === 'video' ? 'mp4' : 'jpg';
    const filename = `${sceneId}.${extension}`;
    const filepath = path.join(projectDir, filename);

    try {
      const response = await axios({
        method: 'get',
        url: asset.url,
        responseType: 'stream',
        timeout: 30000,
        headers: {
          'User-Agent': 'AI-Video-Studio/1.0'
        }
      });

      const writer = fs.createWriteStream(filepath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(filepath));
        writer.on('error', reject);
      });
    } catch (error) {
      console.error(`Failed to download asset ${asset.url}:`, error.message);
      throw error;
    }
  }

  // Create placeholder asset
  async createPlaceholder(scene, projectDir) {
    const canvas = require('canvas');
    const { createCanvas } = canvas;
    
    const width = 720;
    const height = 1280; // 9:16 aspect ratio
    const canvasElement = createCanvas(width, height);
    const ctx = canvasElement.getContext('2d');

    // Create gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#1a1a1a');
    gradient.addColorStop(1, '#2d2d2d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Add text
    ctx.fillStyle = '#00D4FF';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Word wrap the visual direction
    const text = scene.visualDirection || scene.voiceover || 'AI Video Scene';
    const maxWidth = width - 80;
    const lines = this.wrapText(ctx, text, maxWidth);
    
    const lineHeight = 60;
    const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2;
    
    lines.forEach((line, index) => {
      ctx.fillText(line, width / 2, startY + index * lineHeight);
    });

    // Save as image
    const filename = `${scene.id}_placeholder.png`;
    const filepath = path.join(projectDir, filename);
    const buffer = canvasElement.toBuffer('image/png');
    fs.writeFileSync(filepath, buffer);

    return filepath;
  }

  // Helper function to wrap text
  wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const width = ctx.measureText(currentLine + ' ' + word).width;
      if (width < maxWidth) {
        currentLine += ' ' + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    lines.push(currentLine);
    return lines;
  }

  // Generate captions with timing
  async generateCaptions(sceneAnalysis) {
    const captions = [];

    for (const scene of sceneAnalysis.scenes) {
      if (scene.voiceover) {
        // Split voiceover into words and calculate timing
        const words = scene.voiceover.split(' ');
        // const wordsPerSecond = 2.5; // Average speaking pace
        const wordDuration = scene.duration / words.length;

        let currentTime = scene.startTime;
        let currentCaption = '';
        let captionStartTime = currentTime;

        for (let i = 0; i < words.length; i++) {
          currentCaption += (currentCaption ? ' ' : '') + words[i];
          currentTime += wordDuration;

          // Create caption segments every 3-4 seconds or at scene end
          if (currentCaption.split(' ').length >= 6 || i === words.length - 1) {
            captions.push({
              startTime: captionStartTime,
              endTime: Math.min(currentTime, scene.endTime),
              text: currentCaption,
              sceneId: scene.id
            });

            captionStartTime = currentTime;
            currentCaption = '';
          }
        }
      }

      // Add on-screen text if available
      if (scene.onScreenText) {
        captions.push({
          startTime: scene.startTime,
          endTime: scene.endTime,
          text: scene.onScreenText,
          type: 'overlay',
          sceneId: scene.id
        });
      }
    }

    return captions;
  }

  // Create video timeline
  async createTimeline(sceneAnalysis, visualAssets, captionData) {
    const timeline = {
      id: uuidv4(),
      totalDuration: sceneAnalysis.totalDuration,
      scenes: [],
      captions: captionData,
      transitions: []
    };

    // Map visual assets to scenes
    for (const scene of sceneAnalysis.scenes) {
      const asset = visualAssets.find(a => a.sceneId === scene.id);
      const sceneCaptions = captionData.filter(c => c.sceneId === scene.id);

      timeline.scenes.push({
        ...scene,
        asset: asset,
        captions: sceneCaptions,
        transition: {
          type: 'fade',
          duration: 0.5
        }
      });
    }

    return timeline;
  }

  // Render final video using FFmpeg
  async renderVideo(timeline, projectDir, videoId) {
    const outputPath = path.join(this.outputDir, `${videoId}.mp4`);
    
    return new Promise((resolve, reject) => {
      let command = ffmpeg();

      // Add input files for each scene
      timeline.scenes.forEach(scene => {
        if (scene.asset && scene.asset.path) {
          command = command.input(scene.asset.path);
        }
      });

      // Video processing options
      command = command
        .size('720x1280') // 9:16 aspect ratio
        .fps(30)
        .videoBitrate('2000k')
        .audioCodec('aac')
        .videoCodec('libx264')
        .format('mp4')
        .outputOptions([
          '-preset', 'medium',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart'
        ]);

      // Create complex filter for scenes, transitions, and captions
      const filterComplex = this.buildFilterComplex(timeline);
      if (filterComplex) {
        command = command.complexFilter(filterComplex);
      }

      command
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('🎬 FFmpeg started:', commandLine);
        })
        .on('progress', (progress) => {
          console.log(`📊 Video processing: ${Math.round(progress.percent || 0)}%`);
        })
        .on('end', () => {
          console.log('✅ Video rendering completed');
          resolve(outputPath);
        })
        .on('error', (error) => {
          console.error('❌ Video rendering failed:', error);
          reject(error);
        })
        .run();
    });
  }

  // Build FFmpeg filter complex for video assembly
  buildFilterComplex(timeline) {
    const filters = [];
    // Process each scene

    // Process each scene
    timeline.scenes.forEach((scene, index) => {
      const inputIndex = index;
      const duration = scene.duration;

      // Scale and crop to 9:16 if needed
      filters.push(`[${inputIndex}:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setpts=PTS-STARTPTS,setsar=1[v${index}]`);
      
      // Set duration
      filters.push(`[v${index}]trim=duration=${duration}[v${index}trimmed]`);
    });

    // Concatenate all scenes
    if (timeline.scenes.length > 1) {
      const concatInputs = timeline.scenes.map((_, i) => `[v${i}trimmed]`).join('');
      filters.push(`${concatInputs}concat=n=${timeline.scenes.length}:v=1:a=0[outv]`);
    } else {
      filters.push('[v0trimmed]copy[outv]');
    }

    return filters.join(';');
  }

  // Save video project to database
  async saveVideoProject(videoData) {
    await this.database.initialize();
    
    const projectData = {
      id: videoData.id,
      title: videoData.script.title || 'Generated Video',
      description: videoData.script.scenes?.[0]?.voiceover || '',
      videoPath: videoData.videoPath,
      duration: videoData.timeline.totalDuration,
      platform: videoData.script.platform,
      script: JSON.stringify(videoData.script),
      timeline: JSON.stringify(videoData.timeline),
      options: JSON.stringify(videoData.options),
      status: 'completed',
      createdAt: videoData.createdAt,
      updatedAt: new Date().toISOString()
    };

    // Save to database (assuming you have a saveVideoProject method)
    if (this.database.saveVideoProject) {
      await this.database.saveVideoProject(projectData);
    }

    return {
      ...projectData,
      videoUrl: `/output/videos/${videoData.id}.mp4`
    };
  }

  // Get saved videos
  async getSavedVideos(limit = 50, offset = 0) {
    await this.database.initialize();
    if (this.database.getSavedVideos) {
      return this.database.getSavedVideos(limit, offset);
    }
    return [];
  }

  // Delete video project
  async deleteVideo(videoId) {
    const videoPath = path.join(this.outputDir, `${videoId}.mp4`);
    
    // Remove video file
    if (fs.existsSync(videoPath)) {
      fs.removeSync(videoPath);
    }

    // Remove from database
    if (this.database.deleteVideoProject) {
      await this.database.deleteVideoProject(videoId);
    }

    return true;
  }
}

module.exports = { VideoGeneratorService };