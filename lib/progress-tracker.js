const EventEmitter = require('events');
const logger = require('./logger');

class ProgressTracker extends EventEmitter {
  constructor() {
    super();
    this.activeJobs = new Map();
    this.completedJobs = new Map();
    this.jobHistory = [];
  }

  // Create a new progress job
  createJob(jobId, type = 'video-processing', metadata = {}) {
    const job = {
      id: jobId,
      type,
      status: 'initialized',
      progress: 0,
      stages: [],
      currentStage: null,
      startTime: Date.now(),
      endTime: null,
      duration: null,
      metadata,
      errors: [],
      warnings: []
    };

    this.activeJobs.set(jobId, job);
    this.emit('job:created', job);
    
    logger.info('Progress job created', { jobId, type, metadata });
    
    return job;
  }

  // Update job progress
  updateProgress(jobId, progress, details = {}) {
    const job = this.activeJobs.get(jobId);
    if (!job) {
      logger.warn('Attempted to update non-existent job', { jobId });
      return null;
    }

    const oldProgress = job.progress;
    job.progress = Math.min(100, Math.max(0, progress));
    job.lastUpdate = Date.now();
    
    if (details.stage && details.stage !== job.currentStage) {
      this.startStage(jobId, details.stage, details.stageDetails);
    }

    if (details.message) {
      job.lastMessage = details.message;
    }

    if (details.eta) {
      job.eta = details.eta;
    }

    // Emit progress event
    this.emit('job:progress', {
      ...job,
      delta: job.progress - oldProgress,
      details
    });

    logger.debug('Job progress updated', { 
      jobId, 
      progress: job.progress,
      stage: job.currentStage,
      message: details.message 
    });

    return job;
  }

  // Start a new stage within a job
  startStage(jobId, stageName, details = {}) {
    const job = this.activeJobs.get(jobId);
    if (!job) return null;

    // Complete previous stage if exists
    if (job.currentStage) {
      this.completeStage(jobId, job.currentStage);
    }

    const stage = {
      name: stageName,
      startTime: Date.now(),
      endTime: null,
      duration: null,
      progress: 0,
      details,
      status: 'in_progress'
    };

    job.stages.push(stage);
    job.currentStage = stageName;
    job.status = 'processing';

    this.emit('job:stage:start', { jobId, stage });
    
    logger.info('Job stage started', { jobId, stageName, details });

    return stage;
  }

  // Complete a stage
  completeStage(jobId, stageName, result = {}) {
    const job = this.activeJobs.get(jobId);
    if (!job) return null;

    const stage = job.stages.find(s => s.name === stageName);
    if (!stage) return null;

    stage.endTime = Date.now();
    stage.duration = stage.endTime - stage.startTime;
    stage.status = 'completed';
    stage.result = result;
    stage.progress = 100;

    this.emit('job:stage:complete', { jobId, stage });
    
    logger.info('Job stage completed', { 
      jobId, 
      stageName, 
      duration: `${stage.duration}ms` 
    });

    return stage;
  }

  // Add warning to job
  addWarning(jobId, warning, details = {}) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    job.warnings.push({
      message: warning,
      timestamp: Date.now(),
      stage: job.currentStage,
      details
    });

