
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  // This error will be caught by the App component if API_KEY is not set in the environment.
  // The app should display a user-friendly message.
  console.error("API_KEY environment variable is not set.");
}

// Initialize AI client, will throw error if API_KEY is undefined which is handled in App.tsx
const ai = new GoogleGenAI({ apiKey: API_KEY! }); // Use non-null assertion as App.tsx checks

const modelConfig = {
  model: 'gemini-2.5-flash-preview-04-17',
  config: {
    systemInstruction: "You are a friendly and patient Japanese language tutor. Engage in a natural conversation in Japanese. Keep your responses relatively concise and suitable for speaking practice, ideally 1-3 sentences. Occasionally ask follow-up questions to keep the conversation flowing. Do not use markdown in your responses. Avoid overly complex vocabulary unless the user demonstrates a high proficiency. Respond in Japanese.",
  }
};

export const geminiService = {
  createChatSession: (): Chat => {
    if (!API_KEY) {
      throw new Error("API_KEY environment variable is not set. Cannot create chat session.");
    }
    return ai.chats.create(modelConfig);
  },

  getAIChatResponse: async (userMessage: string, chat: Chat): Promise<string> => {
    if (!API_KEY) {
      throw new Error("API_KEY environment variable is not set. Cannot get AI response.");
    }
    try {
      const response: GenerateContentResponse = await chat.sendMessage({ message: userMessage });
      return response.text;
    } catch (error) {
      console.error("Error sending message to Gemini:", error);
      if (error instanceof Error) {
        throw new Error(`Failed to get AI response: ${error.message}`);
      }
      throw new Error("Failed to get AI response due to an unknown error.");
    }
  },
};