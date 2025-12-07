const express = require('express');
const router = express.Router();
const User = require('../user/user.model');
const jwt = require('jsonwebtoken');
const {Resend} = require('resend');

const {JWT_SECRET, RESEND_API_KEY, RESEND_EMAIL} = process.env;

const resend = new Resend(RESEND_API_KEY);

router.post('/login', async (req, res) => {
    try {
        const {email, password} = req.body;

        const user = await User.findOne({email}).select('+password');

        const passwordIsCorrect = await user.comparePassword(password);

        if (!passwordIsCorrect) {
            return res.status(404).json({message: "Incorrect credentials"})
        }

        const token = jwt.sign({userId: user._id}, JWT_SECRET, {expiresIn: '1h'});

        return res.json({token, userId: user._id});
    }
    catch (error) {
        return res.status(400).json({error});
    }
})

router.post('/register', async (req, res) => {
    try {
        const {fullName, email, password} = req.body;

        const user = await User.create({
            fullName,
            email,
            password
        })

        await resend.emails.send({
            from: RESEND_EMAIL,
            to: email,
            subject: 'Welcome to Events Management System',
            text: `Hello ${fullName},
                
Welcome to Events Management System!
                
Best wishes!`,
        });

        const token = jwt.sign({userId: user._id}, JWT_SECRET, {expiresIn: '1h'});

        res.json({token, userId: user._id})
    }
    catch (error) {
        console.error(error);
        res.status(400).json({error});
    }
})

module.exports = router;