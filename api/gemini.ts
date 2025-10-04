import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, GenerateContentResponse, FileDataPart, TextPart, Part, Chat } from '@google/genai';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
    throw new Error("A chave da API do Google (API_KEY) não está configurada nas variáveis de ambiente do Vercel.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });
const model = 'gemini-2.5-flash';
const imageModel = 'imagen-4.0-generate-001';

async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { action, payload } = req.body;

    try {
        if (action === 'chatStream') {
            return handleChatStream(payload, res);
        }

        const result = await handleNonStreamingRequest(action, payload);
        return res.status(200).json({ data: result });

    } catch (e: any) {
        console.error(`Error in action '${action}':`, e);
        return res.status(500).json({ error: `Erro da IA: ${e.message || 'Ocorreu um erro desconhecido.'}` });
    }
}

async function handleChatStream(payload: any, res: VercelResponse) {
    const { message, history } = payload;
    
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const chat: Chat = ai.chats.create({
            model,
            history: history.map((msg: any) => ({
                role: msg.sender === 'user' ? 'user' : 'model',
                parts: [{ text: msg.text }]
            })),
        });
        const stream = await chat.sendMessageStream({ message });

        for await (const chunk of stream) {
            res.write(JSON.stringify(chunk) + '\n');
        }
        res.end();
    } catch(e: any) {
        console.error("Streaming chat error:", e);
        res.end(JSON.stringify({ error: "Ocorreu um erro ao comunicar com o chat."}));
    }
}

async function handleNonStreamingRequest(action: string, payload: any) {
    const userProfile = payload.userData ? buildUserProfile(payload.userData) : '';
    let prompt = '';
    let response;

    switch (action) {
        case 'generateImageFromPrompt':
            response = await ai.models.generateImages({
                model: imageModel,
                prompt: payload.prompt,
                config: { numberOfImages: 1, outputMimeType: 'image/jpeg' }
            });
            return response.generatedImages[0].image.imageBytes;
        
        case 'analyzeMealFromImage':
            const { imageDataUrl } = payload;
            const [header, base64Data] = imageDataUrl.split(',');
            if (!header || !base64Data) throw new Error('Formato de imagem inválido.');
            const mimeType = header.match(/:(.*?);/)?.[1];
            if (!mimeType) throw new Error('Não foi possível determinar o tipo MIME da imagem.');

            const imagePart: FileDataPart = { inlineData: { data: base64Data, mimeType } };
            const textPart: TextPart = { text: `Analise esta imagem de uma refeição. Sua tarefa é retornar APENAS um objeto JSON com a estimativa de macronutrientes. ${jsonResponseInstruction('{ "calories": number, "carbs": number, "protein": number, "fat": number }')}` };
            
            response = await ai.models.generateContent({
                model,
                contents: { parts: [textPart, imagePart] },
                config: { responseMimeType: "application/json" }
            });
            return JSON.parse(response.text);

        case 'analyzeProgress':
            prompt = `Analise os dados de progresso do usuário e forneça um resumo motivacional com dicas. Fale diretamente com o usuário. ${userProfile}`;
            response = await ai.models.generateContent({ model, contents: prompt });
            return response.text;

        case 'generateShoppingList':
            prompt = `Crie uma lista de compras detalhada e organizada por categorias (ex: Frutas, Vegetais, Carnes) com base no seguinte plano alimentar semanal:\n${JSON.stringify(payload.weekPlan)}`;
            response = await ai.models.generateContent({ model, contents: prompt });
            return response.text;

        case 'getFoodInfo':
            prompt = `Responda à seguinte dúvida sobre alimentos de forma clara e concisa. Pergunta: "${payload.question}" ${payload.mealContext ? `Contexto da refeição: ${JSON.stringify(payload.mealContext)}` : ''}`;
            response = await ai.models.generateContent({ model, contents: prompt });
            return response.text;
        
        // --- JSON Actions ---
        default:
            let jsonInstructionFormat = '';
            let config = { responseMimeType: "application/json" };
            
            switch(action) {
                case 'parseMealPlanText':
                    prompt = `Converta o seguinte texto de um plano alimentar em um objeto JSON. ${jsonResponseInstruction('DailyPlan (definido no schema do app)')}\n\nTexto:\n${payload.text}`;
                    break;
                case 'regenerateDailyPlan':
                    prompt = `Com base no perfil do usuário, gere um novo plano alimentar para a data ${payload.currentPlan.date}. ${payload.numberOfMeals ? `O plano deve ter exatamente ${payload.numberOfMeals} refeições.` : ''} ${userProfile} ${jsonResponseInstruction('DailyPlan')}`;
                    break;
                case 'adjustDailyPlanForMacro':
                    prompt = `Ajuste este plano alimentar para se aproximar mais da meta de ${payload.macroToFix}. Mantenha as calorias totais o mais próximo possível da meta. Plano original:\n${JSON.stringify(payload.currentPlan)}\n${userProfile} ${jsonResponseInstruction('DailyPlan')}`;
                    break;
                case 'generateWeeklyPlan':
                    prompt = `Crie um plano alimentar para 7 dias, começando em ${new Date(payload.startDate).toISOString().split('T')[0]}. ${payload.observation ? `Observação: ${payload.observation}`: ''} ${userProfile} ${jsonResponseInstruction('Record<string, DailyPlan>')}`;
                    break;
                case 'regenerateMealFromPrompt':
                    prompt = `Regenere a refeição "${payload.meal.name}" com base na seguinte instrução: "${payload.prompt}". ${userProfile} ${jsonResponseInstruction('Meal')}`;
                    break;
                case 'analyzeMealFromText':
                    prompt = `Analise esta descrição de uma refeição e retorne uma estimativa dos macronutrientes. ${jsonResponseInstruction('{ "calories": number, "carbs": number, "protein": number, "fat": number }')}\n\nDescrição: ${payload.description}`;
                    break;
                case 'getFoodSubstitution':
                    prompt = `Sugira um substituto para o item "${payload.itemToSwap.name}" no contexto da refeição "${payload.mealContext.name}". O substituto deve ter macros similares. ${userProfile} ${jsonResponseInstruction('FoodItem')}`;
                    break;
                case 'findRecipes':
                    prompt = `Encontre ${payload.numRecipes} receitas com base na busca: "${payload.query}". Para cada receita, forneça um prompt de imagem otimizado para um gerador de imagens. ${userProfile} ${jsonResponseInstruction('Recipe[]')}`;
                    break;
                case 'analyzeActivityFromText':
                    prompt = `Analise o seguinte texto sobre uma atividade física e extraia o tipo, duração em minutos e calorias queimadas. ${jsonResponseInstruction('{ "type": string, "duration": number, "caloriesBurned": number }')}\n\nTexto: ${payload.description}`;
                    break;
                default:
                    throw new Error(`Ação desconhecida: ${action}`);
            }

            response = await ai.models.generateContent({ model, contents: prompt, config });
            return JSON.parse(response.text);
    }
}

// Helpers from netlify function
const buildUserProfile = (userData: any) => `
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

export default handler;
