const express = require ('express');
const router = express.Router();
const db = require('../db');

router.post('/', async (req, res) => {
    const { user_id, plan_id, rating, review } = req.body;

    if (!user_id || !plan_id || !rating) {
        return res.status(400).json({ message: 'Missing required fields (user_id, plan_id, rating).' });
    }

    try {
        const insertSql = `INSERT INTO meal_rating (user_id, plan_id, rating, review) VALUES (?, ?, ?, ?)`;

        await db.promise().query(insertSql, [user_id, plan_id, rating, review || null]);

        res.status(201).json({ message: 'Meal rating submitted successfully.' });
    } catch (err) {
        console.error('Error inserting meal rating:', err);
        res.status(500).json({ message: 'Failed to submit meal rating.' });
    }
});

module.exports = router;