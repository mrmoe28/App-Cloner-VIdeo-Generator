const OpenAI = require('openai');
const { EncryptionService } = require('./encryption');
const { DatabaseService } = require('./database');

class AIVideoAssistant {
  constructor() {
    this.encryption = new EncryptionService();
    this.database = null;
    this.openaiCache = new Map();
  }

  async getOpenAIClient(userId = 'default') {
    // Check cache first
    if (this.openaiCache.has(userId)) {
      return this.openaiCache.get(userId);
    }

    // Initialize database if needed
    if (!this.database) {
      this.database = new DatabaseService();
      await this.database.initialize();
    }

    // Try to get user's API key
    let apiKey = await this.database.getUserApiKey(userId);
    
    // If no user key, try environment variable
    if (!apiKey && process.env.OPENAI_API_KEY) {
      apiKey = process.env.OPENAI_API_KEY;
    }

    if (!apiKey) {
      throw new Error('No OpenAI API key available. Please set up your API key first.');
    }

    // Decrypt if needed
    let decryptedKey;
    try {
      decryptedKey = this.encryption.decrypt(apiKey);
    } catch (error) {
      // If decryption fails, assume it's already plain text (env var)
      decryptedKey = apiKey;
    }

    const client = new OpenAI({ apiKey: decryptedKey });
    this.openaiCache.set(userId, client);
    
    return client;
  }

  async testApiKey(apiKey) {
    try {
      const client = new OpenAI({ apiKey });
      const response = await client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 5
      });
      return !!response.choices[0];
    } catch (error) {
      console.error('API key test failed:', error.message);
      return false;
    }
  }

  async generateVideoScript({ prompt, platform = 'general', duration = 60, userId = 'default' }) {
    try {
      const client = await this.getOpenAIClient(userId);
      
      const systemPrompt = `You are an expert video marketing copywriter specializing in short-form vertical videos. 
      Create compelling scripts optimized for ${platform} that drive engagement and conversions.
      
      Guidelines:
      - Target duration: ${duration} seconds
      - Format: 9:16 vertical video
      - Include hook in first 3 seconds
      - Strong call-to-action
      - Platform-specific optimization
      - Clear scene directions with timestamps`;

      const userPrompt = `Create a ${duration}-second video script for ${platform} about: ${prompt}

      Format the response as JSON with this structure:
      {
        "title": "Video title",
        "duration": ${duration},
        "platform": "${platform}",
        "scenes": [
          {
            "startTime": 0,
            "endTime": 3,
            "voiceover": "Script text here",
            "visualDirection": "What should be shown on screen",
            "onScreenText": "Text overlay if any"
          }
        ],
        "callToAction": "Final CTA text",
        "hashtags": ["relevant", "hashtags"],
        "description": "Video description for posting"
      }`;

      const response = await client.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      });

      const scriptText = response.choices[0].message.content;
      
      try {
        return JSON.parse(scriptText);
      } catch (parseError) {
        // If JSON parsing fails, return structured response
        return {
          title: "Generated Video Script",
          duration: duration,
          platform: platform,
          rawScript: scriptText,
          scenes: this.parseScriptToScenes(scriptText, duration),
          callToAction: "Take action now!",
          hashtags: this.extractHashtags(scriptText),
          description: prompt
        };
      }
    } catch (error) {
      console.error('Error generating script:', error);
      throw new Error(`Failed to generate script: ${error.message}`);
    }
  }

  async improveScript({ script, improvements = ['engagement', 'clarity'], userId = 'default' }) {
    try {
      const client = await this.getOpenAIClient(userId);
      
      const systemPrompt = `You are an expert video script editor. Improve the provided script based on these criteria: ${improvements.join(', ')}.
      
      Focus on:
      - Stronger hooks and openings
      - Better flow and pacing
      - More engaging language
      - Clearer call-to-actions
      - Platform optimization
      
      Maintain the original structure and timing.`;

      const response = await client.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Improve this video script:\n\n${JSON.stringify(script, null, 2)}` }
        ],
        temperature: 0.6,
        max_tokens: 2000
      });

      const improvedText = response.choices[0].message.content;
      
      try {
        return JSON.parse(improvedText);
      } catch (parseError) {
        return {
          ...script,
          improvedVersion: improvedText,
          improvements: improvements
        };
      }
    } catch (error) {
      console.error('Error improving script:', error);
      throw new Error(`Failed to improve script: ${error.message}`);
    }
  }

  async generateScenePrompts({ script, userId = 'default' }) {
    try {
      const client = await this.getOpenAIClient(userId);
      
      const systemPrompt = `You are an expert at creating visual prompts for AI image/video generation tools like DALL-E, Midjourney, or Runway ML.
      
      Create detailed, specific prompts for each scene that will generate compelling visuals.
      
      Guidelines:
      - Describe style, lighting, colors, composition
      - Include camera angles and movement
      - Specify any text overlays or graphics needed
      - Optimize for vertical 9:16 aspect ratio
      - Keep prompts under 200 characters each`;

      const scriptText = typeof script === 'string' ? script : JSON.stringify(script);
      
      const response = await client.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate visual prompts for each scene in this script:\n\n${scriptText}` }
        ],
        temperature: 0.7,
        max_tokens: 1500
      });

      const promptsText = response.choices[0].message.content;
      
      return {
        success: true,
        prompts: this.parsePromptsFromText(promptsText),
        rawResponse: promptsText
      };
    } catch (error) {
      console.error('Error generating scene prompts:', error);
      throw new Error(`Failed to generate scene prompts: ${error.message}`);
    }
  }

  parseScriptToScenes(scriptText, duration) {
    // Simple parsing logic - can be enhanced
    const lines = scriptText.split('\n').filter(line => line.trim());
    const scenes = [];
    const sceneLength = duration / Math.max(lines.length, 1);
    
    lines.forEach((line, index) => {
      if (line.trim()) {
        scenes.push({
          startTime: Math.round(index * sceneLength),
          endTime: Math.round((index + 1) * sceneLength),
          voiceover: line.trim(),
          visualDirection: `Scene ${index + 1} visuals`,
          onScreenText: ""
        });
      }
    });
    
    return scenes;
  }

  extractHashtags(text) {
    const hashtagRegex = /#[\w]+/g;
    const matches = text.match(hashtagRegex);
    return matches ? matches.map(tag => tag.substring(1)) : ['video', 'ai', 'content'];
  }

  parsePromptsFromText(text) {
    // Parse the AI response to extract individual prompts
    const lines = text.split('\n').filter(line => line.trim());
    const prompts = [];
    
    lines.forEach((line, index) => {
      if (line.includes('Scene') || line.includes('Prompt') || line.match(/^\d+\./)) {
        prompts.push({
          sceneNumber: index + 1,
          prompt: line.replace(/^Scene \d+:?|^Prompt \d+:?|^\d+\./, '').trim(),
          type: 'image',
          style: 'cinematic'
        });
      }
    });
    
    return prompts.length > 0 ? prompts : [{
      sceneNumber: 1,
      prompt: text,
      type: 'image',
      style: 'professional'
    }];
  }
}

module.exports = { AIVideoAssistant };