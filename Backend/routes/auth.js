import express from 'express';
import { db } from '../db.js';
import { users } from '../schema.js';
import { eq, and } from 'drizzle-orm';
import { Resend } from 'resend';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Resend setup
const resend = new Resend(process.env.RESEND_API_KEY);

// Helper to generate OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// POST /api/auth/send-otp
router.post('/send-otp', async (req, res) => {
  console.log('[ENTRY] POST /api/auth/send-otp');
  const { name, email } = req.body;
  if (!name || !email) {
    console.log('[EXIT] POST /api/auth/send-otp - Missing name or email');
    return res.status(400).json({ error: 'Name and Email are required' });
  }

  try {
    // Check if user already exists and is verified
    const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUser.length > 0 && existingUser[0].is_verified) {
      console.log('[EXIT] POST /api/auth/send-otp - Email already registered');
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
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'info@pmishrarbl.shop',
      to: email,
      subject: 'Your Registration OTP',
      text: `Hello ${name},\n\nYour OTP for registration is: ${otp}. It will expire in 10 minutes.`,
    });

    if (error) {
      console.error('Error sending email via Resend:', error);
      throw new Error(error.message || 'Failed to send OTP email');
    }

    res.json({ message: 'OTP sent successfully to your email' });
    console.log('[EXIT] POST /api/auth/send-otp - Success');
  } catch (error) {
    console.error('[ERROR] in send-otp:', error);
    res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  console.log('[ENTRY] POST /api/auth/register');
  const { email, otp, password } = req.body;
  if (!email || !otp || !password) {
    console.log('[EXIT] POST /api/auth/register - Missing fields');
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const user = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (user.length === 0) {
      console.log('[EXIT] POST /api/auth/register - User not found');
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = user[0];
    if (userData.otp !== otp) {
      console.log('[EXIT] POST /api/auth/register - Invalid OTP');
      return res.status(400).json({ error: 'Invalid OTP' });
    }
    if (new Date() > new Date(userData.otp_expiry)) {
      console.log('[EXIT] POST /api/auth/register - OTP expired');
      return res.status(400).json({ error: 'OTP expired' });
    }

    await db.update(users).set({
      password,
      is_verified: true,
      otp: null,
      otp_expiry: null
    }).where(eq(users.email, email));

    res.json({ message: 'Registration successful! You can now login.' });
    console.log('[EXIT] POST /api/auth/register - Success');
  } catch (error) {
    console.error('[ERROR] in register:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  console.log('[ENTRY] POST /api/auth/login');
  const { email, password } = req.body;
  if (!email || !password) {
    console.log('[EXIT] POST /api/auth/login - Missing email or password');
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (user.length === 0) {
      console.log('[EXIT] POST /api/auth/login - User not found');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const userData = user[0];
    if (!userData.is_verified) {
      console.log('[EXIT] POST /api/auth/login - User unverified');
      return res.status(401).json({ error: 'Please verify your email first' });
    }
    if (userData.password !== password) {
      console.log('[EXIT] POST /api/auth/login - Incorrect password');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: userData.id, email: userData.email, role: userData.role }, process.env.JWT_SECRET);

    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    res.json({
      message: 'Login successful',
      token,
      user: { name: userData.name, email: userData.email, role: userData.role }
    });
    console.log('[EXIT] POST /api/auth/login - Success');
  } catch (error) {
    console.error('[ERROR] in login:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  console.log('[ENTRY] POST /api/auth/logout');
  res.clearCookie('token', {
    httpOnly: true,
    secure: true,
    sameSite: 'none'
  });
  res.json({ message: 'Logged out successfully' });
  console.log('[EXIT] POST /api/auth/logout - Success');
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  console.log('[ENTRY] GET /api/auth/me');
  let token = req.cookies.token;
  
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (!token) {
    console.log('[EXIT] GET /api/auth/me - Not authenticated');
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ user: decoded });
    console.log('[EXIT] GET /api/auth/me - Success');
  } catch (error) {
    console.error('[ERROR] in me:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
