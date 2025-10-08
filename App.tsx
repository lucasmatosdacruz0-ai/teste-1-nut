

import React, { useState, useEffect, useCallback, FC } from 'react';
import { View, UserData, UserDataHandlers, Message, DailyPlan, Recipe, RecipesViewState, NotificationState, UpsellModalState, PlanKey, DietDifficulty, MacroData, FoodItem, Meal, ActivityLog } from './types';
import OnboardingFlow from './components/OnboardingFlow';
import LoginView from './components/LoginView';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import Dashboard from './components/Dashboard';
import ChatView from './components/ChatView';
import PlanoAlimentarView from './components/PlanoAlimentarView';
import ErrorBoundary from './components/ErrorBoundary';
import FavoritesView from './components/FavoritesView';
import ProgressView from './components/ProgressView';
import ProfileView from './components/ProfileView';
import FeaturesView from './components/FeaturesView';
import RecipesView from './components/RecipesView';
import AdminView from './components/AdminView';
import AchievementsView from './components/AchievementsView';
import ManageSubscriptionView from './components/ManageSubscriptionView';
import AtividadesView from './components/AtividadesView';
import SubscriptionBlockView from './components/SubscriptionBlockView';
import SubscriptionModal from './components/SubscriptionModal';
import UpsellModal from './components/UpsellModal';
import ShoppingListModal from './components/ShoppingListModal';
import FlameOverlay from './components/FlameOverlay';
import Tutorial from './components/Tutorial';
import StartTutorialModal from './components/StartTutorialModal';

import { ChatIcon, HomeIcon } from './components/icons';

import * as geminiService from './services/geminiService';
import { calculateNewMacroGoals } from './components/calculations';
import { sanitizeDailyPlan, sanitizeMeal } from './components/utils/sanitizers';
import { calculateXPForLevel } from './components/utils/xpUtils';
import { ALL_ACHIEVEMENTS } from './constants/achievements';
import { TUTORIAL_STEPS } from './constants/tutorialSteps';
import { PLANS, ALL_FEATURES } from './constants/plans';

export const defaultUserData: Omit<UserData, 'email'> = {
    isRegistered: false,
    name: '', profilePicture: null,
    age: 30, gender: 'male', height: 175, activityLevel: 'sedentary',
    initialWeight: 75, weight: 75, weightHistory: [], weightGoal: 70,
    water: 0, waterGoal: 2.5,
    waterReminders: { enabled: false, times: [] },
    mealReminders: { enabled: false },
    macros: {
        calories: { current: 0, goal: 2000 },
        carbs: { current: 0, goal: 250 },
        protein: { current: 0, goal: 150 },
        fat: { current: 0, goal: 67 }
    },
    dietaryPreferences: { diets: [], restrictions: [] },
    dietDifficulty: 'normal',
    streak: 0, completedDays: [],
    achievements: [], hasGeneratedPlan: false,
    level: 1, xp: 0,
    waterStreak: 0, totalRecipesGenerated: 0, imagesGeneratedCount: 0,
    athleteModeUsed: false, perfectDaysCount: 0, featuredAchievementId: null,
    hasCompletedTutorial: false, isSubscribed: false, trialEndDate: '',
    freeImagesGenerated: 0, currentPlan: null, billingCycle: null,
    dailyUsage: { date: '', dailyPlanGenerations: 0, dayRegenerations: 0, chatImports: 0, macroAdjustments: 0, progressAnalyses: 0, chatInteractions: 0, itemSwaps: 0, mealAnalysesText: 0, mealAnalysesImage: 0 },
    weeklyUsage: { weekStartDate: '', weeklyPlanGenerations: 0, shoppingLists: 0, recipeSearches: 0, imageGen: 0 },
    activityLogs: [],
};

