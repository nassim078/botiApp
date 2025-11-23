const API_URL = 'http://localhost:3000';

async function debugAccount() {
    try {
        console.log('--- Debugging Account Data ---');

        // 1. Login Client
        const clientCreds = { username: 'client', password: 'client123' };
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(clientCreds)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`Login Failed: ${JSON.stringify(data)}`);

        const token = data.token;
        console.log('Login successful. Token obtained.');

        // 2. Get Profile
        const meRes = await fetch(`${API_URL}/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const meData = await meRes.json();
        console.log('Profile Data:', meData);

        if (!meData.full_name) {
            console.warn('WARNING: full_name is missing or empty!');
        } else {
            console.log(`full_name: "${meData.full_name}"`);
            console.log(`First char: "${meData.full_name[0]}"`);
        }

    } catch (error) {
        console.error('DEBUG FAILED:', error);
    }
}

debugAccount();
