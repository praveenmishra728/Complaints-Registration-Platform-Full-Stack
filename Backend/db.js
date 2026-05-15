import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

let client;
try {
  if (!connectionString || connectionString === 'your_supabase_connection_string') {
    throw new Error("DATABASE_URL is not configured. Please update your .env file.");
  }
  client = postgres(connectionString);
} catch (err) {
  console.error("❌ Database Connection Error:", err.message);
  // Create a dummy client or just let it be undefined - but drizzle needs a client
  // For now, we'll just log and let the next steps fail gracefully
}

export const db = client ? drizzle(client, { schema }) : null;
