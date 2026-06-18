const db = require('./db');

async function ensureModerationTables() {
  await db.run(`CREATE TABLE IF NOT EXISTS moderation_warns (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_tag TEXT,
    reason TEXT,
    warned_by_id TEXT NOT NULL,
    warned_by_tag TEXT,
    created_at BIGINT NOT NULL
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS moderation_bans (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_tag TEXT,
    reason TEXT,
    banned_by_id TEXT NOT NULL,
    banned_by_tag TEXT,
    created_at BIGINT NOT NULL
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS moderation_blacklists (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_tag TEXT,
    reason TEXT,
    details TEXT,
    role_id TEXT,
    blacklisted_by_id TEXT NOT NULL,
    blacklisted_by_tag TEXT,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  )`);
}

async function insertWarn(entry) {
  await ensureModerationTables();
  return db.run(
    `INSERT INTO moderation_warns (guild_id, user_id, user_tag, reason, warned_by_id, warned_by_tag, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.guildId,
      entry.userId,
      entry.userTag,
      entry.reason,
      entry.moderatorId,
      entry.moderatorTag,
      entry.createdAt
    ]
  );
}

async function insertBan(entry) {
  await ensureModerationTables();
  return db.run(
    `INSERT INTO moderation_bans (guild_id, user_id, user_tag, reason, banned_by_id, banned_by_tag, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.guildId,
      entry.userId,
      entry.userTag,
      entry.reason,
      entry.moderatorId,
      entry.moderatorTag,
      entry.createdAt
    ]
  );
}

async function upsertBlacklist(entry) {
  await ensureModerationTables();
  return db.run(
    `INSERT INTO moderation_blacklists (
      guild_id, user_id, user_tag, reason, details, role_id, blacklisted_by_id, blacklisted_by_tag, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (guild_id, user_id) DO UPDATE SET
      user_tag = ?,
      reason = ?,
      details = ?,
      role_id = ?,
      blacklisted_by_id = ?,
      blacklisted_by_tag = ?,
      created_at = ?`,
    [
      entry.guildId,
      entry.userId,
      entry.userTag,
      entry.reason,
      entry.details,
      entry.roleId,
      entry.moderatorId,
      entry.moderatorTag,
      entry.createdAt,
      entry.userTag,
      entry.reason,
      entry.details,
      entry.roleId,
      entry.moderatorId,
      entry.moderatorTag,
      entry.createdAt
    ]
  );
}

async function deleteBlacklist(guildId, userId) {
  await ensureModerationTables();
  return db.run(
    'DELETE FROM moderation_blacklists WHERE guild_id = ? AND user_id = ?',
    [guildId, userId]
  );
}

module.exports = { ensureModerationTables, insertWarn, insertBan, upsertBlacklist, deleteBlacklist };
