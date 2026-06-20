const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../lib/db');

const MAX_POINTS = 1000;
const MAX_REASON_LENGTH = 300;
const EMBED_COLOR = '#3c2fed';
const SUCCESS_COLOR = '#2ecc71';
const WARNING_COLOR = '#ff9900';
const ERROR_COLOR = '#ff0000';
const POINTS_MANAGER_ROLE_IDS = parseRoleIds(process.env.POINTS_MANAGER_ROLE_IDS || process.env.POINTS_ROLE_IDS);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('points')
        .setDescription('Manage and view user points')
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View your points or another user points')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to view')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add points to a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to add points to')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Amount of points to add')
                        .setMinValue(1)
                        .setMaxValue(MAX_POINTS)
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for the points change')
                        .setMaxLength(MAX_REASON_LENGTH)
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove points from a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to remove points from')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Amount of points to remove')
                        .setMinValue(1)
                        .setMaxValue(MAX_POINTS)
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for the points change')
                        .setMaxLength(MAX_REASON_LENGTH)
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('set')
                .setDescription('Set a user points total')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to set points for')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('New point total')
                        .setMinValue(0)
                        .setMaxValue(MAX_POINTS)
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for the points change')
                        .setMaxLength(MAX_REASON_LENGTH)
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('reset')
                .setDescription('Reset a user points to 0')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to reset')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for the reset')
                        .setMaxLength(MAX_REASON_LENGTH)
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('leaderboard')
                .setDescription('Show the server points leaderboard')
        ),

    async execute(interaction, client) {
        if (!interaction.guildId) {
            return interaction.reply({
                embeds: [errorEmbed('Server Only', 'Points can only be used inside a server.')],
                flags: 64
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (!['view', 'leaderboard', 'add', 'remove', 'set', 'reset'].includes(subcommand)) {
            return interaction.reply({ content: 'Unknown points subcommand.', flags: 64 });
        }

        if (!['view', 'leaderboard'].includes(subcommand)) {
            if (!canManagePoints(interaction)) {
                return interaction.reply({
                    embeds: [errorEmbed('No Permission', 'You need an allowed points role to change points.')],
                    flags: 64
                });
            }

            const targetUser = interaction.options.getUser('user');
            if (!targetUser || targetUser.bot) {
                return interaction.reply({
                    embeds: [errorEmbed('Invalid User', 'Points can only be changed for normal users.')],
                    flags: 64
                });
            }
        }

        await interaction.deferReply();
        await ensurePointsTables();

        if (subcommand === 'view') return viewPoints(interaction, client);
        if (subcommand === 'leaderboard') return showLeaderboard(interaction, client);

        if (subcommand === 'add') return changePoints(interaction, client, 'add');
        if (subcommand === 'remove') return changePoints(interaction, client, 'remove');
        if (subcommand === 'set') return changePoints(interaction, client, 'set');
        if (subcommand === 'reset') return changePoints(interaction, client, 'reset');
    },
};

async function ensurePointsTables() {
    await db.run(`CREATE TABLE IF NOT EXISTS user_points (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        points INTEGER NOT NULL DEFAULT 0,
        updated_at BIGINT,
        updated_by TEXT,
        PRIMARY KEY (guild_id, user_id)
    )`);

    await db.run(`CREATE TABLE IF NOT EXISTS point_logs (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        delta INTEGER NOT NULL,
        old_points INTEGER NOT NULL,
        new_points INTEGER NOT NULL,
        reason TEXT,
        changed_by TEXT NOT NULL,
        created_at BIGINT NOT NULL
    )`);
}

function canManagePoints(interaction) {
    if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
    return POINTS_MANAGER_ROLE_IDS.some(roleId => interaction.member?.roles?.cache?.has(roleId));
}

function parseRoleIds(value) {
    if (!value) return [];
    return value
        .split(',')
        .map(roleId => roleId.trim().replace(/^<@&|>$/g, ''))
        .filter(Boolean);
}

async function viewPoints(interaction, client) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const total = await getPoints(interaction.guildId, targetUser.id);

    const embed = new EmbedBuilder()
        .setTitle('Points')
        .setColor(EMBED_COLOR)
        .setAuthor(getBotAuthor(client))
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
            { name: '', value: `${targetUser.tag}\n<@${targetUser.id}>`, inline: true },
            { name: 'Points', value: `${total}`, inline: true }
        )
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}

