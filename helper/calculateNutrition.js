function calculateNutrition({ weight, height, age, gender, goal }) {
    let BMR;
    if (gender === 'male') {
        BMR = 10 * weight + 6.25 * height - 5 * age + 5;
    } else if (gender === 'female') {
        BMR = 10 * weight + 6.25 * height - 5 * age - 161;
    } else {
        throw new Error('Invalid gender specified.');
    }

    let calories = BMR * 1.2;

    if (goal === 'lose') {
        calories -= 500;
    } else if (goal === 'gain') {
        calories += 500;
    }

    calories = Math.round(calories);

    const proteinCalories = calories * 0.3;
    const carbsCalories = calories * 0.4;
    const fatsCalories = calories * 0.3;

    const proteinGrams = Math.round(proteinCalories / 4);
    const carbsGrams = Math.round(carbsCalories / 4);
    const fatsGrams = Math.round(fatsCalories / 9);

    return {
        calories,
        proteinGrams,
        carbsGrams,
        fatsGrams
    };
}

module.exports = calculateNutrition;