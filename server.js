const express = require('express');
const sgMail = require('@sendgrid/mail');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

app.post('/api/send-email', async (req, res) => {
    const { name, email, phone, message } = req.body;

    const msg = {
        to: 'aimi@keboon.net',
        from: 'your-verified-sender@example.com', // Replace with your SendGrid verified sender
        subject: 'New Contact Form Submission',
        text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\nMessage: ${message}`,
        html: `<strong>Name:</strong> ${name}<br>
               <strong>Email:</strong> ${email}<br>
               <strong>Phone:</strong> ${phone}<br>
               <strong>Message:</strong> ${message}`,
    };

    try {
        await sgMail.send(msg);
        res.status(200).send('Email sent successfully');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error sending email');
    }
});

// For any other routes, serve the index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));