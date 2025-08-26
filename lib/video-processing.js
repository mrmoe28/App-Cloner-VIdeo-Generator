const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const { DatabaseService } = require('./database');

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

class VideoProcessingService {
  constructor() {
    this.database = null;
    this.processingQueue = new Map();
    this.outputDir = path.join(__dirname, '..', 'output');
    this.tempDir = path.join(__dirname, '..', 'temp');
    
    this.initializeDirectories();
    this.initializeDatabase();
  }

  async initializeDirectories() {
    await fs.ensureDir(this.outputDir);
    await fs.ensureDir(this.tempDir);
  }

  async initializeDatabase() {
    if (!this.database) {
      this.database = new DatabaseService();
      await this.database.initialize();
    }
  }

  async createVideo({ scenes, audio, settings = {} }) {
    const videoId = uuidv4();
    const jobId = await this.database.createProcessingJob(videoId);
    
    try {
      console.log(`🎬 Starting video creation: ${videoId}`);
      
      // Default settings
      const config = {
        width: 360,
        height: 640,
        fps: 30,
        duration: 60,
        format: 'mp4',
        quality: 'high',
        ...settings
      };

      // Update job status
      await this.database.updateProcessingJob(jobId, {
        status: 'processing',
        progress: 10
      });

      // Process scenes and create video
      const outputPath = await this.processScenes(scenes, audio, config, jobId);
      
      // Update job completion
      await this.database.updateProcessingJob(jobId, {
        status: 'completed',
        progress: 100,
        completed_at: new Date().toISOString()
      });

      console.log(`✅ Video creation completed: ${videoId}`);
      
      return {
        videoId,
        jobId,
        outputPath,
        url: `/output/${path.basename(outputPath)}`
      };

    } catch (error) {
      console.error(`❌ Video creation failed: ${videoId}`, error);
      
      await this.database.updateProcessingJob(jobId, {
        status: 'failed',
        progress: 0,
        error_message: error.message,
        completed_at: new Date().toISOString()
      });

      throw error;
    }
  }

