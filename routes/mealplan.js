const express = require('express');
const axios = require('axios');
const db = require('../db');
const router = express.Router();

router.get('/generate-weekly-plan', async (req,res) => {

    const userId = parseInt(req.query.user_id);
    const startDate = req.query.start_date ? new Date(req.query.start_date) : new Date();

    if (!userId) return res.status(400).send('Missing user_id');

    const [userRows] = await db.promise().query(
        'SELECT weight, height, age, gender, goal FROM users WHERE user_id = ?',
        [userId]
    );
    if (userRows.length === 0) {
        return res.status(404).send('User not found');
    }
    const { weight, height, age, gender, goal } = userRows[0];

    if (!weight || !height || !age || !gender || !goal) {
        return res.status(400).send('Missing required user data (weight, height, age, gender, or goal)');
    }

    console.log('User data for meal plan:', { weight, height, age, gender, goal});

    
    let bmr = (10 * weight) + (6.25 * height) - (5 * age) + (gender === 'male' ? 5 : -161);
    let targetCalories = bmr;
    if (goal === 'lose') targetCalories -= 500;
    if (goal === 'gain') targetCalories += 500;

    console.log('Calculated BMR:', bmr, 'Target calories:', targetCalories);

    await db.promise().query(
        'DELETE FROM meal_plans WHERE user_id = ?',
        [userId]
    );

    try {
        const response = await axios.get('https://api.spoonacular.com/mealplanner/generate', {
            params: { 
                timeFrame: 'week',
                targetCalories: Math.round(targetCalories),
                apiKey: process.env.SPOONACULAR_API_KEY
            }
        });
        const mealPlan = response.data.week;


        const parseValue = (val) => {
            console.log('Parsing value:', val, 'Type', typeof val);
            if (!val) return 0;

            if (typeof val === 'number') return val;

            if (typeof val === 'string'){
            return parseFloat(val.replace(/[^\d.]/g, '')) ||0;
            }

            return 0;
        }

        const mealTypes = ['breakfast', 'lunch', 'dinner'];

        for (let dayOffset = 0; dayOffset< 7; dayOffset++) {
            const dayKey = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][dayOffset];
            const date = new Date(startDate);
            date.setDate(date.getDate() + dayOffset);

            const meals = mealPlan[dayKey]?.meals || [];

            for (let i = 0; i < meals.length; i++ ) {
                const meal = meals[i];
                const mealType = mealTypes[i] || 'snack';
                
                const {
                    id: api_recipe_id,
                    title,
                    imageType,
                    readyInMinutes,
                } = meal;

                const image = `https://spoonacular.com/recipeImages/${api_recipe_id}-480x360.${imageType}`;

                const [existingRecipeRows] = await db.promise().query('SELECT recipe_id FROM recipes WHERE api_recipe_id = ?', [api_recipe_id]);
                let recipe_id;

                if (existingRecipeRows.length === 0) {
                    const insertRecipeSql = `INSERT INTO recipes (api_recipe_id, rec_name, instructions, image_url, prep_time, cook_time) VALUES (?, ?, ?, ?, ?, ?)`;
                    await db.promise().query(insertRecipeSql, [api_recipe_id, title, '', image, readyInMinutes, 0]);

                    const nutritionRes = await axios.get (`https://api.spoonacular.com/recipes/${api_recipe_id}/nutritionWidget.json`, {
                        params: { apiKey: process.env.SPOONACULAR_API_KEY }
                    });

                    console.log('Nutrition data from Spoonacular:', nutritionRes.data);

                    const { calories, protein, carbohydrates: carbs, fat: fats } = nutritionRes.data;
                    const nutritionSql = `INSERT INTO nutrition (api_recipe_id, calories, protein, carbs, fats) VALUES (?, ?, ?, ?, ?)`;
                    await db.promise().query(nutritionSql,[
                        api_recipe_id,
                        parseValue(calories),
                        parseValue(protein),
                        parseValue(carbs),
                        parseValue(fats)
                    ]);

                    console.log('Nutrition data from Spoonacular:', JSON.stringify(nutritionRes.data, null, 2));
                    console.log('Carbs value', nutritionRes.data.carbohydrates);

                    const [newRecipeRows] = await db.promise().query('SELECT recipe_id FROM recipes WHERE api_recipe_id = ?', [api_recipe_id]);
                    recipe_id = newRecipeRows[0].recipe_id;
                } else {
                    recipe_id = existingRecipeRows[0].recipe_id;
                }

                const [nutritionRows] = await db.promise().query(
                    'SELECT api_recipe_id from nutrition Where api_recipe_id = ?',
                    [api_recipe_id]
                );
                if (nutritionRows.length === 0 ) {
                    console.warn(`Skipping meal: no nutrition data for api_recipe_id ${api_recipe_id}`);
                    continue;
                }

                const mealSql = `INSERT INTO meal_plans (user_id, recipe_id, meal_date, meal_type, calories, protein, carbs, fats) SELECT ?, ?, ?, ?, n.calories, n.protein, n.carbs, n.fats FROM nutrition n WHERE n.api_recipe_id = ?`;

                await db.promise().query(mealSql, [
                    userId,
                    recipe_id,
                    date.toISOString().split('T')[0],
                    mealType,
                    api_recipe_id
                ]);
            }
        }

        
        res.send('Weekly meal plan generated and saved');
    } catch (err) {
        console.error('Meal plan generation error:', err);
        res.status(500).send('Failed to generate meal plan.');

    }
});