async function showLeaderboard(interaction, client) {
    const rows = await db.all(
        'SELECT user_id, points FROM user_points WHERE guild_id = ? ORDER BY points DESC LIMIT ?',
        [interaction.guildId, 10]
    );

    const description = rows.length
        ? rows.map((row, index) => `**${index + 1}.** <@${row.user_id}> - **${row.points}** points`).join('\n')
        : 'No points have been added yet.';

    const embed = new EmbedBuilder()
        .setTitle('Points Leaderboard')
        .setDescription(description)
        .setColor(EMBED_COLOR)
        .setAuthor(getBotAuthor(client))
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}

async function changePoints(interaction, client, mode) {
    const targetUser = interaction.options.getUser('user');
    const amount = mode === 'reset' ? 0 : interaction.options.getInteger('amount');
    const reason = cleanReason(interaction.options.getString('reason'));

    if (!targetUser || targetUser.bot) {
        return interaction.editReply({
            embeds: [errorEmbed('Invalid User', 'Points can only be changed for normal users.')]
        });
    }

    const oldPoints = await getPoints(interaction.guildId, targetUser.id);
    const newPoints = calculateNewPoints(oldPoints, amount, mode);
    const delta = newPoints - oldPoints;
    const now = Date.now();

    await setPoints(interaction.guildId, targetUser.id, newPoints, interaction.user.id, now);
    await logPointsChange({
        guildId: interaction.guildId,
        userId: targetUser.id,
        delta,
        oldPoints,
        newPoints,
        reason,
        changedBy: interaction.user.id,
        createdAt: now
    });

    const dmSent = await sendPointsDm({
        user: targetUser,
        oldPoints,
        newPoints,
        delta,
        reason,
        client
    });

    const embed = new EmbedBuilder()
        .setTitle('Points Updated')
        .setColor(delta >= 0 ? SUCCESS_COLOR : WARNING_COLOR)
        .setAuthor(getBotAuthor(client))
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
            { name: 'User', value: `${targetUser.tag}\n<@${targetUser.id}>`, inline: true },
            { name: 'Change', value: formatDelta(delta), inline: true },
            { name: 'New Total', value: `${newPoints}`, inline: true },
            { name: 'Reason', value: reason, inline: false },
            { name: 'DM Sent', value: dmSent ? 'Yes' : 'No, user DMs may be closed.', inline: false }
        )
        .setFooter({ text: `Changed by ${interaction.user.tag}` })
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}

function calculateNewPoints(oldPoints, amount, mode) {
    if (mode === 'add') return clampPoints(oldPoints + amount);
    if (mode === 'remove') return clampPoints(oldPoints - amount);
    if (mode === 'set') return clampPoints(amount);
    if (mode === 'reset') return 0;
    return oldPoints;
}

function clampPoints(points) {
    return Math.min(Math.max(points, 0), MAX_POINTS);
}

function cleanReason(reason) {
    const cleaned = reason?.trim();
    return cleaned || 'No reason provided.';
}

function formatDelta(delta) {
    if (delta > 0) return `+${delta}`;
    return `${delta}`;
}

async function getPoints(guildId, userId) {
    const row = await db.get('SELECT points FROM user_points WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
    return row?.points || 0;
}

async function setPoints(guildId, userId, points, updatedBy, updatedAt) {
    await db.run(
        `INSERT INTO user_points (guild_id, user_id, points, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (guild_id, user_id) DO UPDATE SET
            points = ?,
            updated_at = ?,
            updated_by = ?`,
        [guildId, userId, points, updatedAt, updatedBy, points, updatedAt, updatedBy]
    );
}

async function logPointsChange({ guildId, userId, delta, oldPoints, newPoints, reason, changedBy, createdAt }) {
    await db.run(
        `INSERT INTO point_logs (guild_id, user_id, delta, old_points, new_points, reason, changed_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [guildId, userId, delta, oldPoints, newPoints, reason, changedBy, createdAt]
    );
}

async function sendPointsDm({ user, oldPoints, newPoints, delta, reason, client }) {
    const embed = new EmbedBuilder()
        .setTitle('Point Balance Changed')
        .setColor(delta >= 0 ? SUCCESS_COLOR : WARNING_COLOR)
        .setAuthor(getBotAuthor(client))
        .addFields(
            
            { name: 'Change', value: formatDelta(delta), inline: true },
            { name: 'Old Total', value: `${oldPoints}`, inline: true },
            { name: 'New Total', value: `${newPoints}`, inline: true },
            { name: 'Reason', value: reason, inline: false },
            
        )
        .setTimestamp();

    try {
        await user.send({ embeds: [embed] });
        return true;
    } catch (err) {
        console.error(`Failed to DM points update to ${user.tag}:`, err.message);
        return false;
    }
}

function getBotAuthor(client) {
    return {
        name: client?.user?.username || 'Points System',
        iconURL: client?.user?.displayAvatarURL()
    };
}

function errorEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(ERROR_COLOR)
        .setTimestamp();
}
