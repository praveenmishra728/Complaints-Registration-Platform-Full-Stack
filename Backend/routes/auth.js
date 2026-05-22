import express from 'express';
import { db } from '../db.js';
import { users } from '../schema.js';
import { eq, and } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Nodemailer setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

// Helper to generate OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// POST /api/auth/send-otp
router.post('/send-otp', async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and Email are required' });

  try {
    // Check if user already exists and is verified
    const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUser.length > 0 && existingUser[0].is_verified) {
      return res.status(400).json({ error: 'Email already registered and verified. Please login.' });
    }

    const otp = generateOTP();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    if (existingUser.length > 0) {
      // Update existing unverified user
      await db.update(users).set({ name, otp, otp_expiry: expiry }).where(eq(users.email, email));
    } else {
      // Create new unverified user
      await db.insert(users).values({ name, email, password: 'pending', otp, otp_expiry: expiry });
    }

    // Send Email
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Your Registration OTP',
      text: `Hello ${name},\n\nYour OTP for registration is: ${otp}. It will expire in 10 minutes.`,
    });

    res.json({ message: 'OTP sent successfully to your email' });
  } catch (error) {
    console.error('Error in send-otp:', error);
    res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, otp, password } = req.body;
  if (!email || !otp || !password) return res.status(400).json({ error: 'All fields are required' });

  try {
    const user = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const userData = user[0];
    if (userData.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });
    if (new Date() > new Date(userData.otp_expiry)) return res.status(400).json({ error: 'OTP expired' });

    await db.update(users).set({
      password,
      is_verified: true,
      otp: null,
      otp_expiry: null
    }).where(eq(users.email, email));

    res.json({ message: 'Registration successful! You can now login.' });
  } catch (error) {
    console.error('Error in register:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  try {
    const user = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (user.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const userData = user[0];
    if (!userData.is_verified) return res.status(401).json({ error: 'Please verify your email first' });
    if (userData.password !== password) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: userData.id, email: userData.email, role: userData.role }, process.env.JWT_SECRET);

    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    res.json({
      message: 'Login successful',
      user: { name: userData.name, email: userData.email, role: userData.role }
    });
  } catch (error) {
    console.error('Error in login:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  res.clearCookie('token', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax'
  });
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ user: decoded });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
