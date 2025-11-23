
const API_URL = 'http://localhost:3000';

async function testAcceptFlow() {
    try {
        console.log('--- Starting Accept Order Flow Test ---');

        // 1. Login Client
        console.log('1. Authenticating Client...');
        const clientRes = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'client', password: 'client123' })
        });
        const clientData = await clientRes.json();
        if (!clientRes.ok) throw new Error(`Client Login Failed: ${JSON.stringify(clientData)}`);
        const clientToken = clientData.token;

        // 2. Create Order
        console.log('2. Creating Order...');
        const orderPayload = {
            current_bottle: 'bottle1',
            new_bottle: 'bottle2',
            price_diff: 2.0,
            service_fee: 5.0,
            runner_fee: 5.0,
            tip: 2.5,
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
        const orderId = orderData.orderId;
        console.log('   Order Created:', orderId);

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

        // 4. Accept Order
        console.log(`4. Accepting Order ${orderId}...`);
        const acceptRes = await fetch(`${API_URL}/orders/${orderId}/accept`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${runnerToken}` }
        });

        const acceptData = await acceptRes.json();
        if (!acceptRes.ok) {
            console.error('Accept Response:', acceptRes.status, acceptData);
            throw new Error(`Accept Order Failed: ${JSON.stringify(acceptData)}`);
        }
        console.log('   SUCCESS: Order Accepted!', acceptData);

    } catch (error) {
        console.error('TEST FAILED:', error);
    }
}

testAcceptFlow();
