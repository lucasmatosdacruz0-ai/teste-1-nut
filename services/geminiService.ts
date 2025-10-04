import { DailyPlan, Meal, UserData, MacroData, Recipe, FoodItem } from '../types';
import { GenerateContentResponse } from "@google/genai";

// --- API ABSTRACTION ---

async function apiRequest(action: string, payload: any): Promise<any> {
    try {
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, payload }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `Erro no servidor para a ação: ${action}`);
        }
        
        const result = await response.json();
        return result.data;

    } catch (e) {
        console.error(`API request failed for action '${action}':`, e);
        throw e;
    }
}

// --- STREAMING API ---

export async function* sendMessageToAI(message: string, history: { sender: 'user' | 'bot'; text: string }[]): AsyncGenerator<GenerateContentResponse, void, unknown> {
    const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'chatStream', payload: { message, history } }),
    });

    if (!response.ok || !response.body) {
        const errorData = await response.json().catch(() => ({ error: "Ocorreu um erro ao comunicar com o chat." }));
        throw new Error(errorData.error);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            if (buffer) {
                 try { yield JSON.parse(buffer) as GenerateContentResponse; } catch (e) { console.error('Error parsing final stream chunk:', buffer, e); }
            }
            break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.trim()) {
                try {
                    yield JSON.parse(line) as GenerateContentResponse;
                } catch (e) {
                    console.error('Error parsing stream chunk:', line, e);
                }
            }
        }
    }
}


// --- NON-STREAMING API FUNCTIONS ---

export const parseMealPlanText = (text: string): Promise<DailyPlan> => {
    return apiRequest('parseMealPlanText', { text });
};

export const regenerateDailyPlan = (userData: UserData, currentPlan: DailyPlan, numberOfMeals?: number): Promise<DailyPlan> => {
    return apiRequest('regenerateDailyPlan', { userData, currentPlan, numberOfMeals });
};

export const adjustDailyPlanForMacro = (userData: UserData, currentPlan: DailyPlan, macroToFix: keyof Omit<MacroData, 'calories'>): Promise<DailyPlan> => {
    return apiRequest('adjustDailyPlanForMacro', { userData, currentPlan, macroToFix });
};

export const generateWeeklyPlan = (userData: UserData, startDate: Date, observation?: string): Promise<Record<string, DailyPlan>> => {
    return apiRequest('generateWeeklyPlan', { userData, startDate, observation });
};

export const regenerateMealFromPrompt = (promptStr: string, meal: Meal, userData: UserData): Promise<Meal> => {
    return apiRequest('regenerateMealFromPrompt', { prompt: promptStr, meal, userData });
};

export const analyzeMealFromText = (description: string): Promise<MacroData> => {
    return apiRequest('analyzeMealFromText', { description });
};

export const analyzeMealFromImage = (imageDataUrl: string): Promise<MacroData> => {
    return apiRequest('analyzeMealFromImage', { imageDataUrl });
};

export const analyzeProgress = (userData: UserData): Promise<string> => {
    return apiRequest('analyzeProgress', { userData });
};

export const generateShoppingList = (weekPlan: DailyPlan[]): Promise<string> => {
    return apiRequest('generateShoppingList', { weekPlan });
};

export const getFoodInfo = (question: string, mealContext?: Meal): Promise<string> => {
    return apiRequest('getFoodInfo', { question, mealContext });
};

export const getFoodSubstitution = (itemToSwap: FoodItem, mealContext: Meal, userData: UserData): Promise<FoodItem> => {
    return apiRequest('getFoodSubstitution', { itemToSwap, mealContext, userData });
};

export const generateImageFromPrompt = (prompt: string): Promise<string> => {
    return apiRequest('generateImageFromPrompt', { prompt });
};

export const findRecipes = (query: string, userData: UserData, numRecipes: number = 3): Promise<Recipe[]> => {
    return apiRequest('findRecipes', { query, userData, numRecipes });
};

export const analyzeActivityFromText = (description: string): Promise<{ type: string; duration: number; caloriesBurned: number; }> => {
    return apiRequest('analyzeActivityFromText', { description });
};