const App: FC = () => {
    // Core State
    const [allUsers, setAllUsers] = useState<Record<string, UserData>>({});
    const [activeUserEmail, setActiveUserEmail] = useState<string | null>(null);
    const [isDataLoaded, setIsDataLoaded] = useState(false);
    const [activeView, setActiveView] = useState<View>('Dashboard');
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    const userData = activeUserEmail ? allUsers[activeUserEmail] : null;

    // Feature State
    const [mealPlan, setMealPlan] = useState<Record<string, DailyPlan> | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [lastMealPlanText, setLastMealPlanText] = useState<string | null>(null);
    const [favoritePlans, setFavoritePlans] = useState<DailyPlan[]>([]);
    const [favoriteRecipes, setFavoriteRecipes] = useState<Recipe[]>([]);
    const [recipesViewState, setRecipesViewState] = useState<RecipesViewState>({ activeTab: 'search', query: '', recipes: [], recipeImageCache: {} });
    const [shoppingListContent, setShoppingListContent] = useState<string | null>(null);

    // UI State
    const [notification, setNotification] = useState<NotificationState>(null);
    const [isPlanProcessing, setIsPlanProcessing] = useState(false);
    const [showFlame, setShowFlame] = useState(false);
    const [isSubscriptionModalOpen, setSubscriptionModalOpen] = useState(false);
    const [upsellModalState, setUpsellModalState] = useState<UpsellModalState>({ isOpen: false, featureKey: null, featureText: null });
    
    // Tutorial State
    const [tutorialState, setTutorialState] = useState({ isActive: false, stepIndex: 0, isInitialModalOpen: false });
    
    // --- LIFECYCLE & DATA PERSISTENCE ---
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        try {
            const savedUsers = localStorage.getItem('nutribot-users');
            const savedActiveUser = localStorage.getItem('nutribot-active-user-email');

            const allUsersData = savedUsers ? JSON.parse(savedUsers) : {};
            setAllUsers(allUsersData);

            if (savedActiveUser && allUsersData[savedActiveUser]) {
                 setActiveUserEmail(savedActiveUser);
            }
        } catch (error) {
            console.error("Failed to load user data from localStorage", error);
            localStorage.clear();
        } finally {
            setIsDataLoaded(true);
        }
    }, []);

    const saveDataToLocalStorage = useCallback((key: string, data: any) => {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            console.error(`Failed to save ${key} to localStorage`, error);
        }
    }, []);

    useEffect(() => {
        if (activeUserEmail) {
            try {
                const userSpecificData = localStorage.getItem(`nutribot-data-${activeUserEmail}`);
                if (userSpecificData) {
                    const { mealPlan, messages, favoritePlans, favoriteRecipes, recipeImageCache } = JSON.parse(userSpecificData);
                    setMealPlan(mealPlan || null);
                    setMessages(messages || []);
                    setFavoritePlans(favoritePlans || []);
                    setFavoriteRecipes(favoriteRecipes || []);
                    setRecipesViewState(prev => ({...prev, recipeImageCache: recipeImageCache || {}}));
                } else {
                    // Reset if no specific data found
                    setMealPlan(null);
                    setMessages([]);
                    setFavoritePlans([]);
                    setFavoriteRecipes([]);
                    setRecipesViewState(prev => ({...prev, recipeImageCache: {}}));
                }

                if (userData && !userData.hasCompletedTutorial && userData.isRegistered) {
                     setTutorialState(prev => ({ ...prev, isInitialModalOpen: true }));
                }

            } catch (error) {
                 console.error("Failed to load user-specific data", error);
            }
        }
    }, [activeUserEmail, userData?.isRegistered, userData?.hasCompletedTutorial]);

    
    useEffect(() => {
        saveDataToLocalStorage('nutribot-users', allUsers);
    }, [allUsers, saveDataToLocalStorage]);

    useEffect(() => {
        if (activeUserEmail) {
            localStorage.setItem('nutribot-active-user-email', activeUserEmail);
        } else {
            localStorage.removeItem('nutribot-active-user-email');
        }
    }, [activeUserEmail]);

    useEffect(() => {
        if (activeUserEmail) {
            const userSpecificData = {
                mealPlan,
                messages,
                favoritePlans,
                favoriteRecipes,
                recipeImageCache: recipesViewState.recipeImageCache
            };
            saveDataToLocalStorage(`nutribot-data-${activeUserEmail}`, userSpecificData);
        }
    }, [mealPlan, messages, favoritePlans, favoriteRecipes, recipesViewState.recipeImageCache, activeUserEmail, saveDataToLocalStorage]);


    // --- USAGE TRACKING ---
    const checkAndResetUsage = (data: UserData): UserData => {
        const today = new Date().toISOString().split('T')[0];
        const currentWeekStart = getStartOfWeek(new Date()).toISOString().split('T')[0];
        
        let updatedData = { ...data };
        
        if (data.dailyUsage?.date !== today) {
            updatedData.dailyUsage = { ...defaultUserData.dailyUsage, date: today };
        }
        if (data.weeklyUsage?.weekStartDate !== currentWeekStart) {
            updatedData.weeklyUsage = { ...defaultUserData.weeklyUsage, weekStartDate: currentWeekStart };
        }
        return updatedData;
    };

    const checkAndIncrementUsage = useCallback((featureKey: string, amount: number = 1): boolean => {
        if (!userData) return false;
        
        const isTrial = !userData.isSubscribed && new Date(userData.trialEndDate) > new Date();
        const planKey = isTrial ? 'pro' : (userData.isSubscribed && userData.currentPlan ? userData.currentPlan : 'basic');
        const plan = PLANS[planKey];
        if (!plan) return false;
        
        const feature = plan.features.find((f: any) => f.key === featureKey);
        if (!feature || feature.available === false) {
            setUpsellModalState({ isOpen: true, featureKey, featureText: (ALL_FEATURES as any)[featureKey]?.text });
            return false;
        }

        if (!feature.limit || feature.limit === Infinity) {
            return true; // Unlimited use
        }

        const isWeekly = feature.period === 'week';
        const usageData = isWeekly ? userData.weeklyUsage : userData.dailyUsage;
        const currentUsage = (usageData as any)[featureKey] || 0;
        const purchasedUsage = userData.purchasedUses?.[featureKey] || 0;

        if (currentUsage + amount > feature.limit + purchasedUsage) {
            setUpsellModalState({ isOpen: true, featureKey, featureText: (ALL_FEATURES as any)[featureKey]?.text });
            return false;
        }
        
        updateUserData({
            [isWeekly ? 'weeklyUsage' : 'dailyUsage']: { ...usageData, [featureKey]: currentUsage + amount },
        });

        return true;
    }, [userData]);


    // --- CORE HANDLERS ---
    const updateUserData = useCallback((data: Partial<UserData>) => {
        if (!activeUserEmail) return;
        setAllUsers(prev => ({
            ...prev,
            [activeUserEmail]: { ...prev[activeUserEmail], ...data }
        }));
    }, [activeUserEmail]);


    const addXP = useCallback((amount: number, reason: string) => {
        if (!userData) return;
        
        let newXp = userData.xp + amount;
        let newLevel = userData.level;
        let xpForNextLevel = calculateXPForLevel(newLevel);
        while (newXp >= xpForNextLevel) {
            newXp -= xpForNextLevel;
            newLevel += 1;
            xpForNextLevel = calculateXPForLevel(newLevel);
            // TODO: Add level up notification
        }
        updateUserData({ xp: newXp, level: newLevel });
        
        const newlyUnlocked = ALL_ACHIEVEMENTS.filter(ach => !userData.achievements.includes(ach.id));
        if (newlyUnlocked.length > 0) {
            // Re-evaluate achievements with new XP/level data
        }
    }, [userData, updateUserData]);


    const addWater = useCallback((amount: number) => {
        if (!userData) return;
        const newWaterTotal = Math.max(0, userData.water + amount);
        updateUserData({ water: newWaterTotal });
    }, [userData, updateUserData]);

    const handleLogMeal = useCallback((macros: MacroData) => {
        if (!userData) return;
        updateUserData({
            macros: {
                calories: { ...userData.macros.calories, current: userData.macros.calories.current + macros.calories },
                carbs: { ...userData.macros.carbs, current: userData.macros.carbs.current + macros.carbs },
                protein: { ...userData.macros.protein, current: userData.macros.protein.current + macros.protein },
                fat: { ...userData.macros.fat, current: userData.macros.fat.current + macros.fat },
            }
        });
    }, [userData, updateUserData]);

    const handleUpdateWeight = useCallback((newWeight: number) => {
        if (!userData) return;
        const today = new Date().toISOString();
        const newHistory = [...userData.weightHistory, { date: today, weight: newWeight }];
        updateUserData({ weight: newWeight, weightHistory: newHistory });
        addXP(25, 'weight_logged');
    }, [userData, updateUserData, addXP]);

    const handleChangeDietDifficulty = useCallback((difficulty: DietDifficulty) => {
        if (!userData) return;
        const newMacros = calculateNewMacroGoals({ ...userData, dietDifficulty: difficulty });
        
        let athleteModeUsed = userData.athleteModeUsed;
        if (difficulty === 'athlete' && !athleteModeUsed) {
            athleteModeUsed = true;
            addXP(50, 'athlete_mode_first_use');
        }

        updateUserData({ dietDifficulty: difficulty, macros: newMacros, athleteModeUsed });
        
        if (difficulty === 'athlete') {
            setShowFlame(true);
            setTimeout(() => setShowFlame(false), 2200);
        }
    }, [userData, updateUserData, addXP]);

    const handleMarkDayAsCompleted = useCallback(() => {
        if (!userData) return;
        const todayStr = new Date().toISOString().split('T')[0];
        if (userData.completedDays.includes(todayStr)) return;
        
        updateUserData({
            completedDays: [...userData.completedDays, todayStr],
            streak: userData.streak + 1,
        });
        addXP(50, 'day_completed');
    }, [userData, updateUserData, addXP]);

    const setFeaturedAchievement = useCallback((id: string | null) => {
        updateUserData({ featuredAchievementId: id });
    }, [updateUserData]);

    const handleLogActivity = useCallback((activity: Omit<ActivityLog, 'id' | 'date'>) => {
        if (!userData) return;
        const newLog: ActivityLog = {
            ...activity,
            id: Date.now().toString(),
            date: new Date().toISOString().split('T')[0],
        };
        const updatedLogs = [...userData.activityLogs, newLog];
        updateUserData({ activityLogs: updatedLogs });
        addXP(30, 'activity_logged');
    }, [userData, updateUserData, addXP]);
    
    // --- TUTORIAL HANDLERS ---
    const startTutorial = useCallback(() => {
        setTutorialState({ isActive: true, stepIndex: 0, isInitialModalOpen: false });
        setActiveView('Dashboard');
    }, []);

    const completeTutorial = useCallback(() => {
        updateUserData({ hasCompletedTutorial: true });
        setTutorialState({ isActive: false, stepIndex: 0, isInitialModalOpen: false });
    }, [updateUserData]);
    
    // --- PLAN & AI HANDLERS ---
    const processPlanGeneration = async (
        serviceCall: () => Promise<any>,
        featureKey: string,
        onSuccess: (result: any) => void
    ) => {
        if (!checkAndIncrementUsage(featureKey)) return;
        setIsPlanProcessing(true);
        setNotification({ type: 'loading', message: 'Gerando plano com IA...' });
        try {
            const result = await serviceCall();
            onSuccess(result);
            setNotification({ type: 'success', message: 'Plano gerado com sucesso!' });
        } catch (e) {
            setNotification({ type: 'error', message: e instanceof Error ? e.message : 'Erro ao gerar plano.' });
        } finally {
            setIsPlanProcessing(false);
            setTimeout(() => setNotification(null), 3000);
        }
    };

    const generateWeeklyPlan = useCallback(async (startDate: Date, observation?: string) => {
        if (!userData) return;
        await processPlanGeneration(
            () => geminiService.generateWeeklyPlan(userData, startDate, observation),
            'weeklyPlanGenerations',
            (newPlan: Record<string, DailyPlan>) => setMealPlan(prev => ({...prev, ...newPlan }))
        );
    }, [userData]);
    
    const generateDailyPlan = useCallback(async (date: Date) => {
        if (!userData) return;
        await processPlanGeneration(
            () => geminiService.regenerateDailyPlan(userData, { date: date.toISOString().split('T')[0] } as DailyPlan),
            'dailyPlanGenerations',
            (newPlan: DailyPlan) => {
                 const sanitized = sanitizeDailyPlan(newPlan);
                 if (sanitized) {
                    setMealPlan(prev => ({ ...prev, [sanitized.date]: sanitized }));
                    updateUserData({ hasGeneratedPlan: true });
                    addXP(20, 'plan_generated');
                 } else {
                    throw new Error("A IA retornou um formato de plano inválido.");
                 }
            }
        );
    }, [userData, updateUserData, addXP]);
    
    const importPlanFromChat = useCallback(async (text: string) => {
        await processPlanGeneration(
            () => geminiService.parseMealPlanText(text),
            'chatImports',
            (newPlan: DailyPlan) => {
                const sanitized = sanitizeDailyPlan(newPlan);
                if (sanitized) {
                    setMealPlan(prev => ({ ...prev, [sanitized.date]: sanitized }));
                    setActiveView('Dieta');
                } else {
                    throw new Error("A IA retornou um formato de plano inválido.");
                }
            }
        );
    }, [setActiveView]);

    const regenerateDay = useCallback(async (date: string, mealCount?: number) => {
        if (!userData || !mealPlan?.[date]) return;
        await processPlanGeneration(
            () => geminiService.regenerateDailyPlan(userData, mealPlan[date], mealCount),
            'dayRegenerations',
            (newPlan: DailyPlan) => {
                 const sanitized = sanitizeDailyPlan(newPlan);
                 if(sanitized) setMealPlan(prev => ({ ...prev, [date]: sanitized }));
            }
        );
    }, [userData, mealPlan]);
    
    const adjustDayForMacro = useCallback(async (date: string, macro: keyof Omit<MacroData, 'calories'>) => {
        if (!userData || !mealPlan?.[date]) return;
        await processPlanGeneration(
            () => geminiService.adjustDailyPlanForMacro(userData, mealPlan[date], macro),
            'macroAdjustments',
            (newPlan: DailyPlan) => {
                const sanitized = sanitizeDailyPlan(newPlan);
                if(sanitized) setMealPlan(prev => ({ ...prev, [date]: sanitized }));
            }
        );
    }, [userData, mealPlan]);
    
    const regenerateMeal = useCallback(async (date: string, mealId: string, prompt: string) => {
        if (!userData || !mealPlan?.[date]) return;
        const mealToRegen = mealPlan[date].meals.find(m => m.id === mealId);
        if (!mealToRegen) return;

        await processPlanGeneration(
            () => geminiService.regenerateMealFromPrompt(prompt, mealToRegen, userData),
            'itemSwaps', // Uses same quota as item swaps
            (newMealData: Meal) => {
                const sanitizedNewMeal = sanitizeMeal(newMealData);
                if (!sanitizedNewMeal) throw new Error("A IA retornou um formato de refeição inválido.");

                const updatedMeals = mealPlan[date].meals.map(m => m.id === mealId ? { ...sanitizedNewMeal, id: mealId } : m);
                const updatedPlan = { ...mealPlan[date], meals: updatedMeals };
                const sanitizedUpdatedPlan = sanitizeDailyPlan(updatedPlan);
                if (sanitizedUpdatedPlan) {
                    setMealPlan(prev => ({ ...prev, [date]: sanitizedUpdatedPlan }));
                }
            }
        );
    }, [userData, mealPlan]);

    const handleSwapItem = useCallback(async (date: string, mealId: string, itemToSwap: FoodItem) => {
        if (!userData || !mealPlan?.[date]) return;
        const mealContext = mealPlan[date].meals.find(m => m.id === mealId);
        if (!mealContext) return;
        
        await processPlanGeneration(
            () => geminiService.getFoodSubstitution(itemToSwap, mealContext, userData),
            'itemSwaps',
            (newItem: FoodItem) => {
                const updatedMeals = mealPlan[date].meals.map(m => {
                    if (m.id === mealId) {
                        return { ...m, items: m.items.map(i => i.name === itemToSwap.name ? newItem : i) };
                    }
                    return m;
                });
                const updatedPlan = { ...mealPlan[date], meals: updatedMeals };
                const sanitizedUpdatedPlan = sanitizeDailyPlan(updatedPlan);
                 if (sanitizedUpdatedPlan) {
                    setMealPlan(prev => ({ ...prev, [date]: sanitizedUpdatedPlan }));
                }
            }
        );
    }, [userData, mealPlan]);

    const updateMeal = useCallback((date: string, updatedMeal: Meal) => {
        setMealPlan(prev => {
            if (!prev || !prev[date]) return prev;
            const updatedMeals = prev[date].meals.map(m => m.id === updatedMeal.id ? updatedMeal : m);
            const updatedPlan = { ...prev[date], meals: updatedMeals };
            const sanitized = sanitizeDailyPlan(updatedPlan);
            return sanitized ? { ...prev, [date]: sanitized } : prev;
        });
    }, []);

    const generateShoppingList = useCallback(async (weekPlan: DailyPlan[]) => {
        if (weekPlan.length === 0) {
            setNotification({ type: 'info', message: 'Nenhum plano na semana para gerar a lista.' });
            setTimeout(() => setNotification(null), 3000);
            return;
        }
        await processPlanGeneration(
            () => geminiService.generateShoppingList(weekPlan),
            'shoppingLists',
            (list: string) => setShoppingListContent(list)
        );
    }, []);
    
    const handleChatSendMessage = useCallback(async (message: string) => {
        if(!checkAndIncrementUsage('chatInteractions')) {
            async function* emptyGenerator() { yield* []; }
            return emptyGenerator();
        }
        const history = messages.slice(-10);
        const stream = geminiService.sendMessageToAI(message, history);
        setLastMealPlanText(null);
        return stream;
    }, [messages, checkAndIncrementUsage]);

    const handleAnalyzeMeal = useCallback(async (data: { description?: string; imageDataUrl?: string }) => {
        if (data.imageDataUrl) {
            if(!checkAndIncrementUsage('mealAnalysesImage')) throw new Error("Limite de análise de imagem atingido.");
            return await geminiService.analyzeMealFromImage(data.imageDataUrl);
        } else if (data.description) {
            if(!checkAndIncrementUsage('mealAnalysesText')) throw new Error("Limite de análise de texto atingido.");
            return await geminiService.analyzeMealFromText(data.description);
        }
        throw new Error("Nenhuma descrição ou imagem fornecida.");
    }, [checkAndIncrementUsage]);

    const handleAnalyzeProgress = useCallback(async () => {
        if(!checkAndIncrementUsage('progressAnalyses') || !userData) {
            throw new Error("Limite de análise de progresso atingido.");
        }
        return await geminiService.analyzeProgress(userData);
    }, [userData, checkAndIncrementUsage]);
    
    const getFoodInfo = useCallback(async (question: string, mealContext?: Meal) => {
        if(!checkAndIncrementUsage('chatInteractions')) {
            throw new Error("Limite de interações com o chat atingido.");
        }
        return await geminiService.getFoodInfo(question, mealContext);
    }, [checkAndIncrementUsage]);
    
    // --- SUBSCRIPTION ---
    const handleSubscription = useCallback((plan: PlanKey, billingCycle: 'monthly' | 'annual') => {
        updateUserData({
            isSubscribed: true,
            currentPlan: plan,
            billingCycle: billingCycle,
        });
        setSubscriptionModalOpen(false);
        addXP(200, 'subscribed_pro');
    }, [updateUserData, addXP]);

    // --- FAVORITES ---
    const handleToggleFavoritePlan = useCallback((plan: DailyPlan) => {
        setFavoritePlans(prev => 
            prev.some(p => p.date === plan.date) 
                ? prev.filter(p => p.date !== plan.date)
                : [...prev, plan]
        );
    }, []);

    const handleToggleFavoriteRecipe = useCallback((recipe: Recipe) => {
        setFavoriteRecipes(prev => 
            prev.some(r => r.id === recipe.id) 
                ? prev.filter(r => r.id !== recipe.id)
                : [...prev, recipe]
        );
    }, []);

    const handleOnboardingComplete = useCallback((data: Partial<UserData>) => {
        const fullData: Partial<UserData> = {
            ...data,
            isRegistered: true,
            weightHistory: [{ date: new Date().toISOString().split('T')[0], weight: data.weight! }],
        };
        const updatedWithMacros = {
            ...fullData,
            macros: calculateNewMacroGoals(fullData as UserData), // a bit of type casting needed here
        }
        updateUserData(updatedWithMacros);
        setTutorialState(prev => ({ ...prev, isInitialModalOpen: true }));
    }, [updateUserData]);

    // --- AUTH HANDLERS ---
    const handleLogin = async (email: string, pass: string) => {
        if (allUsers[email]) {
            setActiveUserEmail(email);
            return { success: true, message: "Login bem-sucedido!" };
        }
        return { success: false, message: "Usuário não encontrado." };
    };

    const handleRegister = async (name: string, email: string, pass: string) => {
        if (allUsers[email]) {
            return { success: false, message: "Este email já está em uso." };
        }
        const trialEndDate = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + 7);
        const newUser: UserData = {
            ...defaultUserData,
            name,
            email,
            trialEndDate: trialEndDate.toISOString(),
        };
        setAllUsers(prev => ({ ...prev, [email]: newUser }));
        setActiveUserEmail(email);
        return { success: true, message: "Registro bem-sucedido!" };
    };

     const handleLogout = () => {
        if (window.confirm("Você tem certeza que quer sair?")) {
            setActiveUserEmail(null);
            // Also clear user-specific data to avoid carrying over to next login
            setMealPlan(null);
            setMessages([]);
            setFavoritePlans([]);
            setFavoriteRecipes([]);
            setRecipesViewState({ activeTab: 'search', query: '', recipes: [], recipeImageCache: {} });
        }
    };
    
    const handlers: UserDataHandlers = {
        updateUserData,
        addWater,
        handleLogMeal,
        handleUpdateWeight,
        handleChangeDietDifficulty,
        handleMarkDayAsCompleted,
        addXP,
        setFeaturedAchievement,
        startTutorial,
        generateWeeklyPlan,
        generateDailyPlan,
        importPlanFromChat,
        regenerateDay,
        adjustDayForMacro,
        regenerateMeal,
        updateMeal,
        generateShoppingList,
        handleSwapItem,
        handleSubscription,
        openSubscriptionModal: () => setSubscriptionModalOpen(true),
        handleChangeSubscription: (newPlan: PlanKey) => updateUserData({ currentPlan: newPlan }),
        handleCancelSubscription: () => updateUserData({ isSubscribed: false, currentPlan: null, billingCycle: null }),
        handlePurchaseFeaturePack: (featureKey: string, packSize: number) => {
            updateUserData({
                purchasedUses: {
                    ...(userData?.purchasedUses || {}),
                    [featureKey]: (userData?.purchasedUses?.[featureKey] || 0) + packSize,
                }
            });
            setUpsellModalState({ isOpen: false, featureKey: null, featureText: null });
            setNotification({ type: 'success', message: 'Pacote comprado com sucesso!' });
            setTimeout(() => setNotification(null), 3000);
        },
        checkAndIncrementUsage,
        handleChatSendMessage,
        handleAnalyzeMeal,
        handleAnalyzeProgress,
        getFoodInfo,
        handleLogin,
        handleRegister,
        handleLogout,
        handleLogActivity,
    };
    
    // --- RENDER LOGIC ---

    if (!isDataLoaded) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-100">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-green"></div>
            </div>
        );
    }
    
    if (!activeUserEmail) {
        return <LoginView onLogin={handleLogin} onRegister={handleRegister} />;
    }

    if (!userData) {
        // This case should ideally not happen if activeUserEmail is set, but as a fallback:
        handleLogout();
        return null;
    }

    if (!userData.isRegistered) {
        return <OnboardingFlow onComplete={handleOnboardingComplete} />;
    }
    
    const isTrialExpired = !userData.isSubscribed && new Date(userData.trialEndDate) <= new Date();
    if (isTrialExpired) {
        return <SubscriptionBlockView onOpenSubscriptionModal={() => setSubscriptionModalOpen(true)} />;
    }
    
    const themeClass = userData.dietDifficulty === 'athlete' ? 'theme-athlete' : 'theme-light';

    const renderActiveView = () => {
        switch (activeView) {
            case 'Dashboard': return <Dashboard userData={userData} handlers={handlers} setActiveView={setActiveView} mealPlan={mealPlan} />;
            case 'Chat IA': return <ChatView userData={userData} messages={messages} setMessages={setMessages} onNewMealPlanText={setLastMealPlanText} handlers={handlers} />;
            case 'Dieta': return <PlanoAlimentarView userData={userData} handlers={handlers} lastMealPlanText={lastMealPlanText} mealPlan={mealPlan} favoritePlans={favoritePlans} onToggleFavorite={handleToggleFavoritePlan} setActiveView={setActiveView} showNotification={setNotification} isPlanProcessing={isPlanProcessing} />;
            case 'Progresso': return <ProgressView userData={userData} handlers={handlers} />;
            case 'Favoritos': return <FavoritesView favoritePlans={favoritePlans} onToggleFavorite={handleToggleFavoritePlan} onUseToday={(plan) => { setMealPlan(p => ({...p, [new Date().toISOString().split('T')[0]]: plan})); setActiveView('Dieta'); }} onUpdateFavorite={(plan) => setFavoritePlans(fp => fp.map(p => p.date === plan.date ? plan : p))} />;
            case 'Recursos': return <FeaturesView setActiveView={setActiveView} />;
            case 'Receitas': return <RecipesView userData={userData} favoriteRecipes={favoriteRecipes} onToggleFavorite={handleToggleFavoriteRecipe} recipesViewState={recipesViewState} onStateChange={setRecipesViewState} onRecipesGenerated={(count) => updateUserData({ totalRecipesGenerated: userData.totalRecipesGenerated + count })} handlers={handlers} />;
            case 'Conta': return <ProfileView userData={userData} handlers={handlers} setActiveView={setActiveView} />;
            case 'Admin': return <AdminView userData={userData} handlers={handlers} setActiveView={setActiveView} />;
            case 'Conquistas': return <AchievementsView userData={userData} handlers={handlers} />;
            case 'Gerenciar Assinatura': return <ManageSubscriptionView userData={userData} handlers={handlers} setActiveView={setActiveView} />;
            case 'Atividades': return <AtividadesView userData={userData} handlers={handlers} />;
            default: return <Dashboard userData={userData} handlers={handlers} setActiveView={setActiveView} mealPlan={mealPlan} />;
        }
    };
    
    const FAB = () => (
      <button
        onClick={() => setActiveView(activeView === 'Dashboard' ? 'Chat IA' : 'Dashboard')}
        className={`dashboard-fab ${activeView === 'Dashboard' ? 'active' : ''}`}
        aria-label={activeView === 'Dashboard' ? 'Ir para o Chat' : 'Voltar para o Dashboard'}
      >
        <div className="icon">
          {activeView === 'Dashboard' ? <ChatIcon className="w-8 h-8" /> : <HomeIcon className="w-8 h-8" />}
        </div>
      </button>
    );

    return (
        <div className={`flex h-screen bg-slate-50 ${themeClass}`}>
            <Sidebar activeView={activeView} setActiveView={setActiveView} userData={userData} handlers={handlers} />
            <main className="flex-1 flex flex-col overflow-hidden relative pb-16 md:pb-0">
                <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                    <ErrorBoundary>
                        {renderActiveView()}
                    </ErrorBoundary>
                </div>
                {isMobile && <FAB />}
            </main>
            <BottomNav activeView={activeView} setActiveView={setActiveView} />

            {/* Global Modals & Overlays */}
            <FlameOverlay show={showFlame} />
            {shoppingListContent && <ShoppingListModal isOpen={!!shoppingListContent} onClose={() => setShoppingListContent(null)} content={shoppingListContent} />}
            {isSubscriptionModalOpen && <SubscriptionModal isOpen={isSubscriptionModalOpen} onClose={() => setSubscriptionModalOpen(false)} onSubscribe={handleSubscription} theme={themeClass} />}
            <UpsellModal {...upsellModalState} onClose={() => setUpsellModalState({ isOpen: false, featureKey: null, featureText: null })} onNavigateToSubscription={() => { setUpsellModalState({ isOpen: false, featureKey: null, featureText: null }); setActiveView('Gerenciar Assinatura'); }} onPurchaseFeaturePack={handlers.handlePurchaseFeaturePack} />
            <StartTutorialModal isOpen={tutorialState.isInitialModalOpen} onStart={startTutorial} onSkip={() => { setTutorialState(prev => ({...prev, isInitialModalOpen: false})); updateUserData({ hasCompletedTutorial: true }); }} />
            <Tutorial 
                isActive={tutorialState.isActive}
                stepIndex={tutorialState.stepIndex}
                onNext={() => {
                    const nextStepIndex = tutorialState.stepIndex + 1;
                    if (nextStepIndex >= TUTORIAL_STEPS.length) {
                        completeTutorial();
                    } else {
                        const nextView = TUTORIAL_STEPS[nextStepIndex].view;
                        if (nextView !== activeView) setActiveView(nextView);
                        setTutorialState(prev => ({ ...prev, stepIndex: nextStepIndex }));
                    }
                }}
                onPrev={() => {
                    const prevStepIndex = tutorialState.stepIndex - 1;
                    if (prevStepIndex >= 0) {
                        const prevView = TUTORIAL_STEPS[prevStepIndex].view;
                        if (prevView !== activeView) setActiveView(prevView);
                        setTutorialState(prev => ({ ...prev, stepIndex: prevStepIndex }));
                    }
                }}
                onSkip={completeTutorial}
                isMobile={isMobile}
            />

            {notification && (
                <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] px-4 py-3 rounded-lg shadow-lg animate-slideInUp text-white font-semibold flex items-center gap-3" style={{ backgroundColor: notification.type === 'error' ? '#E53E3E' : notification.type === 'success' ? '#38A169' : '#3182CE' }}>
                    {notification.message}
                </div>
            )}
        </div>
    );
};

function getStartOfWeek(date: Date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

export default App;