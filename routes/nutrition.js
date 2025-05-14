const express = require('express');
const router = express.Router();
const db = require('../db');
const calculateNutrition = require('../helper/calculateNutrition');

router.get('/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const [rows] = await db.promise().query('SELECT * FROM users WHERE user_id = ?', [userId]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const user = rows[0];
        console.log('Fetched user:', user);

        const nutritionPlan = calculateNutrition({
            weight: user.weight,
            height: user.height,
            gender: user.gender,
            age: user.age,
            goal: user.goal
        });

        res.json(nutritionPlan);
    } catch (err) {
        console.error('Error calculating nutrition:', err);
        res.status(500).send('Server error.');
    }
});

module.exports = router;