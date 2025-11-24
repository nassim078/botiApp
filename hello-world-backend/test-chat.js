// const fetch = require('node-fetch'); // Native fetch in Node 21

const API_URL = 'http://127.0.0.1:3000';

async function testChat() {
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
        console.log('Client Token:', clientToken ? 'OK' : 'FAIL');

        // 2. Login as Runner
        console.log('Logging in as Runner...');
        const runnerRes = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'runner', password: 'runner123' })
        });
        const runnerData = await runnerRes.json();
        const runnerToken = runnerData.token;
        console.log('Runner Token:', runnerToken ? 'OK' : 'FAIL');

        // 2.5 Clear Runner's Active Orders
        console.log('Clearing Runner Active Orders...');
        // We can't easily get the active order ID via API without parsing /my-orders
        // So let's just fetch /my-orders and complete any that are 'accepted'
        const myOrdersRes = await fetch(`${API_URL}/my-orders`, {
            headers: { 'Authorization': `Bearer ${runnerToken}` }
        });
        const myOrders = await myOrdersRes.json();
        const activeOrder = myOrders.find(o => o.status === 'accepted');

        if (activeOrder) {
            console.log(`Completing active order ${activeOrder.id}...`);
            await fetch(`${API_URL}/orders/${activeOrder.id}/complete`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${runnerToken}` }
            });
        }

        // 3. Create Order (Client)
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
                delivery_address: '123 Chat St',
                price_diff: 0,
                service_fee: 5,
                runner_fee: 5,
                tip: 2,
                total_price: 12
            })
        });
        const orderData = await orderRes.json();
        const orderId = orderData.orderId;
        console.log('Order Created:', orderId);

        // 4. Accept Order (Runner)
        console.log('Accepting Order...');
        const acceptRes = await fetch(`${API_URL}/orders/${orderId}/accept`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${runnerToken}`
            }
        });
        const acceptData = await acceptRes.json();
        console.log('Order Accepted Response:', acceptData);

        // 5. Send Message (Client -> Runner)
        console.log('Sending Message (Client -> Runner)...');
        const msgRes = await fetch(`${API_URL}/orders/${orderId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${clientToken}`
            },
            body: JSON.stringify({ content: 'Hello Runner! Where are you?' })
        });

        if (msgRes.status !== 200) {
            console.log('Error Status:', msgRes.status);
            const errText = await msgRes.text();
            console.log('Error Body:', errText);
        } else {
            const msgData = await msgRes.json();
            console.log('Message Sent:', msgData);
        }

        // 6. Get Messages (Runner)
        console.log('Fetching Messages (Runner)...');
        const getMsgRes = await fetch(`${API_URL}/orders/${orderId}/messages`, {
            headers: {
                'Authorization': `Bearer ${runnerToken}`
            }
        });
        const messages = await getMsgRes.json();
        console.log('Messages:', messages);

    } catch (error) {
        console.error('Test Failed:', error);
    }
}

testChat();
