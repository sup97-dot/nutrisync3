const express = require('express');
const db = require('../db');
const router = express.Router();
const auth = require('../middleware/auth');

router.post('/star/:planId', auth, async (req, res) => {
    const { planId } = req.params;
    const userId = req.user.userId;

    try {
        const [existingRows] = await db.promise().query(
            'SELECT * FROM starred_meals WHERE user_id = ? AND plan_id = ?',
            [userId, planId]
        );

        if (existingRows.length > 0) {
            return res.status(400).json({ message: 'Meal already starred' });
        }

        await db.promise().query(
            'INSERT INTO starred_meals (user_id, plan_id) VALUES (?, ?)',
            [userId, planId]
        );

        res.status(201).json({ message: 'Meal starred successfully' });
    } catch (err) {
        console.error('Error starring meal:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.delete('/unstar/:planId', auth, async (req, res) => {
    const { planId } = req.params;
    const userId = req.user.userId;

    try {
        const [result] = await db.promise().query(
            'DELETE FROM starred_meals WHERE user_id = ? AND plan_id = ?',
            [userId, planId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Starred meal not found' });
        }

        res.json({ message: 'Meal unstarred successfully' });
    } catch (err) {
        console.error('Error unstarring meal:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/user/:userId', auth, async (req, res) => {
    const { userId } = req.params;

    if (req.user.userId !== parseInt(userId)) {
        return res.status(403).json({ message: 'Unauthorized' });
    }

    try {
        const [rows] = await db.promise().query(
            `SELECT mp.*, r.rec_name, r.image_url, n.calories, n.protein, n.carbs, n.fats
             FROM starred_meals sm
             JOIN meal_plans mp ON sm.plan_id = mp.plan_id
             JOIN recipes r ON mp.recipe_id = r.recipe_id
             LEFT JOIN nutrition n ON r.api_recipe_id = n.api_recipe_id
             WHERE sm.user_id = ?
             ORDER BY sm.starred_at DESC`,
            [userId]
        );

        res.json(rows);
    } catch (err) {
        console.error('Error fetching starred meals:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/check/:planId', auth, async (req, res) => {
    const { planId } = req.params;
    const userId = req.user.userId;

    try {
        const [rows] = await db.promise().query(
            'SELECT * FROM starred_meals WHERE user_id = ? AND plan_id = ?',
            [userId, planId]
        );

        res.json({ isStarred: rows.length > 0 });
    } catch (err) {
        console.error('Error checking starred status:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;