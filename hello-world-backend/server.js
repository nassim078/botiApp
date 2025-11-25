require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const sgMail = require('@sendgrid/mail');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3000;
const SECRET_KEY = 'your_secret_key';

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// WebSocket Connection Handling
const clients = new Map(); // userId -> WebSocket

wss.on('connection', (ws, req) => {
    // Extract token from query string: ?token=...
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
        ws.close(1008, 'Token required');
        return;
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            ws.close(1008, 'Invalid token');
            return;
        }

        // Close old connection if exists (user logged in from new device)
        const oldWs = clients.get(user.id);
        if (oldWs && oldWs.readyState === WebSocket.OPEN) {
            console.log(`[WS] Closing old connection for ${user.username}`);
            oldWs.close();
        }

        // Store connection
        clients.set(user.id, ws);
        ws.userId = user.id;
        ws.role = user.role;
        console.log(`[WS] Client connected: ${user.username} (${user.role})`);

        ws.on('close', () => {
            // Always try to delete this user's connection
            if (clients.get(user.id) === ws) {
                clients.delete(user.id);
                console.log(`[WS] Client disconnected: ${user.username} (ID: ${user.id})`);
            } else {
                console.log(`[WS] Stale connection closed for ${user.username} (ID: ${user.id})`);
            }
        });

        ws.on('error', (error) => {
            console.error(`[WS] Error for ${user.username} (ID: ${user.id}):`, error);
            // Remove on error too
            if (clients.get(user.id) === ws) {
                clients.delete(user.id);
            }
        });
    });
});

// Helper to send to specific user
const sendToUser = (userId, type, payload) => {
    const ws = clients.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, payload }));
        console.log(`[WS] Sent ${type} to user ${userId}`);
    }
};

// Helper to broadcast to role
const broadcastToRole = (role, type, payload) => {
    wss.clients.forEach(client => {
        if (client.role === role && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type, payload }));
        }
    });
    console.log(`[WS] Broadcast ${type} to role ${role}`);
};

// Configure SendGrid
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Database setup
const db = new sqlite3.Database('users_v6.db');

