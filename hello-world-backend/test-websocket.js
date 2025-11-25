const WebSocket = require('ws');
// const fetch = require('node-fetch'); // Native fetch in Node 21

const API_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000';

async function testWebSocket() {
    try {
        // 1. Login as Client
        console.log('Logging in as Client...');
        const clientRes = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'client', password: 'client123' })
        });
        const clientData = await clientRes.json();
        const clientToken = clientData.token;

        // 2. Login as Runner
        console.log('Logging in as Runner...');
        const runnerRes = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'runner', password: 'runner123' })
        });
        const runnerData = await runnerRes.json();
        const runnerToken = runnerData.token;

        // 3. Connect Runner to WS
        console.log('Connecting Runner to WS...');
        const runnerWs = new WebSocket(`${WS_URL}?token=${runnerToken}`);

        runnerWs.on('open', () => {
            console.log('Runner WS Connected');
        });

        runnerWs.on('message', (data) => {
            const msg = JSON.parse(data);
            console.log('Runner received:', msg);
        });

        // 4. Connect Client to WS
        console.log('Connecting Client to WS...');
        const clientWs = new WebSocket(`${WS_URL}?token=${clientToken}`);

        clientWs.on('open', async () => {
            console.log('Client WS Connected');

            // 5. Create Order (Should trigger NEW_ORDER for Runner)
            console.log('Creating Order...');
            const orderRes = await fetch(`${API_URL}/orders`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${clientToken}`
                },
                body: JSON.stringify({
                    current_bottle: 'B12',
                    new_bottle: 'B12',
                    delivery_address: 'WS Test St',
                    price_diff: 0,
                    service_fee: 5,
                    runner_fee: 5,
                    tip: 2,
                    total_price: 12
                })
            });
            const orderData = await orderRes.json();
            console.log('Order Created:', orderData.orderId);

            // Wait a bit for notification
            setTimeout(async () => {
                // 6. Accept Order (Should trigger ORDER_ACCEPTED for Client)
                console.log('Accepting Order...');
                await fetch(`${API_URL}/orders/${orderData.orderId}/accept`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${runnerToken}` }
                });
            }, 2000);
        });

        clientWs.on('message', (data) => {
            const msg = JSON.parse(data);
            console.log('Client received:', msg);

            if (msg.type === 'ORDER_ACCEPTED') {
                console.log('Test Passed: Client received ORDER_ACCEPTED');
                clientWs.close();
                runnerWs.close();
                process.exit(0);
            }
        });

    } catch (error) {
        console.error('Test Failed:', error);
    }
}

testWebSocket();
