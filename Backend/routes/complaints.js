import express from 'express';
import { db } from '../db.js';
import { complaints, users } from '../schema.js';
import { eq, desc } from 'drizzle-orm';
import { GoogleGenerativeAI } from '@google/generative-ai';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Gemini setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

// Middleware to verify JWT
const authenticate = (req, res, next) => {
  console.log('[ENTRY] Middleware authenticate');
  let token = req.cookies.token;

  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (!token) {
    console.log('[EXIT] Middleware authenticate - Unauthorized (no token)');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    console.log('[EXIT] Middleware authenticate - Success');
    next();
  } catch (error) {
    console.error('[ERROR] Middleware authenticate - Invalid token:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Middleware to check admin role
const isAdmin = (req, res, next) => {
  console.log('[ENTRY] Middleware isAdmin');
  if (req.user.role !== 'admin') {
    console.log('[EXIT] Middleware isAdmin - Access denied');
    return res.status(403).json({ error: 'Access denied. Admins only.' });
  }
  console.log('[EXIT] Middleware isAdmin - Authorized');
  next();
};

// POST /api/ai/question
router.post('/ai/question', async (req, res) => {
  console.log('[ENTRY] POST /api/ai/question');
  const { complaint_text } = req.body;
  if (!complaint_text) {
    console.log('[EXIT] POST /api/ai/question - Missing complaint text');
    return res.status(400).json({ error: 'Complaint text is required' });
  }

  try {
    const prompt = `A user has submitted the following complaint: "${complaint_text}". 
    Act as a customer support representative and generate exactly one short follow-up question to better understand the situation. 
    Return ONLY the question text.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    res.json({ question: text });
    console.log('[EXIT] POST /api/ai/question - Success');
  } catch (error) {
    console.error('[ERROR] calling Gemini API:', {
      message: error.message,
      stack: error.stack,
      complaint_text
    });
    res.status(500).json({ error: 'Failed to generate AI question. Please check server logs.' });
  }
});

// POST /api/complaints
router.post('/complaints', authenticate, async (req, res) => {
  console.log('[ENTRY] POST /api/complaints');
  const { complaint_text, ai_question, user_answer } = req.body;
  if (!complaint_text) {
    console.log('[EXIT] POST /api/complaints - Missing complaint text');
    return res.status(400).json({ error: 'Complaint text is required' });
  }

  try {
    const [newComplaint] = await db.insert(complaints).values({
      userId: req.user.id,
      complaintText: complaint_text,
      aiQuestion: ai_question,
      userAnswer: user_answer,
    }).returning();

    res.json(newComplaint);
    console.log('[EXIT] POST /api/complaints - Success');
  } catch (error) {
    console.error('[ERROR] saving complaint:', error);
    res.status(500).json({ error: 'Failed to save complaint' });
  }
});

// GET /api/complaints/my
router.get('/complaints/my', authenticate, async (req, res) => {
  console.log('[ENTRY] GET /api/complaints/my');
  try {
    const myComplaints = await db.select()
      .from(complaints)
      .where(eq(complaints.userId, req.user.id))
      .orderBy(desc(complaints.created_at));
    
    res.json(myComplaints);
    console.log('[EXIT] GET /api/complaints/my - Success');
  } catch (error) {
    console.error('[ERROR] fetching my complaints:', error);
    res.status(500).json({ error: 'Failed to fetch complaints' });
  }
});

// GET /api/admin/complaints
router.get('/admin/complaints', authenticate, isAdmin, async (req, res) => {
  console.log('[ENTRY] GET /api/admin/complaints');
  try {
    const allComplaints = await db.select({
      id: complaints.id,
      userName: users.name,
      userEmail: users.email,
      complaintText: complaints.complaintText,
      aiQuestion: complaints.aiQuestion,
      userAnswer: complaints.userAnswer,
      created_at: complaints.created_at,
    })
    .from(complaints)
    .innerJoin(users, eq(complaints.userId, users.id))
    .orderBy(desc(complaints.created_at));

    res.json(allComplaints);
    console.log('[EXIT] GET /api/admin/complaints - Success');
  } catch (error) {
    console.error('[ERROR] fetching all complaints:', error);
    res.status(500).json({ error: 'Failed to fetch all complaints' });
  }
});

export default router;
