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
      let videoPath;
      try {
        videoPath = await this.renderVideo(timeline, projectDir, videoId, options);
      } catch (renderError) {
        console.warn('FFmpeg rendering failed, trying slideshow fallback:', renderError.message);
        videoPath = await this.createSlideshowFallback(timeline, projectDir, videoId);
      }
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
    try {
      // Try to use canvas package if available
      let canvas, createCanvas;
      try {
        canvas = require('canvas');
        createCanvas = canvas.createCanvas;
      } catch (canvasError) {
        console.warn('Canvas package not available, creating simple placeholder');
        return this.createSimplePlaceholder(scene, projectDir);
      }
    
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

    } catch (error) {
      console.error('Error creating canvas placeholder:', error);
      return this.createSimplePlaceholder(scene, projectDir);
    }
  }

  // Simple placeholder fallback when canvas is not available
  async createSimplePlaceholder(scene, projectDir) {
    try {
      const fs = require('fs-extra');
      
      // Create a simple text file that can be converted to image later
      const placeholderText = `${scene.visualDirection || scene.voiceover || 'Video Scene'}`;
      const filename = `${scene.id}_placeholder.txt`;
      const filepath = path.join(projectDir, filename);
      
      // Write placeholder text
      await fs.writeFile(filepath, JSON.stringify({
        scene: scene.id,
        text: placeholderText,
        type: 'text_placeholder',
        width: 720,
        height: 1280
      }));
      
      console.log(`📝 Created simple text placeholder for ${scene.id}`);
      return filepath;
      
    } catch (error) {
      console.error('Error creating simple placeholder:', error);
      throw new Error(`Failed to create placeholder for scene ${scene.id}`);
    }
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

  // Fallback slideshow generator when FFmpeg fails
  async createSlideshowFallback(timeline, projectDir, videoId) {
    try {
      console.log('🎞️ Creating slideshow fallback video...');
      
      const fs = require('fs-extra');
      const outputPath = path.join(this.outputDir, `${videoId}_slideshow.html`);
      
      // Create HTML5 slideshow as fallback
      const slideshowHtml = this.generateSlideshowHTML(timeline);
      
      await fs.writeFile(outputPath, slideshowHtml);
      console.log('📺 Created HTML slideshow fallback');
      
      return outputPath;
      
    } catch (error) {
      console.error('Slideshow fallback creation failed:', error);
      
      // Ultimate fallback: create a simple JSON file
      const jsonPath = path.join(this.outputDir, `${videoId}_data.json`);
      const fs = require('fs-extra');
      
      await fs.writeFile(jsonPath, JSON.stringify({
        id: videoId,
        type: 'slideshow_data',
        timeline: timeline,
        message: 'Video processing completed. Data saved for manual review.',
        timestamp: new Date().toISOString()
      }, null, 2));
      
      console.log('💾 Created data file as ultimate fallback');
      return jsonPath;
    }
  }

  // Generate HTML slideshow
  generateSlideshowHTML(timeline) {
    const scenes = timeline.scenes.map(scene => ({
      id: scene.id,
      duration: scene.duration * 1000, // Convert to milliseconds
      content: scene.visualDirection || scene.voiceover || 'Video Scene',
      asset: scene.asset?.url || null
    }));

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Video Slideshow - ${timeline.id}</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: #000;
            color: #fff;
            font-family: Arial, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }
        .slideshow-container {
            width: 360px;
            height: 640px;
            position: relative;
            background: linear-gradient(45deg, #1a1a1a, #2d2d2d);
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(0,0,0,0.5);
        }
        .slide {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.5s ease-in-out;
            padding: 40px;
            text-align: center;
            box-sizing: border-box;
        }
        .slide.active {
            opacity: 1;
        }
        .slide img {
            max-width: 100%;
            max-height: 60%;
            border-radius: 10px;
            margin-bottom: 20px;
        }
        .slide-content {
            font-size: 18px;
            line-height: 1.4;
            color: #00D4FF;
        }
        .controls {
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 10px;
        }
        .control-btn {
            background: rgba(0, 212, 255, 0.3);
            border: none;
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            cursor: pointer;
        }
        .control-btn:hover {
            background: rgba(0, 212, 255, 0.5);
        }
        .progress-bar {
            position: absolute;
            bottom: 0;
            left: 0;
            height: 3px;
            background: #00D4FF;
            width: 0%;
            transition: width linear;
        }
    </style>
</head>
<body>
    <div class="slideshow-container">
        ${scenes.map((scene, index) => `
        <div class="slide ${index === 0 ? 'active' : ''}" data-duration="${scene.duration}">
            ${scene.asset ? `<img src="${scene.asset}" alt="Scene ${scene.id}">` : ''}
            <div class="slide-content">${scene.content}</div>
        </div>
        `).join('')}
        
        <div class="controls">
            <button class="control-btn" onclick="previousSlide()">◀ Prev</button>
            <button class="control-btn" onclick="togglePlay()" id="playBtn">▶ Play</button>
            <button class="control-btn" onclick="nextSlide()">Next ▶</button>
        </div>
        
        <div class="progress-bar" id="progressBar"></div>
    </div>

    <script>
        const slides = document.querySelectorAll('.slide');
        const progressBar = document.getElementById('progressBar');
        const playBtn = document.getElementById('playBtn');
        
        let currentSlide = 0;
        let isPlaying = false;
        let slideInterval;
        let progressInterval;
        
        function showSlide(index) {
            slides.forEach(slide => slide.classList.remove('active'));
            slides[index].classList.add('active');
            currentSlide = index;
        }
        
        function nextSlide() {
            currentSlide = (currentSlide + 1) % slides.length;
            showSlide(currentSlide);
        }
        
        function previousSlide() {
            currentSlide = (currentSlide - 1 + slides.length) % slides.length;
            showSlide(currentSlide);
        }
        
        function togglePlay() {
            if (isPlaying) {
                clearInterval(slideInterval);
                clearInterval(progressInterval);
                playBtn.textContent = '▶ Play';
                progressBar.style.width = '0%';
            } else {
                playSlideshow();
                playBtn.textContent = '⏸ Pause';
            }
            isPlaying = !isPlaying;
        }
        
        function playSlideshow() {
            const duration = parseInt(slides[currentSlide].dataset.duration);
            let progress = 0;
            
            progressBar.style.width = '0%';
            progressBar.style.transition = \`width \${duration}ms linear\`;
            progressBar.style.width = '100%';
            
            slideInterval = setTimeout(() => {
                nextSlide();
                if (isPlaying) playSlideshow();
            }, duration);
        }
        
        // Auto-start slideshow
        setTimeout(() => togglePlay(), 1000);
    </script>
</body>
</html>`;
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