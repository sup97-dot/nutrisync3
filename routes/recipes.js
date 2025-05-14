require('dotenv').config();
const express = require('express');
const axios = require('axios');
const db = require('../db');
const router = express.Router();




router.get('/fetch-recipe', async (req, res) => {
    try {
        const response = await axios.get('https://api.spoonacular.com/recipes/complexSearch', {
            params: {
                number: 21,
                type: 'main course, breakfast, snack',
                minCalories: 200,
                maxCalories: 1000,
                addRecipeInformation: true,
                sort: 'random',
                apiKey: process.env.SPOONACULAR_API_KEY
            }
        });
        
        if (!response.data || !response.data.results || response.data.results.length === 0){
            return res.status(404).send('No suitable recipe found');
        }

        const recipe = response.data.results[0];
        
        let insertedCount = 0;
        for (const recipe of response.data.results) {
            const {
                id,
                title,
                image,
                preparationMinutes,
                cookingMinutes,
            } = recipe;

            let instructions = '';

            try {
                const infoResponse = await axios.get(`https://api.spoonacular.com/recipes/${id}/information`,{
                    params: { apiKey : process.env.SPOONACULAR_API_KEY }
                });
                instructions = infoResponse.data.instructions || 'No instructions available';

                if (infoResponse.data.extendedIngredients && infoResponse.data.extendedIngredients.length > 0) {
                    const ingredientInsertSql = 'INSERT INTO recipe_ingredients (api_recipe_id, ingredient) VALUES (?, ?)';
                    for (const ingredientObj of infoResponse.data.extendedIngredients) {
                        await db.promise().query(ingredientInsertSql, [id, ingredientObj.original]);
                    }
                }
            } catch (infoErr) {
                console.error(`Failed to fetch detailed instructions for recipe ${id}`, infoErr);
                instructions = 'No instructions available';
            }

            const checkRecipeSql = 'SELECT COUNT(*) AS count FROM recipes WHERE api_recipe_id = ?';
            const [rows] = await db.promise().query(checkRecipeSql, [id]);

            if (rows[0].count > 0) {
                console.log(`Recipe with id ${id} already exists, skipping insert.`);
                continue;
            }

        const recipeSql = `INSERT INTO recipes (api_recipe_id, rec_name, instructions, image_url, prep_time, cook_time) VALUES (?, ?, ?, ?, ?, ?)`;

        await new Promise((resolve, reject) => {
            db.query(recipeSql, [id, title, instructions || 'No instructions available', image, preparationMinutes, cookingMinutes], (err) => {
                if (err) {
                    console.error('Error inserting recipe:', err);
                    return reject(err);
                }
                resolve();
            });
        });

                

            try {
                const nutritionResponse = await axios.get(`https://api.spoonacular.com/recipes/${id}/nutritionWidget.json`, {
                    params: { apiKey: process.env.SPOONACULAR_API_KEY }
                });

                const { calories, protein, carbohydrates: carbs, fat: fats } = nutritionResponse.data;

                const parseValue = (val) => {
                    if (!val || typeof val !== 'string') return 0;
                    return parseFloat(val.replace(/[^\d.]/g, '')) || 0;
                }
            
                const nutritionSql = 'INSERT INTO nutrition(api_recipe_id, calories, protein, carbs, fats) VALUES (?, ?, ?, ?, ?)';
                await new Promise ((resolve, reject) => {
                    db.query(nutritionSql, [
                        id,
                        parseValue(calories),
                        parseValue(protein),
                        parseValue(carbs),
                        parseValue(fats)
                    ], (nutErr) => {
                        if (nutErr) {
                            console.error('Error inserting nutrition:', nutErr);
                            return reject(nutErr);
                        }
                    resolve();
                
                     });

                });   
            
                insertedCount++;
            } catch (nutFetchErr) {
                console.error('Error fetching nutrition info:', nutFetchErr)
            }
        }

        if (insertedCount === 0) {
            return res.status(404).send('No suitable recipes inserted');
        }
    
    
        res.send('Recipe and nutrition data inserted successfully!');
    } catch (err) {
        console.error('API error:', err);
        res.status(500).send('Failed to fetch recipe.');
    }
});

module.exports = router;