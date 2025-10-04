import { Gender, ActivityLevel, UserMacros, DietDifficulty } from '../types';

interface CalculationParams {
    weight: number;
    height: number;
    age: number;
    gender: Gender;
    activityLevel: ActivityLevel;
    weightGoal: number;
    dietDifficulty: DietDifficulty;
}

export const calculateNewMacroGoals = ({
    weight,
    // height, age, gender, activityLevel are no longer used but kept for type compatibility
    weightGoal,
    dietDifficulty
}: CalculationParams): UserMacros => {
    
    // Step 1: Calculate Maintenance Calories (TDEE)
    // TDEE = peso × 30 (para atividade moderada).
    const tdee = weight * 30;
    
    const objective: 'lose' | 'gain' | 'maintain' = 
        weight > weightGoal ? 'lose' :
        weight < weightGoal ? 'gain' :
        'maintain';

    // Step 2: Determine Calorie Goal based on Objective and Difficulty
    let calorieGoal = tdee;

    if (objective === 'lose') {
        switch (dietDifficulty) {
            case 'easy':
                calorieGoal = tdee * 0.88; // –12%
                break;
            case 'normal':
                calorieGoal = tdee * 0.80; // –20%
                break;
            case 'athlete':
                calorieGoal = tdee * 0.70; // –30%
                break;
        }
    } else if (objective === 'gain') {
        switch (dietDifficulty) {
            case 'easy':
                calorieGoal = tdee * 1.10; // +10%
                break;
            case 'normal':
                calorieGoal = tdee * 1.15; // +15%
                break;
            case 'athlete':
                calorieGoal = tdee * 1.20; // +20%
                break;
        }
    }
    // For 'maintain', calorieGoal remains tdee

    // Step 3: Set Protein goal based on body weight (g/kg).
    let proteinPerKg: number;
    if (objective === 'lose') {
        switch (dietDifficulty) {
            case 'easy':
                proteinPerKg = 1.6;
                break;
            case 'normal':
                proteinPerKg = 2.0;
                break;
            case 'athlete':
                proteinPerKg = 2.2;
                break;
        }
    } else { // 'gain' or 'maintain', spec says 1.6-2.0 g/kg
        switch (dietDifficulty) {
            case 'easy':
                proteinPerKg = 1.6;
                break;
            case 'normal':
                proteinPerKg = 1.8;
                break;
            case 'athlete':
                proteinPerKg = 2.0;
                break;
        }
    }
    const proteinGoalInGrams = Math.round(weight * proteinPerKg);
    const caloriesFromProtein = proteinGoalInGrams * 4;

    // Step 4: Set Fat goal based on a percentage of total calories.
    let fatPercentage: number;
    switch (dietDifficulty) {
        case 'easy':
            fatPercentage = 0.30; // 30%
            break;
        case 'normal':
            fatPercentage = 0.27; // 25–27%
            break;
        case 'athlete':
            fatPercentage = 0.25; // 20–25%
            break;
    }
    const caloriesFromFat = calorieGoal * fatPercentage;
    const fatGoalInGrams = Math.round(caloriesFromFat / 9);

    // Step 5: Calculate Carbs from the remaining calories
    const remainingCaloriesForCarbs = calorieGoal - caloriesFromProtein - (fatGoalInGrams * 9);
    const carbGoalInGrams = Math.round(Math.max(0, remainingCaloriesForCarbs) / 4);
    
    // Step 6: Recalculate final calorie goal to match the sum of macros, correcting for rounding.
    const finalCalorieGoal = (proteinGoalInGrams * 4) + (carbGoalInGrams * 4) + (fatGoalInGrams * 9);

    return {
        calories: { current: 0, goal: finalCalorieGoal },
        carbs: { current: 0, goal: carbGoalInGrams },
        protein: { current: 0, goal: proteinGoalInGrams },
        fat: { current: 0, goal: fatGoalInGrams },
    };
};
