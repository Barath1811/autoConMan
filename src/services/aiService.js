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

  async generateMetadata(script, sourceType) {
    const prompt = `
      Analyze this video script and generate SEO metadata.
      SOURCE TYPE: ${sourceType}
      
      METADATA RULES:
      1. TITLE: Engaging format "[Emoji] [Short Topic] [Hook]". NO #Shorts in title. Max 100 chars.
      2. DESCRIPTION: A natural 2-3 sentence summary of the video. If RESEARCH source, mention "top news analysis".
      3. HASHTAGS: Top 5-10 relevant tags. DO NOT include #AI or #Automation.
      
      Output ONLY a JSON object:
      {
        "title": "...",
        "description": "...",
        "hashtags": ["#tag1", "#tag2", ...]
      }
      
      SCRIPT:
      ${script}
    `;

    try {
      const result = await this.model.generateContent(prompt);
      const output = (await result.response).text().trim();
      // Basic JSON cleanup if AI adds markdown blocks
      const cleanedJson = output.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanedJson);
    } catch (error) {
      console.warn(`[AIService] Metadata parsing failed. Falling back to defaults.`);
      return null;
    }
  }
  async generateThumbnailData(script) {
    const prompt = `
      Analyze this video script and return ONLY a JSON object for thumbnail design.

      VALID THEMES: SPORTS, FINANCE, POLITICS, DISASTER, ENTERTAINMENT, TECHNOLOGY, DEFAULT
      VALID POSES: HAPPY, SAD, ANGRY, SURPRISED, LAUGHING, WAVING, THINK, IDLE

      RULES:
      1. theme: Best matching category for the topic.
      2. twoWordTitle: A punchy 2-word ALL-CAPS title for the thumbnail (no punctuation).
      3. characterPose: The emotion that best matches the topic's tone.
      4. accentHex: A vivid, theme-matching accent color (hex code).

      Output ONLY valid JSON, nothing else:
      {
        "theme": "SPORTS",
        "twoWordTitle": "PITCH WAR",
        "characterPose": "HAPPY",
        "accentHex": "#00C853"
      }

      SCRIPT:
      ${script.slice(0, 1000)}
    `;

    try {
      const result = await this.model.generateContent(prompt);
      const output = (await result.response).text().trim();
      const cleanedJson = output.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanedJson);
    } catch (error) {
      console.warn('[AIService] Thumbnail data generation failed. Using defaults.');
      return { theme: 'DEFAULT', twoWordTitle: 'BREAKING NEWS', characterPose: 'IDLE', accentHex: '#7C4DFF' };
    }
  }
}

module.exports = AIService;
