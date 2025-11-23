require('dotenv').config();
const sgMail = require('@sendgrid/mail');

const apiKey = process.env.SENDGRID_API_KEY;
sgMail.setApiKey(apiKey);

const sendTest = async (email) => {
    console.log(`Testing send FROM: '${email}'`);
    const msg = {
        to: email,
        from: email,
        subject: 'Test Email',
        text: 'Testing...',
    };

    try {
        await sgMail.send(msg);
        console.log(`SUCCESS: Sent from ${email}`);
    } catch (error) {
        console.error(`FAILED: Sent from ${email}`);
        if (error.response) {
            console.error(error.response.body.errors[0].message);
        } else {
            console.error(error.toString());
        }
    }
};

(async () => {
    await sendTest('elaoufim@gmail.com');
    await sendTest('elaoufir.n@gmail.com');
})();
