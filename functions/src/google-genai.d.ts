declare module '@google/genai' {
  export class GoogleGenAI {
    constructor(options: { apiKey: string });
    models: {
      generateContent(options: {
        model: string;
        contents: string;
        config?: {
          systemInstruction?: string;
          temperature?: number;
          maxOutputTokens?: number;
        };
      }): Promise<{
        text?: string | (() => string);
      }>;
    };
  }
}
