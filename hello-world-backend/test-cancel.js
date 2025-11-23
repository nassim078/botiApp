
const API_URL = 'http://localhost:3000';

async function testCancelFlow() {
    try {
        console.log('--- Starting Cancel Flow Test ---');

        // 1. Login Client
        console.log('1. Authenticating Client...');
        const clientRes = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'client', password: 'client123' })
        });
        const clientData = await clientRes.json();
        const clientToken = clientData.token;
        const clientId = 3; // Assuming from seed

        // 2. Login Runner
        console.log('2. Authenticating Runner...');
        const runnerRes = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'runner', password: 'runner123' })
        });
        const runnerData = await runnerRes.json();
        const runnerToken = runnerData.token;
        const runnerId = 2; // Assuming from seed

        // --- TEST CASE A: Client Cancels Pending Order ---
        console.log('\n--- TEST CASE A: Client Cancels Pending Order ---');
        const orderPayload = {
            current_bottle: 'bottle1',
            new_bottle: 'bottle2',
            delivery_address: '123 Test St',
            price_diff: 2.0,
            service_fee: 5.0,
            runner_fee: 5.0,
            tip: 2.5,
            total_price: 14.5
        };

        const orderResA = await fetch(`${API_URL}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${clientToken}`
            },
            body: JSON.stringify(orderPayload)
        });
        const orderDataA = await orderResA.json();
        const orderIdA = orderDataA.orderId;
        console.log('   Order A Created:', orderIdA);

        const cancelResA = await fetch(`${API_URL}/orders/${orderIdA}/cancel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${clientToken}`
            },
            body: JSON.stringify({ reason: 'Changed mind' })
        });

        const textA = await cancelResA.text();
        try {
            const cancelDataA = JSON.parse(textA);
            console.log('   Client Cancel Result:', cancelResA.status, cancelDataA);
        } catch (e) {
            console.error('   Client Cancel JSON Parse Error:', e);
            const fs = require('fs');
            fs.writeFileSync('error.log', textA);
            console.error('   Response Text written to error.log');
        }


        // --- TEST CASE B: Runner Cancels Accepted Order ---
        console.log('\n--- TEST CASE B: Runner Cancels Accepted Order ---');
        const orderResB = await fetch(`${API_URL}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${clientToken}`
            },
            body: JSON.stringify(orderPayload)
        });
        const orderDataB = await orderResB.json();
        const orderIdB = orderDataB.orderId;
        console.log('   Order B Created:', orderIdB);

        // Runner Accepts
        const acceptResB = await fetch(`${API_URL}/orders/${orderIdB}/accept`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${runnerToken}` }
        });
        console.log('   Runner Accept Result:', acceptResB.status);

        // Runner Cancels
        const cancelResB = await fetch(`${API_URL}/orders/${orderIdB}/cancel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${runnerToken}`
            },
            body: JSON.stringify({ reason: 'Emergency' })
        });
        const cancelDataB = await cancelResB.json();
        console.log('   Runner Cancel Result:', cancelResB.status, cancelDataB);


        // --- TEST CASE C: Runner Cancels Pending Order (Should Fail) ---
        console.log('\n--- TEST CASE C: Runner Cancels Pending Order (Should Fail) ---');
        const orderResC = await fetch(`${API_URL}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${clientToken}`
            },
            body: JSON.stringify(orderPayload)
        });
        const orderDataC = await orderResC.json();
        const orderIdC = orderDataC.orderId;
        console.log('   Order C Created:', orderIdC);

        // Runner Tries to Cancel WITHOUT Accepting
        const cancelResC = await fetch(`${API_URL}/orders/${orderIdC}/cancel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${runnerToken}`
            },
            body: JSON.stringify({ reason: 'I dont want this' })
        });
        const cancelDataC = await cancelResC.json();
        console.log('   Runner Cancel Pending Result:', cancelResC.status, cancelDataC);

    } catch (error) {
        console.error('TEST FAILED:', error);
    }
}

testCancelFlow();
