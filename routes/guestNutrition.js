const express = require('express');
const router = express.Router();
const calculateNutrition = require('../helper/calculateNutrition');
const axios = require('axios');

router.post('/nutrition', (req, res) => {
    const { weight, height, age, gender, goal } = req.body;

    if (!weight || !height || !age || !gender || !goal) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }

    try {
        const nutritionPlan = calculateNutrition({ weight, height, age, gender, goal });

        res.json({
            success: true,
            nutritionPlan
        });
    } catch (err) {
        console.error('Guest nutrition calculation error:', err);
        res.status(500).json({ message: 'Failed to calculate nutrition.' });
    }
});

module.exports = router;