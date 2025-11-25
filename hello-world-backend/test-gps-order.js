const API_URL = 'http://127.0.0.1:3000';

async function testOrderWithGPS() {
    try {
        // 1. Login as Client
        console.log('Logging in as Client...');
        const loginRes = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'client', password: 'client123' })
        });
        const loginData = await loginRes.json();
        const token = loginData.token;
        console.log('✅ Logged in successfully');

        // 2. Create order with GPS coordinates
        console.log('\nCreating order with GPS coordinates...');
        const orderRes = await fetch(`${API_URL}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                current_bottle: 'B12',
                new_bottle: 'B14',
                delivery_address: 'Test Street 123',
                client_latitude: 48.8566,  // Paris coordinates
                client_longitude: 2.3522,
                price_diff: 2,
                service_fee: 5,
                runner_fee: 5,
                tip: 3,
                total_price: 15
            })
        });

        if (!orderRes.ok) {
            const errorData = await orderRes.json();
            console.error('❌ Order creation failed:', errorData);
            process.exit(1);
        }

        const orderData = await orderRes.json();
        console.log('✅ Order created successfully:', orderData);

        // 3. Fetch orders to verify GPS data is stored
        console.log('\nFetching orders to verify...');
        const getOrdersRes = await fetch(`${API_URL}/orders`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const orders = await getOrdersRes.json();
        const createdOrder = orders.find(o => o.id === orderData.orderId);

        if (createdOrder && createdOrder.client_latitude && createdOrder.client_longitude) {
            console.log('✅ GPS coordinates stored correctly:');
            console.log(`   Latitude: ${createdOrder.client_latitude}`);
            console.log(`   Longitude: ${createdOrder.client_longitude}`);
            console.log('\n🎉 Test PASSED - GPS distance feature working!');
        } else {
            console.log('❌ GPS coordinates not found in order');
            console.log('Order data:', createdOrder);
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

testOrderWithGPS();
