import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import morgan from 'morgan';
import authRoutes from './routes/auth.js';
import complaintRoutes from './routes/complaints.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Use Morgan for API response tracking
app.use(morgan('dev'));

// Request Logger Middleware
app.use((req, res, next) => {
  console.log(`[ENTRY] Request: ${req.method} ${req.url}`);
  res.on('finish', () => {
    console.log(`[EXIT] Request completed: ${req.method} ${req.url} with status ${res.statusCode}`);
  });
  next();
});

const allowedOrigins = [
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'https://praveenmishra728.github.io',
  'https://praveenmishra728.github.io/Complaints-Registration-Platform-Full-Stack',
  'https://arrear.pmishrarbl.shop',
  'https://arrear.pmishrarbl.shop/'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    const message = 'The CORS policy for this site does not allow access from the specified Origin.';
    return callback(new Error(message), false);
  },
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', complaintRoutes);

// Health check
app.get('/health', (req, res) => {
  console.log('[ENTRY] GET /health handler');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
  console.log('[EXIT] GET /health handler response sent');
});

// Debug endpoint - check env vars and DB
app.get('/debug', async (req, res) => {
  console.log('[ENTRY] GET /debug handler');
  const { db } = await import('./db.js');
  let dbStatus = 'not connected';
  try {
    if (db) {
      await db.execute('select 1');
      dbStatus = 'connected';
    }
  } catch (e) {
    dbStatus = {
      message: e.message,
      code: e.code,
      stack: e.stack,
      detail: e.detail,
      hint: e.hint,
      cause: e.cause ? { message: e.cause.message, code: e.cause.code, stack: e.cause.stack } : null,
      originalError: e.originalError ? { message: e.originalError.message } : null
    };
  }
  res.json({
    NODE_ENV: process.env.NODE_ENV || 'NOT SET',
    DATABASE_URL: process.env.DATABASE_URL ? 'SET ✅' : 'NOT SET ❌',
    JWT_SECRET: process.env.JWT_SECRET ? 'SET ✅' : 'NOT SET ❌',
    RESEND_API_KEY: process.env.RESEND_API_KEY ? 'SET ✅' : 'NOT SET ❌',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'SET ✅' : 'NOT SET ❌',
    db: dbStatus,
  });
  console.log('[EXIT] GET /debug handler response sent');
});

app.use((err, req, res, next) => {
  console.error('Internal Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
