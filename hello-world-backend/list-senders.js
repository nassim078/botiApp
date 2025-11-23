require('dotenv').config();
const client = require('@sendgrid/client');

client.setApiKey(process.env.SENDGRID_API_KEY);

const request = {
    method: 'GET',
    url: '/v3/verified_senders',
};

client.request(request)
    .then(([response, body]) => {
        console.log('--- Verified Senders ---');
        console.log(JSON.stringify(body, null, 2));
    })
    .catch(error => {
        console.error('Error fetching senders:');
        console.error(error.toString());
        if (error.response) {
            console.error(JSON.stringify(error.response.body, null, 2));
        }
    });
