import { GoogleGenAI, Chat, GenerateContentResponse, Part, TextPart, FileDataPart } from "@google/genai";
import { DailyPlan, Meal, UserData, MacroData, Recipe, FoodItem } from '../types';

// --- SETUP ---

let ai: GoogleGenAI;

// Singleton function to get the AI instance.
// This prevents the app from crashing on load if the API key is missing.
function getAiInstance(): GoogleGenAI {
    if (!ai) {
        const API_KEY = process.env.API_KEY;
        if (!API_KEY) {
            // This will be more visible to the user than a console.error,
            // especially with an ErrorBoundary component.
            throw new Error("A chave da API do Google não está configurada. Configure a variável de ambiente API_KEY nas configurações do seu projeto Vercel.");
        }
        ai = new GoogleGenAI({ apiKey: API_KEY });
    }
    return ai;
}


const model = 'gemini-2.5-flash';
const imageModel = 'imagen-4.0-generate-001';

// --- PROMPT ENGINEERING HELPERS ---
const buildUserProfile = (userData: UserData) => `
### Dados do Usuário
- **Idade:** ${userData.age}
- **Gênero:** ${userData.gender}
- **Altura:** ${userData.height} cm
- **Peso Atual:** ${userData.weight} kg
- **Nível de Atividade:** ${userData.activityLevel}
- **Meta de Peso:** ${userData.weightGoal} kg
- **Preferências Dietéticas:** ${userData.dietaryPreferences?.diets?.join(', ') || 'Nenhuma'}
- **Restrições Alimentares:** ${userData.dietaryPreferences?.restrictions?.join(', ') || 'Nenhuma'}
- **Metas de Macros Diárias:**
  - Calorias: ${userData.macros.calories.goal} kcal
  - Proteínas: ${userData.macros.protein.goal} g
  - Carboidratos: ${userData.macros.carbs.goal} g
  - Gorduras: ${userData.macros.fat.goal} g
`;

const jsonResponseInstruction = (format: string) => `
IMPORTANTE: Sua resposta DEVE ser um objeto JSON válido, sem nenhum texto adicional, markdown, ou explicação. Apenas o JSON. O formato deve ser:
${format}
`;

// Helper for handling API errors and parsing JSON
const generateAndParseJson = async (prompt: string): Promise<any> => {
    const ai = getAiInstance();
    try {
        const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        const text = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(text);
    } catch (e) {
        console.error("Error generating or parsing JSON response from AI", e);
        throw new Error("A IA retornou um formato de dados inválido. Tente novamente.");
    }
};

// --- API FUNCTIONS ---

export async function* sendMessageToAI(message: string, history: { sender: 'user' | 'bot'; text: string }[]): AsyncGenerator<GenerateContentResponse, void, unknown> {
    const ai = getAiInstance();
    try {
        const chat: Chat = ai.chats.create({
            model,
            history: history.map(msg => ({
                role: msg.sender === 'user' ? 'user' : 'model',
                parts: [{ text: msg.text }]
            })),
        });
        const stream = await chat.sendMessageStream({ message });
        for await (const chunk of stream) {
            yield chunk;
        }
    } catch(e) {
        console.error("Streaming chat error:", e);
        throw new Error("Ocorreu um erro ao comunicar com o chat.");
    }
}

export const parseMealPlanText = (text: string): Promise<DailyPlan> => {
    const prompt = `Converta o seguinte texto de um plano alimentar em um objeto JSON. ${jsonResponseInstruction('DailyPlan (definido no schema do app)')}\n\nTexto:\n${text}`;
    return generateAndParseJson(prompt);
};

export const regenerateDailyPlan = (userData: UserData, currentPlan: DailyPlan, numberOfMeals?: number): Promise<DailyPlan> => {
    const prompt = `Com base no perfil do usuário, gere um novo plano alimentar para a data ${currentPlan.date}. ${numberOfMeals ? `O plano deve ter exatamente ${numberOfMeals} refeições.` : ''} ${buildUserProfile(userData)} ${jsonResponseInstruction('DailyPlan')}`;
    return generateAndParseJson(prompt);
};

export const adjustDailyPlanForMacro = (userData: UserData, currentPlan: DailyPlan, macroToFix: keyof Omit<MacroData, 'calories'>): Promise<DailyPlan> => {
    const prompt = `Ajuste este plano alimentar para se aproximar mais da meta de ${macroToFix}. Mantenha as calorias totais o mais próximo possível da meta. Plano original:\n${JSON.stringify(currentPlan)}\n${buildUserProfile(userData)} ${jsonResponseInstruction('DailyPlan')}`;
    return generateAndParseJson(prompt);
};

export const generateWeeklyPlan = (userData: UserData, weekStartDate: Date, observation?: string): Promise<Record<string, DailyPlan>> => {
    const prompt = `Crie um plano alimentar para 7 dias, começando em ${weekStartDate.toISOString().split('T')[0]}. ${observation ? `Observação: ${observation}`: ''} ${buildUserProfile(userData)} ${jsonResponseInstruction('Record<string, DailyPlan>')}`;
    return generateAndParseJson(prompt);
};

