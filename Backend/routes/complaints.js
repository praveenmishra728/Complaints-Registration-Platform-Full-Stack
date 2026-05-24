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
  let token = req.cookies.token;

  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Middleware to check admin role
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied. Admins only.' });
  next();
};

// POST /api/ai/question
router.post('/ai/question', async (req, res) => {
  const { complaint_text } = req.body;
  if (!complaint_text) return res.status(400).json({ error: 'Complaint text is required' });

  try {
    const prompt = `A user has submitted the following complaint: "${complaint_text}". 
    Act as a customer support representative and generate exactly one short follow-up question to better understand the situation. 
    Return ONLY the question text.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    res.json({ question: text });
  } catch (error) {
    console.error('Error calling Gemini API:', {
      message: error.message,
      stack: error.stack,
      complaint_text
    });
    res.status(500).json({ error: 'Failed to generate AI question. Please check server logs.' });
  }
});

// POST /api/complaints
router.post('/complaints', authenticate, async (req, res) => {
  const { complaint_text, ai_question, user_answer } = req.body;
  if (!complaint_text) return res.status(400).json({ error: 'Complaint text is required' });

  try {
    const [newComplaint] = await db.insert(complaints).values({
      userId: req.user.id,
      complaintText: complaint_text,
      aiQuestion: ai_question,
      userAnswer: user_answer,
    }).returning();

    res.json(newComplaint);
  } catch (error) {
    console.error('Error saving complaint:', error);
    res.status(500).json({ error: 'Failed to save complaint' });
  }
});

// GET /api/complaints/my
router.get('/complaints/my', authenticate, async (req, res) => {
  try {
    const myComplaints = await db.select()
      .from(complaints)
      .where(eq(complaints.userId, req.user.id))
      .orderBy(desc(complaints.created_at));
    
    res.json(myComplaints);
  } catch (error) {
    console.error('Error fetching my complaints:', error);
    res.status(500).json({ error: 'Failed to fetch complaints' });
  }
});

// GET /api/admin/complaints
router.get('/admin/complaints', authenticate, isAdmin, async (req, res) => {
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
  } catch (error) {
    console.error('Error fetching all complaints:', error);
    res.status(500).json({ error: 'Failed to fetch all complaints' });
  }
});

export default router;
