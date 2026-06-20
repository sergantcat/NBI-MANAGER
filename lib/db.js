require('dotenv').config({ quiet: true });

const DATABASE_URL = process.env.DATABASE_URL;

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

  throw new Error('Missing DATABASE_URL. Configure the Postgres connection string in your host environment before starting the bot.');
}

function convertSql(query) {
  let index = 0;
  return query.replace(/\?/g, () => `$${++index}`);
}

// Unified query interface for simple use
async function run(query, params = []) {
  if (!dbClient) await init();
  return dbClient.query(convertSql(query), params);
}

async function get(query, params = []) {
  if (!dbClient) await init();
  const res = await dbClient.query(convertSql(query), params);
  return res.rows[0];
}

async function all(query, params = []) {
  if (!dbClient) await init();
  const res = await dbClient.query(convertSql(query), params);
  return res.rows;
}

// Convenience helper to insert a raid record using parameterized queries
async function insertRaid({ raid_id, guild_id, channel_id, message_id, other_guild_id, other_channel_id, other_message_id, scheduled_at, created_at }) {
  if (!dbClient) await init();
  const q = `INSERT INTO raids (raid_id, guild_id, channel_id, message_id, other_guild_id, other_channel_id, other_message_id, scheduled_at, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`;
  const params = [raid_id, guild_id, channel_id, message_id, other_guild_id, other_channel_id, other_message_id, scheduled_at, created_at];
  const res = await dbClient.query(q, params);
  return res.rows[0];
}

module.exports = { init, run, get, all, insertRaid };