    this.emit('job:warning', { jobId, warning, details });
    logger.warn('Job warning', { jobId, warning, stage: job.currentStage });
  }

  // Add error to job
  addError(jobId, error, details = {}) {
    const job = this.activeJobs.get(jobId) || this.completedJobs.get(jobId);
    if (!job) return;

    const errorEntry = {
      message: error.message || error,
      stack: error.stack,
      timestamp: Date.now(),
      stage: job.currentStage,
      details
    };

    job.errors.push(errorEntry);
    job.status = 'error';

    this.emit('job:error', { jobId, error: errorEntry });
    logger.error('Job error', error, { jobId, stage: job.currentStage });
  }

  // Complete a job
  completeJob(jobId, result = {}) {
    const job = this.activeJobs.get(jobId);
    if (!job) return null;

    // Complete current stage if any
    if (job.currentStage) {
      this.completeStage(jobId, job.currentStage);
    }

    job.endTime = Date.now();
    job.duration = job.endTime - job.startTime;
    job.status = job.errors.length > 0 ? 'completed_with_errors' : 'completed';
    job.progress = 100;
    job.result = result;

    // Move to completed jobs
    this.activeJobs.delete(jobId);
    this.completedJobs.set(jobId, job);
    
    // Add to history
    this.jobHistory.push({
      id: jobId,
      type: job.type,
      status: job.status,
      duration: job.duration,
      completedAt: job.endTime,
      errorsCount: job.errors.length,
      warningsCount: job.warnings.length
    });

    // Keep only last 1000 history entries
    if (this.jobHistory.length > 1000) {
      this.jobHistory = this.jobHistory.slice(-1000);
    }

    this.emit('job:complete', job);
    
    logger.info('Job completed', { 
      jobId, 
      duration: `${job.duration}ms`,
      status: job.status,
      errors: job.errors.length,
      warnings: job.warnings.length
    });

    return job;
  }

  // Fail a job
  failJob(jobId, error, details = {}) {
    const job = this.activeJobs.get(jobId);
    if (!job) return null;

    this.addError(jobId, error, details);
    
    job.endTime = Date.now();
    job.duration = job.endTime - job.startTime;
    job.status = 'failed';
    job.failureReason = error.message || error;

    // Move to completed jobs
    this.activeJobs.delete(jobId);
    this.completedJobs.set(jobId, job);

    this.emit('job:failed', { job, error });
    
    logger.error('Job failed', error, { 
      jobId, 
      duration: `${job.duration}ms`,
      stage: job.currentStage 
    });

    return job;
  }

  // Get job status
  getJob(jobId) {
    return this.activeJobs.get(jobId) || this.completedJobs.get(jobId);
  }

  // Get all active jobs
  getActiveJobs() {
    return Array.from(this.activeJobs.values());
  }

  // Get job statistics
  getStatistics() {
    const activeJobs = Array.from(this.activeJobs.values());
    const completedJobs = Array.from(this.completedJobs.values());
    
    const stats = {
      active: activeJobs.length,
      completed: completedJobs.filter(j => j.status === 'completed').length,
      failed: completedJobs.filter(j => j.status === 'failed').length,
      withErrors: completedJobs.filter(j => j.status === 'completed_with_errors').length,
      totalProcessed: this.jobHistory.length,
      averageDuration: 0,
      successRate: 0
    };

    if (completedJobs.length > 0) {
      const durations = completedJobs.map(j => j.duration).filter(Boolean);
      stats.averageDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      
      const successful = completedJobs.filter(j => 
        j.status === 'completed' || j.status === 'completed_with_errors'
      ).length;
      stats.successRate = (successful / completedJobs.length) * 100;
    }

    return stats;
  }

  // Clean old completed jobs
  cleanOldJobs(maxAge = 24 * 60 * 60 * 1000) { // 24 hours default
    const cutoff = Date.now() - maxAge;
    let cleaned = 0;

    for (const [jobId, job] of this.completedJobs.entries()) {
      if (job.endTime < cutoff) {
        this.completedJobs.delete(jobId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Cleaned old jobs', { cleaned, remaining: this.completedJobs.size });
    }

    return cleaned;
  }

  // Subscribe to progress updates for a specific job
  subscribeToJob(jobId, callback) {
    const eventHandler = (data) => {
      if (data.jobId === jobId || (data.id === jobId)) {
        callback(data);
      }
    };

    this.on('job:progress', eventHandler);
    this.on('job:complete', eventHandler);
    this.on('job:failed', eventHandler);
    this.on('job:error', eventHandler);
    this.on('job:warning', eventHandler);

    // Return unsubscribe function
    return () => {
      this.removeListener('job:progress', eventHandler);
      this.removeListener('job:complete', eventHandler);
      this.removeListener('job:failed', eventHandler);
      this.removeListener('job:error', eventHandler);
      this.removeListener('job:warning', eventHandler);
    };
  }
}

module.exports = new ProgressTracker();