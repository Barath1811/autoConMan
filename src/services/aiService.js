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
      You are a professional scriptwriter. 
      Convert the following document content into a concise, engaging video script.
      The output should include section headers (e.g., [Intro], [Main Point], [Conclusion]) and speaker directions if applicable.
      
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