db.serialize(() => {
    // Users Table
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
    reset_expires INTEGER,
    expo_push_token TEXT
  )`);

    // Orders Table
    db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    runner_id INTEGER,
    current_bottle TEXT,
    new_bottle TEXT,
    delivery_address TEXT,
    client_latitude REAL,
    client_longitude REAL,
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

    // Migration: Add GPS columns to existing orders table
    db.run("ALTER TABLE orders ADD COLUMN client_latitude REAL", (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding client_latitude column:', err);
        }
    });

    db.run("ALTER TABLE orders ADD COLUMN client_longitude REAL", (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding client_longitude column:', err);
        }
    });

    db.run("ALTER TABLE orders ADD COLUMN verification_code TEXT", (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding verification_code column:', err);
        }
    });
});

// Email Helper
const sendEmail = async (to, subject, text) => {
    if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) {
        const msg = { to, from: process.env.SENDGRID_FROM_EMAIL, subject, text };
        try {
            await sgMail.send(msg);
            console.log(`EMAIL SENT (SendGrid) to ${to}`);
            return;
        } catch (error) {
            console.error("SendGrid failed:", error);
        }
    }
    console.log(`EMAIL MOCK: To: ${to}, Subject: ${subject}`);
};

// Register Endpoint
app.post('/register', (req, res) => {
    const { username, password, role, full_name, dob, email, profile_picture } = req.body;
    const verification_code = Math.floor(100000 + Math.random() * 900000).toString();

    db.run(
        "INSERT INTO users (username, password, role, full_name, dob, email, verification_code, is_verified, profile_picture) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)",
        [username, password, role, full_name, dob, email, verification_code, profile_picture || null],
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

// Login Endpoint
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get(
        "SELECT * FROM users WHERE (username = ? OR email = ?) AND password = ?",
        [username, username, password],
        (err, row) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (!row) return res.status(401).json({ error: 'Invalid credentials' });
            if (row.is_verified === 0) return res.status(403).json({ error: 'Account not verified.' });

            const token = jwt.sign({ id: row.id, username: row.username, role: row.role }, SECRET_KEY, { expiresIn: '1h' });
            res.json({ token, role: row.role });
        }
    );
});

// Place Order Endpoint
app.post('/orders', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);

        // Check if client has an active order
        db.get("SELECT count(*) as count FROM orders WHERE client_id = ? AND status IN ('pending', 'accepted')", [user.id], (err, row) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (row.count > 0) return res.status(400).json({ error: 'You already have an active order. Please wait for it to complete or cancel it.' });

            const { current_bottle, new_bottle, delivery_address, client_latitude, client_longitude, price_diff, service_fee, runner_fee, tip, total_price } = req.body;

            // Generate 4-digit verification code
            const verificationCode = Math.floor(1000 + Math.random() * 9000).toString();

            db.run(
                "INSERT INTO orders (client_id, current_bottle, new_bottle, delivery_address, client_latitude, client_longitude, price_diff, service_fee, runner_fee, tip, total_price, verification_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [user.id, current_bottle, new_bottle, delivery_address, client_latitude, client_longitude, price_diff, service_fee, runner_fee, tip, total_price, verificationCode],
                function (err) {
                    if (err) return res.status(500).json({ error: 'Database error' });

                    // Notify Runners
                    const newOrder = {
                        id: this.lastID,
                        client_id: user.id,
                        current_bottle,
                        new_bottle,
                        delivery_address,
                        client_latitude,
                        client_longitude,
                        runner_fee,
                        tip,
                        status: 'pending'
                    };
                    broadcastToRole('Runner', 'NEW_ORDER', newOrder);

                    res.json({ message: 'Order placed successfully', orderId: this.lastID, verificationCode });
                }
            );
        });
    });
});

// Get Orders Endpoint (For Runners)
app.get('/orders', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);

        db.all("SELECT orders.*, users.username as client_name, users.full_name as client_full_name FROM orders JOIN users ON orders.client_id = users.id WHERE status = 'pending' ORDER BY created_at DESC", [], (err, rows) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json(rows);
        });
    });
});

// Accept Order Endpoint
app.post('/orders/:id/accept', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        if (user.role !== 'Runner') return res.status(403).json({ error: 'Only runners can accept orders' });

        const orderId = req.params.id;

        db.get("SELECT count(*) as count FROM orders WHERE runner_id = ? AND status = 'accepted'", [user.id], (err, row) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (row.count > 0) return res.status(400).json({ error: 'You already have an active order.' });

            db.run("UPDATE orders SET runner_id = ?, status = 'accepted' WHERE id = ? AND runner_id IS NULL", [user.id, orderId], function (err) {
                if (err) return res.status(500).json({ error: 'Database error' });
                if (this.changes === 0) return res.status(400).json({ error: 'Order already accepted or not found' });

                // Notify Client with runner information
                db.get("SELECT o.client_id, o.verification_code, u.username, u.full_name FROM orders o JOIN users u ON u.id = ? WHERE o.id = ?", [user.id, orderId], (err, row) => {
                    if (row) {
                        sendToUser(row.client_id, 'ORDER_ACCEPTED', {
                            orderId,
                            runnerId: user.id,
                            runnerUsername: row.username,
                            runnerName: row.full_name,
                            verificationCode: row.verification_code
                        });
                    }
                });

                res.json({ message: 'Order accepted successfully' });
            });
        });
    });
});

// Request Verification (Runner initiates code request)
app.post('/orders/:id/request-verification', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        if (user.role !== 'Runner') return res.sendStatus(403);

        const orderId = req.params.id;

        // Get order details and notify client
        db.get("SELECT client_id, verification_code FROM orders WHERE id = ? AND runner_id = ?", [orderId, user.id], (err, row) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (!row) return res.status(404).json({ error: 'Order not found or not assigned to you' });

            // Send WebSocket event to client to show widget
            sendToUser(row.client_id, 'SHOW_VERIFICATION_CODE', { orderId, verificationCode: row.verification_code });

            res.json({ message: 'Verification request sent to client' });
        });
    });
});

// Complete Order Endpoint
app.post('/orders/:id/complete', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        if (user.role !== 'Runner') return res.sendStatus(403);

        const orderId = req.params.id;
        const { verification_code } = req.body;

        if (!verification_code) return res.status(400).json({ error: 'Verification code is required' });

        // Verify code first
        db.get("SELECT verification_code FROM orders WHERE id = ?", [orderId], (err, row) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (!row) return res.status(404).json({ error: 'Order not found' });

            // Allow string comparison and handle potential nulls if migrated
            if (row.verification_code && row.verification_code !== verification_code.toString()) {
                return res.status(400).json({ error: 'Invalid verification code' });
            }

            db.run("UPDATE orders SET status = 'completed', runner_id = ? WHERE id = ?", [user.id, orderId], function (err) {
                if (err) return res.status(500).json({ error: 'Database error' });
                if (this.changes === 0) return res.status(404).json({ error: 'Order not found' });

                // Notify Client
                db.get("SELECT client_id FROM orders WHERE id = ?", [orderId], (err, row) => {
                    if (row) {
                        sendToUser(row.client_id, 'ORDER_COMPLETED', { orderId });
                    }
                });

                res.json({ message: 'Order completed successfully' });
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

        db.get("SELECT * FROM orders WHERE id = ?", [orderId], (err, order) => {
            if (err || !order) return res.status(404).json({ error: 'Order not found' });

            const isClient = order.client_id === user.id;
            const isAssignedRunner = order.runner_id === user.id;

            if (!isClient && !isAssignedRunner) return res.status(403).json({ error: 'Not authorized' });
            if (order.status === 'completed' || order.status === 'cancelled') return res.status(400).json({ error: 'Cannot cancel' });

            db.run(
                "UPDATE orders SET status = 'cancelled', cancellation_reason = ?, cancelled_by = ? WHERE id = ?",
                [reason, user.id, orderId],
                function (err) {
                    if (err) return res.status(500).json({ error: 'Database error' });

                    // Notify Counterpart with canceller information
                    const targetId = isClient ? order.runner_id : order.client_id;
                    if (targetId) {
                        sendToUser(targetId, 'ORDER_CANCELLED', {
                            orderId,
                            reason,
                            cancelledBy: user.username,
                            cancellerName: user.full_name || user.username,
                            cancellerRole: user.role
                        });
                    }

                    res.json({ message: 'Order cancelled successfully' });
                }
            );
        });
    });
});

// Get Messages
app.get('/orders/:id/messages', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        const orderId = req.params.id;

        db.get("SELECT * FROM orders WHERE id = ?", [orderId], (err, order) => {
            if (err || !order) return res.status(404).json({ error: 'Order not found' });
            if (order.client_id !== user.id && order.runner_id !== user.id) return res.status(403).json({ error: 'Not authorized' });

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

// Send Message
app.post('/orders/:id/messages', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        const orderId = req.params.id;
        const { content } = req.body;

        db.get("SELECT * FROM orders WHERE id = ?", [orderId], (err, order) => {
            if (err || !order) return res.status(404).json({ error: 'Order not found' });

            let receiverId;
            if (user.id === order.client_id) receiverId = order.runner_id;
            else if (user.id === order.runner_id) receiverId = order.client_id;
            else return res.status(403).json({ error: 'Not authorized' });

            if (!receiverId) return res.status(400).json({ error: 'No recipient found' });

            db.run(
                "INSERT INTO messages (order_id, sender_id, receiver_id, content) VALUES (?, ?, ?, ?)",
                [orderId, user.id, receiverId, content],
                function (err) {
                    if (err) return res.status(500).json({ error: 'Database error' });

                    const newMessage = {
                        id: this.lastID,
                        order_id: orderId,
                        sender_id: user.id,
                        receiver_id: receiverId,
                        content,
                        is_read: 0,
                        created_at: new Date().toISOString(),
                        sender_name: user.username
                    };

                    // Notify Receiver
                    sendToUser(receiverId, 'NEW_MESSAGE', newMessage);

                    res.json({ message: 'Message sent', id: this.lastID });
                }
            );
        });
    });
});

// Get My Orders
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

// Get Me
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

// Update Me (Profile)
app.put('/me', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);

        const { full_name, username, dob, profile_picture } = req.body;

        // Build dynamic update query based on provided fields
        const updates = [];
        const params = [];

        if (full_name !== undefined) {
            updates.push('full_name = ?');
            params.push(full_name);
        }
        if (username !== undefined) {
            updates.push('username = ?');
            params.push(username);
        }
        if (dob !== undefined) {
            updates.push('dob = ?');
            params.push(dob);
        }
        if (profile_picture !== undefined) {
            updates.push('profile_picture = ?');
            params.push(profile_picture);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        params.push(user.id); // Add WHERE clause parameter

        const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;

        db.run(query, params, function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'Username already taken' });
                }
                return res.status(500).json({ error: 'Database error' });
            }

            res.json({ message: 'Profile updated successfully' });
        });
    });
});

// Admin
app.get('/admin', (req, res) => {
    db.all("SELECT * FROM users", [], (err, users) => {
        if (err) return res.status(500).send("Database error");
        db.all("SELECT * FROM orders", [], (err, orders) => {
            if (err) return res.status(500).send("Database error");
            let html = `<html><body><h1>Admin</h1><h2>Users</h2><pre>${JSON.stringify(users, null, 2)}</pre><h2>Orders</h2><pre>${JSON.stringify(orders, null, 2)}</pre></body></html>`;
            res.send(html);
        });
    });
});

// Start Server (Use server.listen for WS support)
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
