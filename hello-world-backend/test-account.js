// const fetch = require('node-fetch'); // Native fetch

const API_URL = 'http://localhost:3000';

async function testAccountFlow() {
    try {
        console.log('--- Starting Account Flow Test ---');

        // 1. Login Client
        console.log('1. Authenticating Client...');
        const clientCreds = { username: 'client', password: 'client123' };

        let clientRes = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(clientCreds)
        });

        const clientData = await clientRes.json();
        if (!clientRes.ok) throw new Error(`Client Login Failed: ${JSON.stringify(clientData)}`);
        const clientToken = clientData.token;
        console.log('   Client Logged In.');

        // 2. Update Profile
        console.log('2. Updating Profile...');
        const updatePayload = {
            full_name: 'Updated Client Name',
            username: 'client_updated',
            dob: '1995-05-05',
            profile_picture: 'https://example.com/pic.jpg'
        };

        const updateRes = await fetch(`${API_URL}/me`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${clientToken}`
            },
            body: JSON.stringify(updatePayload)
        });

        const updateData = await updateRes.json();
        if (!updateRes.ok) throw new Error(`Profile Update Failed: ${JSON.stringify(updateData)}`);
        console.log('   Profile Updated:', updateData);

        // 3. Verify Profile Update
        console.log('3. Verifying Profile...');
        const meRes = await fetch(`${API_URL}/me`, {
            headers: { 'Authorization': `Bearer ${clientToken}` }
        });
        const meData = await meRes.json();
        if (meData.full_name !== updatePayload.full_name) throw new Error('Profile name mismatch');
        console.log('   Profile Verified:', meData);

        // 4. Check History
        console.log('4. Checking History...');
        const historyRes = await fetch(`${API_URL}/my-orders`, {
            headers: { 'Authorization': `Bearer ${clientToken}` }
        });
        const historyData = await historyRes.json();
        console.log(`   Found ${historyData.length} past orders.`);

        // Revert username for re-runnability
        console.log('5. Reverting Username...');
        await fetch(`${API_URL}/me`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${clientToken}`
            },
            body: JSON.stringify({ ...updatePayload, username: 'client' })
        });
        console.log('   Reverted.');

    } catch (error) {
        console.error('TEST FAILED:', error.message);
    }
}

testAccountFlow();
