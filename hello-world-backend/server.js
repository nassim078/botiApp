require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const sgMail = require('@sendgrid/mail');

const app = express();
const PORT = 3000;
const SECRET_KEY = 'your_secret_key';

app.use(cors());
app.use(bodyParser.json());

// Configure SendGrid
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Database setup - using v6 for Cancellation and Simplified Address
const db = new sqlite3.Database('users_v6.db');

db.serialize(() => {
    // Extended schema with profile_picture
    db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT,
    full_name TEXT,
    dob TEXT,
    email TEXT UNIQUE,
    profile_picture TEXT,
    is_verified INTEGER DEFAULT 0,
    verification_code TEXT,
    reset_code TEXT,
    reset_expires INTEGER
  )`);

    // Extended schema with delivery_address and cancellation fields
    db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    runner_id INTEGER,
    current_bottle TEXT,
    new_bottle TEXT,
    delivery_address TEXT,
    price_diff REAL,
    service_fee REAL,
    runner_fee REAL,
    tip REAL,
    total_price REAL,
    status TEXT DEFAULT 'pending',
    cancellation_reason TEXT,
    cancelled_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(client_id) REFERENCES users(id),
    FOREIGN KEY(runner_id) REFERENCES users(id)
  )`);

    // Messages Table
    db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    sender_id INTEGER,
    receiver_id INTEGER,
    content TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(order_id) REFERENCES orders(id),
    FOREIGN KEY(sender_id) REFERENCES users(id),
    FOREIGN KEY(receiver_id) REFERENCES users(id)
  )`);

    // Seed users
    const users = [
        { username: 'admin', password: 'admin123', role: 'Admin', full_name: 'System Admin', dob: '2000-01-01', email: 'admin@test.com', is_verified: 1 },
        { username: 'runner', password: 'runner123', role: 'Runner', full_name: 'Test Runner', dob: '2000-01-01', email: 'runner@test.com', is_verified: 1 },
        { username: 'client', password: 'client123', role: 'Client', full_name: 'Test Client', dob: '2000-01-01', email: 'client@test.com', is_verified: 1 }
    ];

    const stmt = db.prepare("INSERT OR IGNORE INTO users (username, password, role, full_name, dob, email, is_verified) VALUES (?, ?, ?, ?, ?, ?, ?)");
    users.forEach(user => {
        stmt.run(user.username, user.password, user.role, user.full_name, user.dob, user.email, user.is_verified);
    });
    stmt.finalize();
});

// Email Helper
const sendEmail = async (to, subject, text) => {
    // Check if SendGrid is configured
    if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) {
        const msg = {
            to,
            from: process.env.SENDGRID_FROM_EMAIL,
            subject,
            text,
        };

        try {
            await sgMail.send(msg);
            console.log(`EMAIL SENT (SendGrid) to ${to}`);
            return;
        } catch (error) {
            console.error("SendGrid failed, falling back to console:", error);
            if (error.response) {
                console.error(error.response.body);
            }
        }
    }

    // Fallback to console
    console.log('------------------------------------------------');
    console.log(`EMAIL MOCK: To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body: ${text}`);
    console.log('------------------------------------------------');
};

// Register Endpoint
app.post('/register', (req, res) => {
    const { username, password, role, full_name, dob, email } = req.body;
    const verification_code = Math.floor(100000 + Math.random() * 900000).toString();

    db.run(
        "INSERT INTO users (username, password, role, full_name, dob, email, verification_code, is_verified) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
        [username, password, role, full_name, dob, email, verification_code],
        function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'Username or Email already exists' });
                }
                return res.status(500).json({ error: 'Database error' });
            }

            sendEmail(email, 'Verify your account', `Your verification code is: ${verification_code}`);
            res.json({ message: 'Registration successful. Please check your email for the verification code.' });
        }
    );
});

// Verify Endpoint
app.post('/verify', (req, res) => {
    const { email, code } = req.body;
    db.get("SELECT * FROM users WHERE email = ? AND verification_code = ?", [email, code], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!row) return res.status(400).json({ error: 'Invalid code or email' });

        db.run("UPDATE users SET is_verified = 1, verification_code = NULL WHERE id = ?", [row.id], (err) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ message: 'Account verified successfully. You can now login.' });
        });
    });
});

// Login Endpoint (Username OR Email)
app.post('/login', (req, res) => {
    const { username, password } = req.body; // 'username' field can contain email

    db.get(
        "SELECT * FROM users WHERE (username = ? OR email = ?) AND password = ?",
        [username, username, password],
        (err, row) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (!row) return res.status(401).json({ error: 'Invalid credentials' });

            if (row.is_verified === 0) {
                return res.status(403).json({ error: 'Account not verified. Please verify your email.' });
            }

            const token = jwt.sign({ id: row.id, username: row.username, role: row.role }, SECRET_KEY, { expiresIn: '1h' });
            res.json({ token, role: row.role });
        }
    );
});

// Forgot Password Endpoint
app.post('/forgot-password', (req, res) => {
    const { email } = req.body;
    const reset_code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 3600000; // 1 hour

    db.get("SELECT * FROM users WHERE email = ?", [email], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!row) return res.status(404).json({ error: 'User not found' });

        db.run("UPDATE users SET reset_code = ?, reset_expires = ? WHERE id = ?", [reset_code, expires, row.id], (err) => {
            if (err) return res.status(500).json({ error: 'Database error' });

            sendEmail(email, 'Password Reset', `Your password reset code is: ${reset_code}`);
            res.json({ message: 'Reset code sent to email.' });
        });
    });
});

// Reset Password Endpoint
app.post('/reset-password', (req, res) => {
    const { email, code, newPassword } = req.body;

    db.get("SELECT * FROM users WHERE email = ? AND reset_code = ?", [email, code], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!row) return res.status(400).json({ error: 'Invalid code' });
        if (Date.now() > row.reset_expires) return res.status(400).json({ error: 'Code expired' });

        db.run("UPDATE users SET password = ?, reset_code = NULL, reset_expires = NULL WHERE id = ?", [newPassword, row.id], (err) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ message: 'Password reset successfully. Please login.' });
        });
    });
});

// Create Order Endpoint
app.post('/orders', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);

        const { current_bottle, new_bottle, delivery_address, price_diff, service_fee, runner_fee, tip, total_price } = req.body;

        db.run(
            "INSERT INTO orders (client_id, current_bottle, new_bottle, delivery_address, price_diff, service_fee, runner_fee, tip, total_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [user.id, current_bottle, new_bottle, delivery_address, price_diff, service_fee, runner_fee, tip, total_price],
            function (err) {
                if (err) return res.status(500).json({ error: 'Database error' });
                res.json({ message: 'Order placed successfully', orderId: this.lastID });
            }
        );
    });
});

// Get Orders Endpoint (For Runners - Pending Orders)
app.get('/orders', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        // In a real app, check if user.role === 'Runner'

        db.all("SELECT orders.*, users.username as client_name, users.full_name as client_full_name FROM orders JOIN users ON orders.client_id = users.id WHERE status = 'pending' ORDER BY created_at DESC", [], (err, rows) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json(rows);
        });
    });
});

// Complete Order Endpoint (For Runners)
app.post('/orders/:id/complete', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        if (user.role !== 'Runner') return res.sendStatus(403);

        const orderId = req.params.id;

        db.run("UPDATE orders SET status = 'completed', runner_id = ? WHERE id = ?", [user.id, orderId], function (err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (this.changes === 0) return res.status(404).json({ error: 'Order not found' });
            res.json({ message: 'Order completed successfully' });
        });
    });
});

// Accept Order Endpoint (for Runners)
app.post('/orders/:id/accept', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        if (user.role !== 'Runner') return res.status(403).json({ error: 'Only runners can accept orders' });

        const orderId = req.params.id;

        // Check if runner already has an active order
        console.log(`[DEBUG] Checking active orders for runner ${user.id}`);
        db.get("SELECT count(*) as count FROM orders WHERE runner_id = ? AND status = 'accepted'", [user.id], (err, row) => {
            if (err) {
                console.error('[DEBUG] DB Error checking active orders:', err);
                return res.status(500).json({ error: 'Database error checking active orders' });
            }
            console.log(`[DEBUG] Active orders count: ${row.count}`);
            if (row.count > 0) {
                return res.status(400).json({ error: 'You already have an active order. Please complete it first.' });
            }

            console.log(`[DEBUG] Updating order ${orderId} to accepted`);
            db.run("UPDATE orders SET runner_id = ?, status = 'accepted' WHERE id = ? AND runner_id IS NULL", [user.id, orderId], function (err) {
                if (err) {
                    console.error('[DEBUG] DB Error updating order:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                console.log(`[DEBUG] Order updated. Changes: ${this.changes}`);
                if (this.changes === 0) return res.status(400).json({ error: 'Order already accepted or not found' });
                res.json({ message: 'Order accepted successfully' });
            });
        });
    });
});

// Cancel Order Endpoint
app.post('/orders/:id/cancel', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);

        const orderId = req.params.id;
        const { reason } = req.body;

        // Verify ownership or runner assignment
        db.get("SELECT * FROM orders WHERE id = ?", [orderId], (err, order) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (!order) return res.status(404).json({ error: 'Order not found' });

            const isClient = order.client_id === user.id;
            const isAssignedRunner = order.runner_id === user.id;

            if (!isClient && !isAssignedRunner) {
                return res.status(403).json({ error: 'Not authorized to cancel this order' });
            }

            if (order.status === 'completed' || order.status === 'cancelled') {
                return res.status(400).json({ error: 'Order cannot be cancelled in its current state' });
            }

            db.run(
                "UPDATE orders SET status = 'cancelled', cancellation_reason = ?, cancelled_by = ? WHERE id = ?",
                [reason, user.id, orderId],
                function (err) {
                    if (err) return res.status(500).json({ error: 'Database error' });
                    res.json({ message: 'Order cancelled successfully' });
                }
            );
        });
    });
});

// --- MESSAGING SYSTEM ---

// Get messages for an order
app.get('/orders/:id/messages', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);

        const orderId = req.params.id;

        // Verify access (must be client or runner of the order)
        db.get("SELECT * FROM orders WHERE id = ?", [orderId], (err, order) => {
            if (err || !order) return res.status(404).json({ error: 'Order not found' });

            if (order.client_id !== user.id && order.runner_id !== user.id) {
                return res.status(403).json({ error: 'Not authorized' });
            }

            db.all(
                "SELECT m.*, u.username as sender_name FROM messages m JOIN users u ON m.sender_id = u.id WHERE order_id = ? ORDER BY created_at ASC",
                [orderId],
                (err, messages) => {
                    if (err) return res.status(500).json({ error: 'Database error' });
                    res.json(messages);
                }
            );
        });
    });
});

// Send a message
app.post('/orders/:id/messages', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);

        const orderId = req.params.id;
        const { content } = req.body;

        if (!content) return res.status(400).json({ error: 'Message content required' });

        db.get("SELECT * FROM orders WHERE id = ?", [orderId], (err, order) => {
            if (err || !order) return res.status(404).json({ error: 'Order not found' });

            // Determine receiver
            let receiverId;
            if (user.id === order.client_id) {
                receiverId = order.runner_id;
            } else if (user.id === order.runner_id) {
                receiverId = order.client_id;
            } else {
                return res.status(403).json({ error: 'Not authorized' });
            }

            if (!receiverId) return res.status(400).json({ error: 'No recipient found (order might not be accepted yet)' });

            db.run(
                "INSERT INTO messages (order_id, sender_id, receiver_id, content) VALUES (?, ?, ?, ?)",
                [orderId, user.id, receiverId, content],
                function (err) {
                    if (err) return res.status(500).json({ error: 'Database error' });
                    res.json({ message: 'Message sent', id: this.lastID });
                }
            );
        });
    });
});

// Get My Orders Endpoint (History)
app.get('/my-orders', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);

        let query = "";
        let params = [];

        if (user.role === 'Client') {
            query = "SELECT * FROM orders WHERE client_id = ? ORDER BY created_at DESC";
            params = [user.id];
        } else if (user.role === 'Runner') {
            query = "SELECT orders.*, users.username as client_name, users.full_name as client_full_name FROM orders JOIN users ON orders.client_id = users.id WHERE runner_id = ? AND (status = 'completed' OR status = 'accepted' OR status = 'cancelled') ORDER BY created_at DESC";
            params = [user.id];
        } else {
            return res.json([]);
        }

        db.all(query, params, (err, rows) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json(rows);
        });
    });
});

// Get Me Endpoint (Profile)
app.get('/me', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);

        db.get("SELECT id, username, full_name, dob, email, role, profile_picture FROM users WHERE id = ?", [user.id], (err, row) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (!row) return res.status(404).json({ error: 'User not found' });
            res.json(row);
        });
    });
});

// Update Me Endpoint (Profile Update)
app.put('/me', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);

        const { full_name, username, dob, profile_picture } = req.body;

        db.run(
            "UPDATE users SET full_name = ?, username = ?, dob = ?, profile_picture = ? WHERE id = ?",
            [full_name, username, dob, profile_picture, user.id],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ error: 'Username already taken' });
                    }
                    return res.status(500).json({ error: 'Database error' });
                }
                res.json({ message: 'Profile updated successfully' });
            }
        );
    });
});

// Admin DB Viewer Endpoint
app.get('/admin', (req, res) => {
    db.all("SELECT * FROM users", [], (err, users) => {
        if (err) return res.status(500).send("Database error");

        db.all("SELECT * FROM orders", [], (err, orders) => {
            if (err) return res.status(500).send("Database error");

            let html = `
      <html>
        <head>
          <title>DB Viewer</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            h1 { color: #333; }
            h2 { color: #666; }
          </style>
        </head>
        <body>
          <h1>Admin Viewer</h1>
          
          <h2>Users</h2>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Username</th>
                <th>Password</th>
                <th>Role</th>
                <th>Email</th>
                <th>Verified?</th>
                <th>Pic?</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(row => `
                <tr>
                  <td>${row.id}</td>
                  <td>${row.username}</td>
                  <td>${row.password}</td>
                  <td>${row.role}</td>
                  <td>${row.email}</td>
                  <td>${row.is_verified ? '✅' : '❌'}</td>
                  <td>${row.profile_picture ? '✅' : '❌'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <h2>Orders</h2>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Client ID</th>
                <th>Runner ID</th>
                <th>Current</th>
                <th>New</th>
                <th>Total</th>
                <th>Status</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              ${orders.map(row => `
                <tr>
                  <td>${row.id}</td>
                  <td>${row.client_id}</td>
                  <td>${row.runner_id}</td>
                  <td>${row.current_bottle}</td>
                  <td>${row.new_bottle}</td>
                  <td>€${row.total_price}</td>
                  <td>${row.status}</td>
                  <td>${row.cancellation_reason || ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <p><a href="/admin">Refresh</a></p>
        </body>
      </html>
    `;
            res.send(html);
        });
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
