const { GoogleGenerativeAI } = require('@google/generative-ai');

class AIService {
  constructor(config) {
    this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
    this.model = this.genAI.getGenerativeModel({
      model: config.aiModel,
    });
  }

  async generateScript(contentArray, source = 'DOC') {
    const isResearch = source === 'RESEARCH';
    const today = new Date().toISOString().split('T')[0];

    const prompt = `
      You are a professional scriptwriter creating a video script with facial expressions and emotions.
      ${isResearch
        ? `Synthesize this raw news research into a cohesive narrative for today (${today}), then convert it into a script.`
        : "Convert the following document content into an engaging video script."}
      
      EACH LINE of the script MUST follow this exact format:
      [EXPRESSION] Spoken text
      
      WHERE EXPRESSION is one of: IDLE, HAPPY, SAD, ANGRY, SURPRISED, LAUGHING, WAVING, THINK
      
      Rules:
      1. Each line must start with [EXPRESSION] followed by the spoken dialogue.
      2. Match facial expressions to the emotional tone of the text:
         - IDLE: Neutral resting state.
         - HAPPY: Positive, welcoming, or encouraging content.
         - SAD: Serious, unfortunate, or empathetic moments.
         - ANGRY: Critical, frustrated, or intense statements.
         - SURPRISED: Unexpected or shocking news.
         - LAUGHING: Humorous or very joyful moments.
         - WAVING: Greetings or goodbyes.
         - THINK: Questioning, analyzing, or wondering.
      3. Keep dialogue natural and concise.
      4. Each line should represent 1-3 seconds of speech (roughly 3-8 words).
      ${isResearch ? "5. Focus on the most important facts and create a clear story from the research." : ""}
      
      DO NOT include markdown, headers, bullet points, or stage directions.
      ONLY output script lines in the format above.
      
      Content:
      ${contentArray.join('\n\n')}
      
      Script:
    `;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
    } catch (error) {
      throw new Error(`AI Script Generation Error: ${error.message}`);
    }
  }

  async generateVideoData(script, sourceType) {
    const prompt = `
      Analyze this video script and return a single JSON object containing SEO metadata AND thumbnail design data.

      METADATA RULES:
      1. TITLE: "[Emoji] [Topic] [Hook]" (max 100 chars, NO #Shorts).
      2. DESCRIPTION: 2-3 sentence summary (NO #AI or #Automation).
      3. HASHTAGS: 5-10 tags.

      THUMBNAIL RULES:
      1. theme: One of [SPORTS, FINANCE, POLITICS, DISASTER, ENTERTAINMENT, TECHNOLOGY, DEFAULT].
      2. twoWordTitle: 2-word ALL-CAPS punchy title.
      3. characterPose: One of [HAPPY, SAD, ANGRY, SURPRISED, LAUGHING, WAVING, THINK, IDLE].
      4. accentHex: Vivid hex color matching the theme.

      Output ONLY valid JSON:
      {
        "metadata": { "title": "...", "description": "...", "hashtags": ["#tag1", ...] },
        "thumbnail": { "theme": "...", "twoWordTitle": "...", "characterPose": "...", "accentHex": "..." }
      }

      SCRIPT:
      ${script.slice(0, 1500)}
    `;

    const data = await this._callWithRetry(async () => {
      const result = await this.model.generateContent(prompt);
      const output = (await result.response).text().trim();
      const cleanedJson = output.replace(/```json|```/g, '').trim();
      try {
        return JSON.parse(cleanedJson);
      } catch (e) {
        console.warn(`[AIService] JSON Parse Error: ${e.message}. Raw output: ${output}`);
        return null; // Let _callWithRetry retry if it returns null? Wait, _callWithRetry only retries on error.
      }
    });

    return data || {
      metadata: { title: `🔥 Update: ${new Date().toLocaleDateString()}`, description: 'Trending news analysis.', hashtags: ['#news'] },
      thumbnail: { theme: 'DEFAULT', twoWordTitle: 'BREAKING NEWS', characterPose: 'IDLE', accentHex: '#7C4DFF' }
    };
  }

  async _callWithRetry(fn, attempts = 3, delay = 2000) {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error) {
        if (error.message.includes('429') && i < attempts - 1) {
          console.warn(`[AIService] Quota hit (429). Retrying in ${delay / 1000}s... (Attempt ${i + 1}/${attempts})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
          continue;
        }
        throw error;
      }
    }
  }

}

module.exports = AIService;
