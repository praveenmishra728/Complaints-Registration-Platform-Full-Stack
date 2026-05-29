import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');

dotenv.config();

const connectionString = process.env.DATABASE_URL;

let client;
try {
  if (!connectionString || connectionString === 'your_supabase_connection_string') {
    throw new Error("DATABASE_URL is not configured. Please update your .env file.");
  }
  client = postgres(connectionString, { ssl: 'require', prepare: false });
  console.log("✅ Database client initialized");
} catch (err) {
  console.error("❌ Database Connection Error:", err.message);
}

export const db = client ? drizzle(client, { schema }) : null;
if (db) console.log("✅ Drizzle ORM connected to DB");
else console.log("❌ Drizzle ORM failed to initialize (db is null)");