router.get('/user/:userId', async (req,res) => {

    const {userId} = req.params;

    try {
        const [rows] = await db.promise().query(
            `SELECT meal_plans.plan_id, meal_plans.meal_date, meal_plans.meal_type, meal_plans.calories, meal_plans.protein, meal_plans.carbs, meal_plans.fats, r.rec_name, r.image_url 
            FROM meal_plans 
            JOIN recipes r ON meal_plans.recipe_id = r.recipe_id 
            WHERE meal_plans.user_id = ? 
            ORDER BY meal_plans.meal_date ASC, FIELD(meal_plans.meal_type, 'breakfast', 'lunch', 'dinner')`,
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'No meal plan found for this user.' });
        }

        res.json(rows);
    } catch (err) {
        console.error('Error fetching meal plan:', err);
        res.status(500).json({ message: 'Failed to fetch meal plan.' });
    }
});

router.get('/recipe/:planId', async (req, res) => {
    const { planId } = req.params;

    try {
        const [rows] = await db.promise().query(
            `SELECT r.recipe_id, r.api_recipe_id, r.rec_name, r.image_url, r.instructions, n.calories, n.protein, n.carbs, n.fats
             FROM meal_plans mp
             JOIN recipes r ON mp.recipe_id = r.recipe_id
             LEFT JOIN nutrition n ON r.api_recipe_id = n.api_recipe_id
             WHERE mp.plan_id = ?`,
            [planId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Recipe not found for this plan.' });
        }

        const recipe = rows[0];

        console.log('Retrieved recipe:', recipe);

        if (!recipe.instructions || recipe.instructions === '') {
            try {
                console.log('Fetching instructions from API for ID:', recipe.api_recipe_id);
                const infoResponse = await axios.get(`https://api.spoonacular.com/recipes/${recipe.api_recipe_id}/information`, {
                    params: { apiKey: process.env.SPOONACULAR_API_KEY }
                });

                recipe.instructions = infoResponse.data.instructions || 'No instructions available';


                await db.promise().query(
                    'UPDATE recipes SET instructions = ? WHERE api_recipe_id = ?',
                    [recipe.instructions, recipe.api_recipe_id]
                );
                
                if (infoResponse.data.extendedIngredients && infoResponse.data.extendedIngredients.length > 0) {
                    const [existingIngredients] = await db.promise().query(
                        'SELECT COUNT(*) as count FROM recipe_ingredients WHERE api_recipe_id = ?',
                        [recipe.api_recipe_id]
                    );
                    
                    if (existingIngredients[0].count === 0) {
                        for (const ingredientObj of infoResponse.data.extendedIngredients) {
                            await db.promise().query(
                                'INSERT INTO recipe_ingredients (api_recipe_id, ingredient) VALUES (?, ?)',
                                [recipe.api_recipe_id, ingredientObj.original]
                            );
                        }
                    }
                }
            } catch (error) {
                console.error('Error fetching recipe details from API:', error);
                recipe.instructions = 'No instructions available. Could not fetch from API.';
            }
        }

        const [ingredientsRows] = await db.promise().query(
            'SELECT ingredient FROM recipe_ingredients WHERE api_recipe_id = ?',
            [recipe.api_recipe_id]
        );
        recipe.ingredients = ingredientsRows.map(row => row.ingredient);

        console.log('Ingredients found:, recipe.ingredients.length');

        res.json({
            rec_name: recipe.rec_name,
            image_url: recipe.image_url,
            instructions: recipe.instructions || 'No instructions available',
            calories: recipe.calories || 0,
            protein: recipe.protein || 0,
            carbs: recipe.carbs || 0,
            fats: recipe.fats || 0,
            ingredients: recipe.ingredients || []
        });
    } catch (err) {
        console.error('Error fetching recipe:', err);
        res.status(500).json({ message: 'Failed to fetch recipe details.' });
    }
});

router.post('/generate-daily-guest', async (req, res) => {
    const { height, weight, age, gender, goal } = req.body;

    if (!height || !weight || !age || !gender || !goal) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    const heightNum = parseFloat(height);
    const weightNum = parseFloat(weight);
    const ageNum = parseInt(age);
    
    let bmr = (10 * weightNum) + (6.25 * heightNum) -(5 * ageNum) + (gender === 'male' ? 5 : -161);
    let targetCalories = bmr;
    if (goal === 'lose') targetCalories -= 500;
    if (goal === 'gain') targetCalories += 500;

    try {
        const response = await axios.get('https://api.spoonacular.com/mealplanner/generate', {
            params: {
                timeFrame: 'day',
                targetCalories: Math.round(targetCalories),
                apiKey: process.env.SPOONACULAR_API_KEY
            }
        });
        res.json(response.data)
        } catch (err) {
            console.error('Guest meal plan error:', err);
            res.status(500).json({ message: 'Failed to generate guest meal plan' });
        }
});

router.get('/trending', async (req, res) => {
    try {
      const [rows] = await db.promise().query(
        'SELECT * FROM meal_plans ORDER BY RAND() LIMIT 6'
      );
      
      res.json(rows);
    } catch (err) {
      console.error('Error fetching trending recipes:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

module.exports = router;