  async processScenes(scenes, audio, config, jobId) {
    const tempFiles = [];
    const outputFilename = `video_${Date.now()}_${config.width}x${config.height}.${config.format}`;
    const outputPath = path.join(this.outputDir, outputFilename);

    try {
      // Create temporary scene videos
      console.log(`📝 Processing ${scenes.length} scenes...`);
      
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const sceneFile = await this.createSceneVideo(scene, config, i);
        tempFiles.push(sceneFile);
        
        // Update progress
        const progress = 20 + (i / scenes.length) * 50;
        await this.database.updateProcessingJob(jobId, { progress });
      }

      // Concatenate scenes
      console.log('🔗 Concatenating scenes...');
      await this.database.updateProcessingJob(jobId, { progress: 75 });
      
      const concatenatedVideo = await this.concatenateVideos(tempFiles, config);
      tempFiles.push(concatenatedVideo);

      // Add audio if provided
      let finalVideo = concatenatedVideo;
      if (audio && audio.file) {
        console.log('🎵 Adding audio track...');
        await this.database.updateProcessingJob(jobId, { progress: 85 });
        
        finalVideo = await this.addAudioTrack(concatenatedVideo, audio, config);
        tempFiles.push(finalVideo);
      }

      // Apply final effects and encoding
      console.log('✨ Applying final effects...');
      await this.database.updateProcessingJob(jobId, { progress: 95 });
      
      await this.applyFinalEffects(finalVideo, outputPath, config);

      // Cleanup temp files
      this.cleanupTempFiles(tempFiles);

      return outputPath;

    } catch (error) {
      // Cleanup on error
      this.cleanupTempFiles(tempFiles);
      throw error;
    }
  }

  async createSceneVideo(scene, config, sceneIndex) {
    return new Promise((resolve, reject) => {
      const tempFilename = `scene_${sceneIndex}_${Date.now()}.mp4`;
      const tempPath = path.join(this.tempDir, tempFilename);
      
      // Create a colored background video with text overlay
      const duration = (scene.endTime - scene.startTime) || 5;
      
      let command = ffmpeg()
        .input(`color=c=${scene.backgroundColor || '#000000'}:size=${config.width}x${config.height}:duration=${duration}:rate=${config.fps}`)
        .inputFormat('lavfi');

      // Add text overlay if provided
      if (scene.onScreenText) {
        const textFilter = `drawtext=fontfile=/System/Library/Fonts/Arial.ttf:text='${scene.onScreenText.replace(/'/g, "\\'")}':fontcolor=white:fontsize=24:x=(w-text_w)/2:y=(h-text_h)/2`;
        command = command.videoFilter(textFilter);
      }

      // Add image overlay if scene has background image
      if (scene.backgroundImage) {
        // This would require the image file to be processed
        // For now, we'll use a solid color background
      }

      command
        .output(tempPath)
        .videoCodec('libx264')
        .outputOptions([
          '-pix_fmt yuv420p',
          '-preset fast',
          '-crf 23'
        ])
        .on('start', (commandLine) => {
          console.log(`🎥 Creating scene ${sceneIndex + 1}: ${duration}s`);
        })
        .on('progress', (progress) => {
          // Optional: emit progress events
        })
        .on('end', () => {
          console.log(`✅ Scene ${sceneIndex + 1} completed`);
          resolve(tempPath);
        })
        .on('error', (err) => {
          console.error(`❌ Scene ${sceneIndex + 1} failed:`, err.message);
          reject(err);
        })
        .run();
    });
  }

  async concatenateVideos(videoFiles, config) {
    return new Promise((resolve, reject) => {
      const outputFilename = `concatenated_${Date.now()}.mp4`;
      const outputPath = path.join(this.tempDir, outputFilename);
      
      // Create concat file list
      const listFilename = `concat_list_${Date.now()}.txt`;
      const listPath = path.join(this.tempDir, listFilename);
      
      const listContent = videoFiles.map(file => `file '${file}'`).join('\n');
      fs.writeFileSync(listPath, listContent);

      ffmpeg()
        .input(listPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions([
          '-c copy',
          '-avoid_negative_ts make_zero'
        ])
        .output(outputPath)
        .on('start', () => {
          console.log('🔗 Concatenating video scenes...');
        })
        .on('end', () => {
          fs.unlinkSync(listPath); // Clean up list file
          resolve(outputPath);
        })
        .on('error', (err) => {
          fs.unlinkSync(listPath); // Clean up list file
          reject(err);
        })
        .run();
    });
  }

  async addAudioTrack(videoPath, audio, config) {
    return new Promise((resolve, reject) => {
      const outputFilename = `with_audio_${Date.now()}.mp4`;
      const outputPath = path.join(this.tempDir, outputFilename);

      let command = ffmpeg()
        .input(videoPath)
        .input(audio.file);

      // Audio mixing options
      const audioOptions = [
        '-c:v copy', // Copy video without re-encoding
        '-c:a aac',
        '-b:a 128k',
        '-ar 44100'
      ];

      // Handle audio volume
      if (audio.volume && audio.volume !== 1.0) {
        audioOptions.push(`-filter:a volume=${audio.volume}`);
      }

      // Handle audio fade in/out
      if (audio.fadeIn || audio.fadeOut) {
        let audioFilter = '';
        if (audio.fadeIn) audioFilter += `afade=in:st=0:d=${audio.fadeIn}`;
        if (audio.fadeOut) {
          if (audioFilter) audioFilter += ',';
          audioFilter += `afade=out:st=${config.duration - audio.fadeOut}:d=${audio.fadeOut}`;
        }
        if (audioFilter) audioOptions.push(`-filter:a ${audioFilter}`);
      }

      command
        .outputOptions(audioOptions)
        .output(outputPath)
        .on('start', () => {
          console.log('🎵 Adding audio track...');
        })
        .on('end', () => {
          resolve(outputPath);
        })
        .on('error', (err) => {
          reject(err);
        })
        .run();
    });
  }

  async applyFinalEffects(inputPath, outputPath, config) {
    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath);

      // Video encoding settings based on quality
      const qualitySettings = {
        low: { crf: 30, preset: 'fast' },
        medium: { crf: 25, preset: 'medium' },
        high: { crf: 20, preset: 'slow' },
        ultra: { crf: 18, preset: 'slower' }
      };

      const quality = qualitySettings[config.quality] || qualitySettings.medium;

      const outputOptions = [
        '-c:v libx264',
        '-preset ' + quality.preset,
        '-crf ' + quality.crf,
        '-pix_fmt yuv420p',
        '-movflags +faststart', // Optimize for web streaming
        '-maxrate 2M',
        '-bufsize 4M'
      ];

      // Audio settings
      if (config.includeAudio !== false) {
        outputOptions.push(
          '-c:a aac',
          '-b:a 128k',
          '-ar 44100'
        );
      }

      // Frame rate
      if (config.fps !== 30) {
        outputOptions.push(`-r ${config.fps}`);
      }

      command
        .outputOptions(outputOptions)
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('✨ Applying final encoding...');
        })
        .on('progress', (progress) => {
          console.log(`⏳ Encoding: ${Math.round(progress.percent || 0)}%`);
        })
        .on('end', () => {
          console.log('✅ Final video encoding completed');
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('❌ Final encoding failed:', err.message);
          reject(err);
        })
        .run();
    });
  }

  async getStatus(videoId) {
    await this.initializeDatabase();
    
    const job = await this.database.getProcessingJob(videoId);
    if (!job) {
      return { status: 'not_found' };
    }

    return {
      status: job.status,
      progress: job.progress,
      error: job.error_message,
      startedAt: job.started_at,
      completedAt: job.completed_at
    };
  }

  cleanupTempFiles(files) {
    files.forEach(file => {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (error) {
        console.warn(`Failed to cleanup temp file ${file}:`, error.message);
      }
    });
  }

  // Utility methods for video processing
  async getVideoInfo(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          const videoStream = metadata.streams.find(s => s.codec_type === 'video');
          const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
          
          resolve({
            duration: metadata.format.duration,
            width: videoStream?.width,
            height: videoStream?.height,
            fps: videoStream ? eval(videoStream.r_frame_rate) : null,
            hasAudio: !!audioStream,
            fileSize: metadata.format.size,
            bitrate: metadata.format.bit_rate
          });
        }
      });
    });
  }

  async createThumbnail(videoPath, outputPath, timeOffset = '00:00:01') {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          timestamps: [timeOffset],
          filename: path.basename(outputPath),
          folder: path.dirname(outputPath),
          size: '360x640'
        })
        .on('end', () => {
          resolve(outputPath);
        })
        .on('error', (err) => {
          reject(err);
        });
    });
  }

  // Preset configurations for different platforms
  getPresetConfig(platform) {
    const presets = {
      'youtube-shorts': {
        width: 1080,
        height: 1920,
        fps: 30,
        format: 'mp4',
        quality: 'high',
        maxDuration: 60
      },
      'tiktok': {
        width: 1080,
        height: 1920,
        fps: 30,
        format: 'mp4',
        quality: 'high',
        maxDuration: 180
      },
      'instagram-reels': {
        width: 1080,
        height: 1920,
        fps: 30,
        format: 'mp4',
        quality: 'high',
        maxDuration: 90
      },
      'twitter': {
        width: 1080,
        height: 1920,
        fps: 30,
        format: 'mp4',
        quality: 'medium',
        maxDuration: 140
      },
      'general': {
        width: 360,
        height: 640,
        fps: 30,
        format: 'mp4',
        quality: 'medium',
        maxDuration: 60
      }
    };

    return presets[platform] || presets.general;
  }
}

module.exports = { VideoProcessingService };