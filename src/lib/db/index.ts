import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { CREATE_JOBS_TABLE } from './schema';

const dbDir = path.join(process.cwd(), 'db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'videogen.db');
const db = new Database(dbPath);
db.exec(CREATE_JOBS_TABLE);
export default db;
