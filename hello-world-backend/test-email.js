require('dotenv').config();
const sgMail = require('@sendgrid/mail');

console.log('--- SendGrid Diagnostic ---');
console.log('API Key Present:', !!process.env.SENDGRID_API_KEY);
console.log('From Email:', process.env.SENDGRID_FROM_EMAIL);

if (!process.env.SENDGRID_API_KEY) {
    console.error('ERROR: Missing SENDGRID_API_KEY in .env');
    process.exit(1);
}

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const msg = {
    to: process.env.SENDGRID_FROM_EMAIL, // Send to self to test
    from: process.env.SENDGRID_FROM_EMAIL,
    subject: 'Test Email from Boti App',
    text: 'If you receive this, SendGrid is configured correctly!',
};

console.log(`Attempting to send email to ${msg.to}...`);

sgMail
    .send(msg)
    .then(() => {
        console.log('SUCCESS: Email sent successfully!');
    })
    .catch((error) => {
        console.error('ERROR: Failed to send email.');
        console.error(error.toString());
        if (error.response) {
            console.error('SendGrid Response Body:', JSON.stringify(error.response.body, null, 2));
        }
    });