export const regenerateMealFromPrompt = (promptStr: string, meal: Meal, userData: UserData): Promise<Meal> => {
    const prompt = `Regenere a refeição "${meal.name}" com base na seguinte instrução: "${promptStr}". ${buildUserProfile(userData)} ${jsonResponseInstruction('Meal')}`;
    return generateAndParseJson(prompt);
};

export const analyzeMealFromText = (description: string): Promise<MacroData> => {
    const prompt = `Analise esta descrição de uma refeição e retorne uma estimativa dos macronutrientes. ${jsonResponseInstruction('{ "calories": number, "carbs": number, "protein": number, "fat": number }')}\n\nDescrição: ${description}`;
    return generateAndParseJson(prompt);
};

export const analyzeMealFromImage = async (imageDataUrl: string): Promise<MacroData> => {
    const ai = getAiInstance();
    const [header, base64Data] = imageDataUrl.split(',');
    if (!header || !base64Data) {
        throw new Error('Formato de imagem inválido.');
    }
    const mimeType = header.match(/:(.*?);/)?.[1];
    if (!mimeType) {
         throw new Error('Não foi possível determinar o tipo MIME da imagem.');
    }

    const imagePart: FileDataPart = {
        inlineData: {
            data: base64Data,
            mimeType,
        },
    };
    const textPart: TextPart = {
        text: `Analise esta imagem de uma refeição. Sua tarefa é retornar APENAS um objeto JSON com a estimativa de macronutrientes. O formato deve ser: { "calories": number, "carbs": number, "protein": number, "fat": number }`,
    };

    try {
        const response = await ai.models.generateContent({
            model,
            contents: { parts: [textPart, imagePart] },
            config: { responseMimeType: "application/json" }
        });
        const text = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(text);
    } catch(e) {
        console.error("Error generating or parsing JSON response from AI", e);
        throw new Error("A IA retornou um formato de dados inválido. Tente novamente.");
    }
};

export const analyzeProgress = async (userData: UserData): Promise<string> => {
    const ai = getAiInstance();
    const prompt = `Analise os dados de progresso do usuário e forneça um resumo motivacional com dicas. Fale diretamente com o usuário. ${buildUserProfile(userData)}`;
    const response = await ai.models.generateContent({ model, contents: prompt });
    return response.text;
};

export const generateShoppingList = async (weekPlan: DailyPlan[]): Promise<string> => {
    const ai = getAiInstance();
     const prompt = `Crie uma lista de compras detalhada e organizada por categorias (ex: Frutas, Vegetais, Carnes) com base no seguinte plano alimentar semanal:\n${JSON.stringify(weekPlan)}`;
     const response = await ai.models.generateContent({ model, contents: prompt });
     return response.text;
};

export const getFoodInfo = async (question: string, mealContext?: Meal): Promise<string> => {
    const ai = getAiInstance();
    const prompt = `Responda à seguinte dúvida sobre alimentos de forma clara e concisa. Pergunta: "${question}" ${mealContext ? `Contexto da refeição: ${JSON.stringify(mealContext)}` : ''}`;
    const response = await ai.models.generateContent({ model, contents: prompt });
    return response.text;
};

export const getFoodSubstitution = (itemToSwap: FoodItem, mealContext: Meal, userData: UserData): Promise<FoodItem> => {
    const prompt = `Sugira um substituto para o item "${itemToSwap.name}" no contexto da refeição "${mealContext.name}". O substituto deve ter macros similares. ${buildUserProfile(userData)} ${jsonResponseInstruction('FoodItem')}`;
    return generateAndParseJson(prompt);
};

export const generateImageFromPrompt = async (prompt: string): Promise<string> => {
    const ai = getAiInstance();
    const response = await ai.models.generateImages({
        model: imageModel,
        prompt: prompt,
        config: { numberOfImages: 1, outputMimeType: 'image/jpeg' }
    });
    return response.generatedImages[0].image.imageBytes;
};

export const findRecipes = (query: string, userData: UserData, numRecipes: number = 3): Promise<Recipe[]> => {
    const prompt = `Encontre ${numRecipes} receitas com base na busca: "${query}". Para cada receita, forneça um prompt de imagem otimizado para um gerador de imagens. ${buildUserProfile(userData)} ${jsonResponseInstruction('Recipe[]')}`;
    return generateAndParseJson(prompt);
};

export const analyzeActivityFromText = (description: string): Promise<{ type: string; duration: number; caloriesBurned: number; }> => {
    const prompt = `Analise o seguinte texto sobre uma atividade física e extraia o tipo, duração em minutos e calorias queimadas. ${jsonResponseInstruction('{ "type": string, "duration": number, "caloriesBurned": number }')}\n\nTexto: ${description}`;
    return generateAndParseJson(prompt);
};