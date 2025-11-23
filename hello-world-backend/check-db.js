const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('users_v3.db', (err) => {
    if (err) {
        console.error(err.message);
        return;
    }
    console.log('Connected to the users_v3.db database.');
});

db.serialize(() => {
    db.all(`SELECT id, username, role, email, is_verified, verification_code, reset_code FROM users`, [], (err, rows) => {
        if (err) {
            throw err;
        }
        console.log('--- USERS TABLE ---');
        console.table(rows);
    });
});

db.close((err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Close the database connection.');
});
