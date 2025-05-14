const mysql = require('mysql2');

const db = mysql.createConnection({
    host: 'nutrisync2.cjmykkqc0vx7.us-east-2.rds.amazonaws.com',
    user: 'admin',
    password: 'the123pass',
    database: 'nutrisync2'
});

db.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err.stack);
        return;
    }
    console.log('Connected to MYSQL database');
});

module.exports = db;