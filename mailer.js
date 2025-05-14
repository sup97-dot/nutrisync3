const nodemailer = require(`nodemailer`);


const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

const sendResetEmail = (to, token) => {
    const resetLink = `http://localhost:3000/reset-password?token=${token}&email=${to}`;
    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to,
        subject: 'Password Reset Request',
        html: `<p>Click <a href="${resetLink}">here</a> to reset your password. This link will expire in 1 hour</p>`,
    };

    return transporter.sendMail(mailOptions);
};

module.exports = sendResetEmail;