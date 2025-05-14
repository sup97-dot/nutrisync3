const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const sendResetEmail= require('../mailer');
const router = express.Router();

router.post('/register', async (req, res) => {
    const { email, password, first_name, last_name, username, phone_number, weight, height, goal, diet_prefer, gender, age } = req.body;
    if ( !first_name || !last_name || !username || !email || !password || !goal || age === undefined || gender === undefined) {return res.status(400).send('Missing required fields.');}

    try {
      const saltRounds = 10;
      const password_hash = await bcrypt.hash(password, saltRounds);

      await db.promise().query(
        `INSERT INTO users (first_name, last_name, username, email, phone_number, password_hash, weight, height, goal, diet_prefer, gender, age) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            first_name,
            last_name,
            username,
            email,
            phone_number || null,
            password_hash,
            weight || null,
            height || null,
            goal,
            diet_prefer || 'none',
            gender,
            age,
        ]
      );

      res.status(201).send('User registered successfully.');
    } catch (err) {
        console.error('Error registered user:', err);
        res.status(500).send('Error registering user.');
    }
});

router.post('/login', async (req, res) => {
    const { emailOrUsername, password } = req.body;

    if (!emailOrUsername || !password ) {
        return res.status(400).json({ message: 'Email/Username and password are required'});
    }

    try {
        const query = 'SELECT * FROM users WHERE email = ? OR username = ?';
        const [rows] = await db.promise().query(query, [emailOrUsername, emailOrUsername]);

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Invalid email/username or password' });
        }
        const user = rows[0]

        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email/username or password' });
        }

        const token = jwt.sign(
            {user_id: user.user_id, username: user.username },
            process.env.JWT_SECRET,
            {expiresIn: '2h'}
        );

        res.json({
            message: 'Login successful',
            token,
            userId: user.user_id });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!email) return res.status(400).json({ message: 'Email is required' });

    try {
        const [users] = await db.promise().query('SELECT * FROM users WHERE email = ?', [email]);

        if (users.length === 0) {
            return res.status(404).json({ message: 'User with this email does not exist' });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 3600000);

        await db.promise().query(
            'INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)',
            [email, token, expiresAt]
        );

        await sendResetEmail(email, token);
        
        const resetLink = `http:// your-frontend-url/reset-password?token=${token}`;

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Password Reset Request',
            html: `<p>You requested a password reset. Click <a href="${resetLink}">here</a> to reset your password.</p>`
        });

        res.json({ message: 'Password reset email sent.' });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ message: 'Server error'});
    }
});

router.post('/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ message: 'Missing token or new password.' });
    }

    try {
        const [rows] = await db.promise().query(
            'SELECT * FROM password_resets WHERE token = ? AND expires_at > NOW()',
            [token]
        );

        if (rows.length === 0) {
            return res.status(400).json({ message: 'Invalid or expired token.'});
        }

        const resetEntry = rows[0];

        const saltRounds = 10;
        const password_hash = await bcrypt.hash(newPassword, saltRounds);

        await db.promise().query(
            'UPDATE users SET password_hash = ? WHERE user_id = ?',
            [password_hash, resetEntry.user_id]
        );

        await db.promise().query(
            'DELETE FROM password_resets WHERE id = ?',
            [resetEntry.id]
        );

        res.json({ message: 'Password reset successful.' });
    } catch (err) {
        console.error('Error resetting password:', err);
        res.status(500).json({ message: 'Server error'});
    }
});

router.get('/user/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const [rows] = await db.promise().query(
            'SELECT user_id, first_name, last_name, email, username, password_hash, phone_number, weight, height, goal, created_at, diet_prefer, gender, age FROM users WHERE user_id = ?',
            [userId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error('Error fetching user:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/user/:userId', async (req, res) => {
    const { userId } = req.params;
    const {height, weight, age, gender, goal } = req.body;

    try {
        await db.promise().query(
            'UPDATE users SET height = ?, weight = ?, age = ?, gender = ?, goal = ? WHERE user_id = ?',
            [height, weight, age, gender, goal, userId]
        );

        res.json({ message: 'user profile updated successfully' });
    } catch (err) {
        console.error('Error updating user profile:', err);
        res.status(500).json({ message: 'Failed to update user profile' });
    }
});

router.get('/progress/:userId', async (req, res) => {
    const { userId } = req.params;
    try {

        const [userRows] = await db.promise().query(
            'SELECT height, weight, goal, created_at FROM users WHERE user_id = ?',
            [userId]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            start_date: userRows[0].created_at,
            height: userRows[0].height,
            weight: userRows[0].weight,
            goal: userRows[0].goal
        });
    } catch (err) {
        console.error('Error fetching progress data:', err);
        res.status(500).json({ message: 'Failed to fetch progress data' });
    }
});


module.exports = router;
