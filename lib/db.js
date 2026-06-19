const fs = require('fs');
const path = require('path');
require('dotenv').config({ quiet: true });

const DATABASE_URL = process.env.DATABASE_URL;
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'raids.db');

function normalizePostgresSslMode(connectionString) {
  if (!connectionString) return connectionString;

  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get('sslmode')?.toLowerCase();
    if (['prefer', 'require', 'verify-ca'].includes(sslMode)) {
      url.searchParams.set('sslmode', 'verify-full');
    }
    return url.toString();
  } catch {
    return connectionString;
  }
}

let dbClient = null;
let initPromise = null;

async function init() {
  if (dbClient) return dbClient;
  if (initPromise) return initPromise;

  initPromise = initializeDatabase();
  try {
    return await initPromise;
  } catch (error) {
    dbClient = null;
    throw error;
  } finally {
    initPromise = null;
  }
}

async function initializeDatabase() {
  if (DATABASE_URL) {
    // A pool replaces terminated idle connections instead of leaving the bot
    // attached to one dead PostgreSQL socket forever.
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: normalizePostgresSslMode(DATABASE_URL),
      max: 5,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000
    });

    pool.on('error', error => {
      // pg removes this broken idle client from the pool. Keeping an error
      // listener here prevents a provider-side disconnect from crashing Node.
      console.warn('PostgreSQL idle connection was terminated; it will be replaced:', error.message);
    });

    try {
      await pool.query('SELECT 1');
      await pool.query(`CREATE TABLE IF NOT EXISTS raids (
        id SERIAL PRIMARY KEY,
        raid_id TEXT UNIQUE,
        guild_id TEXT,
        channel_id TEXT,
        message_id TEXT,
        other_guild_id TEXT,
        other_channel_id TEXT,
        other_message_id TEXT,
        scheduled_at BIGINT,
        status TEXT DEFAULT 'scheduled',
        created_at BIGINT
      )`);
    } catch (error) {
      await pool.end().catch(() => {});
      throw error;
    }
    dbClient = pool;
    return dbClient;
  }

  // Fallback to SQLite
  const sqlite3 = require('sqlite3').verbose();
  // ensure directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  dbClient = new sqlite3.Database(DB_PATH);
  await new Promise((res, rej) => {
    dbClient.run(`CREATE TABLE IF NOT EXISTS raids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raid_id TEXT UNIQUE,
      guild_id TEXT,
      channel_id TEXT,
      message_id TEXT,
      other_guild_id TEXT,
      other_channel_id TEXT,
      other_message_id TEXT,
      scheduled_at INTEGER,
      status TEXT DEFAULT 'scheduled',
      created_at INTEGER
    )`, (err) => err ? rej(err) : res());
  });
  return dbClient;
}

function convertSql(query) {
  if (!DATABASE_URL) return query;
  let index = 0;
  return query.replace(/\?/g, () => `$${++index}`);
}

// Unified query interface for simple use
async function run(query, params = []) {
  if (!dbClient) await init();
  if (DATABASE_URL) {
    return dbClient.query(convertSql(query), params);
  } else {
    return new Promise((resolve, reject) => {
      dbClient.run(query, params, function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }
}

async function get(query, params = []) {
  if (!dbClient) await init();
  if (DATABASE_URL) {
    const res = await dbClient.query(convertSql(query), params);
    return res.rows[0];
  } else {
    return new Promise((resolve, reject) => {
      dbClient.get(query, params, (err, row) => err ? reject(err) : resolve(row));
    });
  }
}

async function all(query, params = []) {
  if (!dbClient) await init();
  if (DATABASE_URL) {
    const res = await dbClient.query(convertSql(query), params);
    return res.rows;
  } else {
    return new Promise((resolve, reject) => {
      dbClient.all(query, params, (err, rows) => err ? reject(err) : resolve(rows));
    });
  }
}

// Convenience helper to insert a raid record using parameterized queries
async function insertRaid({ raid_id, guild_id, channel_id, message_id, other_guild_id, other_channel_id, other_message_id, scheduled_at, created_at }) {
  if (!dbClient) await init();
  if (DATABASE_URL) {
    const q = `INSERT INTO raids (raid_id, guild_id, channel_id, message_id, other_guild_id, other_channel_id, other_message_id, scheduled_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`;
    const params = [raid_id, guild_id, channel_id, message_id, other_guild_id, other_channel_id, other_message_id, scheduled_at, created_at];
    const res = await dbClient.query(q, params);
    return res.rows[0];
  } else {
    const q = `INSERT INTO raids (raid_id, guild_id, channel_id, message_id, other_guild_id, other_channel_id, other_message_id, scheduled_at, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`;
    return new Promise((resolve, reject) => {
      dbClient.run(q, [raid_id, guild_id, channel_id, message_id, other_guild_id, other_channel_id, other_message_id, scheduled_at, created_at], function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID });
      });
    });
  }
}

module.exports = { init, run, get, all, insertRaid };

