import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

// We use better-sqlite3 for the AI Studio preview environment and local dev.
// To deploy to Cloudflare D1, you would swap this file to use drizzle-orm/d1.
const sqlite = new Database('sqlite.db');
export const db = drizzle(sqlite);
