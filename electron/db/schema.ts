import path from 'path'
import fs from 'fs'
import { app } from 'electron'

type SqlJsDatabase = import('sql.js').Database

let db: SqlJsDatabase | null = null

function getDbPath() {
  return path.join(app.getPath('userData'), 'insurance-assistant.db')
}

export async function initDatabase(): Promise<SqlJsDatabase> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const initSqlJs = require('sql.js')
  const SQL = await initSqlJs()

  const dbPath = getDbPath()

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  db!.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      age INTEGER,
      gender TEXT,
      birth_date TEXT,
      anniversary_date TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      company_name TEXT,
      product_name TEXT,
      monthly_premium INTEGER DEFAULT 0,
      expiry_age INTEGER,
      payment_count INTEGER DEFAULT 0,
      total_paid INTEGER DEFAULT 0,
      is_renewable INTEGER DEFAULT 0,
      product_type TEXT DEFAULT 'health'
    );

    CREATE TABLE IF NOT EXISTS riders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL,
      name TEXT,
      amount INTEGER DEFAULT 0,
      expiry_age INTEGER,
      is_renewable INTEGER DEFAULT 0,
      category TEXT DEFAULT 'other'
    );

    CREATE TABLE IF NOT EXISTS analysis_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      cancer_actual INTEGER DEFAULT 0,
      brain_actual INTEGER DEFAULT 0,
      heart_actual INTEGER DEFAULT 0,
      problem_tags TEXT DEFAULT '{}',
      decisions TEXT DEFAULT '[]',
      surrender_values TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS consultation_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      current_cf TEXT DEFAULT 'CF1',
      current_md TEXT DEFAULT 'MD1-1',
      resistances TEXT DEFAULT '[]',
      conversion_success INTEGER DEFAULT 0,
      started_at TEXT DEFAULT (datetime('now')),
      ended_at TEXT
    );
  `)

  saveDatabase()
  return db!
}

export function getDatabase(): SqlJsDatabase {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function saveDatabase() {
  if (!db) return
  try {
    const data = db.export()
    fs.writeFileSync(getDbPath(), Buffer.from(data))
  } catch (e) {
    console.error('DB save error:', e)
  }
}

export function getLastInsertId(): number {
  if (!db) return 0
  const result = db.exec('SELECT last_insert_rowid()')
  return (result[0]?.values[0]?.[0] as number) ?? 0
}
