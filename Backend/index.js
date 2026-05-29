import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import complaintRoutes from './routes/complaints.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Request Logger Middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Middleware
app.use(cors({
  origin: true, // Allows any origin during development, reflecting the request origin
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', complaintRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Debug endpoint - check env vars and DB
app.get('/debug', async (req, res) => {
  const { db } = await import('./db.js');
  let dbStatus = 'not connected';
  try {
    if (db) {
      await db.execute('select 1');
      dbStatus = 'connected';
    }
  } catch (e) {
    dbStatus = 'error: ' + e.message;
  }
  res.json({
    NODE_ENV: process.env.NODE_ENV || 'NOT SET',
    DATABASE_URL: process.env.DATABASE_URL ? 'SET ✅' : 'NOT SET ❌',
    JWT_SECRET: process.env.JWT_SECRET ? 'SET ✅' : 'NOT SET ❌',
    RESEND_API_KEY: process.env.RESEND_API_KEY ? 'SET ✅' : 'NOT SET ❌',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'SET ✅' : 'NOT SET ❌',
    db: dbStatus,
  });
});

app.use((err, req, res, next) => {
  console.error('Internal Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
