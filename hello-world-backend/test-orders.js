// const fetch = require('node-fetch'); // Using native fetch

const API_URL = 'http://localhost:3000';

async function testOrderFlow() {
    try {
        console.log('--- Starting Order Flow Test ---');

        // 1. Register/Login Client
        console.log('1. Authenticating Client...');
        const clientCreds = { username: 'client_test', password: 'password123', role: 'Client', full_name: 'Client Test', dob: '1990-01-01', email: 'client_test@example.com' };

        // Try login first
        let clientRes = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: clientCreds.username, password: clientCreds.password })
        });

        if (clientRes.status === 401) {
            // Register if not exists
            console.log('   Client not found, registering...');
            await fetch(`${API_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(clientCreds)
            });
            // Verify manually (mocking verification in DB would be needed, but let's assume we use an existing verified user or the server allows it)
            // Actually, the server requires verification. Let's use the seeded 'client' user.
            console.log('   Using seeded client user...');
            clientRes = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'client', password: 'client123' })
            });
        }

        const clientData = await clientRes.json();
        if (!clientRes.ok) throw new Error(`Client Login Failed: ${JSON.stringify(clientData)}`);
        const clientToken = clientData.token;
        console.log('   Client Logged In.');

        // 2. Create Order
        console.log('2. Creating Order...');
        const orderPayload = {
            current_bottle: 'bottle1',
            new_bottle: 'bottle2',
            price_diff: 2.0,
            service_fee: 5.0,
            runner_fee: 5.0,
            tip: 2.5, // Motivation Fee
            total_price: 14.5
        };

        const orderRes = await fetch(`${API_URL}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${clientToken}`
            },
            body: JSON.stringify(orderPayload)
        });

        const orderData = await orderRes.json();
        if (!orderRes.ok) throw new Error(`Order Creation Failed: ${JSON.stringify(orderData)}`);
        console.log('   Order Created:', orderData);

        // 3. Login Runner
        console.log('3. Authenticating Runner...');
        const runnerRes = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'runner', password: 'runner123' })
        });

        const runnerData = await runnerRes.json();
        if (!runnerRes.ok) throw new Error(`Runner Login Failed: ${JSON.stringify(runnerData)}`);
        const runnerToken = runnerData.token;
        console.log('   Runner Logged In.');

        // 4. Fetch Orders
        console.log('4. Fetching Orders as Runner...');
        const fetchRes = await fetch(`${API_URL}/orders`, {
            headers: { 'Authorization': `Bearer ${runnerToken}` }
        });

        const orders = await fetchRes.json();
        if (!fetchRes.ok) throw new Error(`Fetch Orders Failed: ${JSON.stringify(orders)}`);

        console.log(`   Fetched ${orders.length} orders.`);
        const myOrder = orders.find(o => o.id === orderData.orderId);

        if (myOrder) {
            console.log('   SUCCESS: Created order found in runner list!');
            console.log('   Order Details:', myOrder);
        } else {
            console.error('   FAILURE: Created order NOT found in runner list.');
        }

    } catch (error) {
        console.error('TEST FAILED:', error.message);
    }
}

testOrderFlow();
