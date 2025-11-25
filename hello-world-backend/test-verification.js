const WebSocket = require('ws');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();

const API_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000';

async function testVerificationFlow() {
    try {
        // 1. Register Client
        const clientUsername = `client_${Date.now()}`;
        const clientEmail = `${clientUsername}@test.com`;

        console.log('Registering client:', clientUsername);
        await axios.post(`${API_URL}/register`, {
            username: clientUsername,
            password: 'password',
            role: 'Client',
            full_name: 'Test Client',
            dob: '2000-01-01',
            email: clientEmail
        });

        // Manually verify client in DB
        const db = new sqlite3.Database('users_v6.db');
        await new Promise((resolve, reject) => {
            db.run("UPDATE users SET is_verified = 1 WHERE username = ?", [clientUsername], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        const clientAuth = await axios.post(`${API_URL}/login`, { username: clientUsername, password: 'password' });
        const clientToken = clientAuth.data.token;
        console.log('Client logged in');

        // 2. Register Runner (Always new to avoid active order conflict)
        const runnerUsername = `runner_${Date.now()}`;
        console.log('Registering new runner:', runnerUsername);
        await axios.post(`${API_URL}/register`, {
            username: runnerUsername,
            password: 'password',
            role: 'Runner',
            full_name: 'Test Runner',
            dob: '2000-01-01',
            email: `${runnerUsername}@test.com`
        });

        // Verify runner
        await new Promise((resolve, reject) => {
            db.run("UPDATE users SET is_verified = 1 WHERE username = ?", [runnerUsername], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        db.close();

        const runnerAuth = await axios.post(`${API_URL}/login`, { username: runnerUsername, password: 'password' });
        const runnerToken = runnerAuth.data.token;
        console.log('New Runner logged in');

        // 3. Connect Client WS
        const clientWs = new WebSocket(`${WS_URL}?token=${clientToken}`);

        clientWs.on('open', () => console.log('Client WS Connected'));
        clientWs.on('message', (data) => {
            const msg = JSON.parse(data);
            console.log('Client received WS:', msg.type, msg.payload);
            if (msg.type === 'ORDER_ACCEPTED') {
                if (msg.payload.verificationCode) {
                    console.log('SUCCESS: Verification Code received:', msg.payload.verificationCode);
                } else {
                    console.error('FAILURE: Verification Code MISSING in ORDER_ACCEPTED');
                }
            }
        });

        // 4. Place Order
        const orderRes = await axios.post(`${API_URL}/orders`, {
            current_bottle: 'Gas A',
            new_bottle: 'Gas B',
            delivery_address: '123 Test St',
            price_diff: 10,
            service_fee: 5,
            runner_fee: 5,
            tip: 2,
            total_price: 22
        }, { headers: { Authorization: `Bearer ${clientToken}` } });

        const orderId = orderRes.data.orderId;
        console.log('Order placed:', orderId);

        // 5. Runner Accepts Order
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for WS connection
        await axios.post(`${API_URL}/orders/${orderId}/accept`, {}, { headers: { Authorization: `Bearer ${runnerToken}` } });
        console.log('Order accepted by Runner');

        // Wait for WS message
        await new Promise(resolve => setTimeout(resolve, 3000));

        clientWs.close();

    } catch (error) {
        console.error('Test failed:', error.response ? error.response.data : error.message);
    }
}

testVerificationFlow();
