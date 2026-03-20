const { GoogleGenerativeAI } = require('@google/generative-ai');

class AIService {
  constructor(apiKey) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-flash-latest',
    });
  }

  async generateScript(contentArray) {
    const prompt = `
      You are a professional scriptwriter creating a video script with facial expressions and emotions.
      Convert the following document content into an engaging video script where EACH LINE follows this exact format:
      
      [EXPRESSION] Spoken text
      
      WHERE EXPRESSION is one of: IDLE, HAPPY, SAD, ANGRY, SURPRISED, LAUGHING, WAVING, THINK
      
      Rules:
      1. Each line must start with [EXPRESSION] followed by the spoken dialogue
      2. Match facial expressions to the emotional tone of the text:
         - IDLE: Neutral resting state, use for transitions or steady information.
         - HAPPY: Lifted brows, use for positive, welcoming, or encouraging content.
         - SAD: Drooped brows, use for serious, unfortunate, or empathetic moments.
         - ANGRY: Brows in a V, use for critical, frustrated, or intense statements.
         - SURPRISED: Brows high, eyes wide, use for unexpected or shocking news.
         - LAUGHING: Squinting eyes, use for humorous or very joyful moments.
         - WAVING: Use for friendly greetings or goodbyes.
         - THINK: Pupils up, asymmetric brows, use for questioning, analyzing, or wondering.
      3. Keep dialogue natural and concise
      4. Each line should represent 1-3 seconds of speech (roughly 3-8 words)
      
      DO NOT include markdown headers, bullet points, or any formatting other than [EXPRESSION] markers.
      DO NOT add stage directions or narrative text.
      ONLY output script lines in the format above using EXACTLY the 8 expressions listed.
      
      Content:
      ${contentArray.join('\n\n')}
      
      Script:
    `;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      throw new Error(`Gemini API Error: ${error.message}`);
    }
  }
}

module.exports = AIService;
