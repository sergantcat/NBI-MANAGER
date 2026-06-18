require('dotenv').config();
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../lib/db');

const NBI_CHANNEL_ID = normalizeChannelId(process.env.NBI_RAID_CHANNEL_ID);
const NDRIDD_CHANNEL_ID = normalizeChannelId(process.env.NDRIDD_SECURITY_CHANNEL_ID);
const REACTION_EMOJI = process.env.REACTION_EMOJI || '✅';

function normalizeChannelId(channelId) {
    if (typeof channelId !== 'string' || !channelId.trim()) return null;
    return channelId.trim().replace(/^['"]+|['"]+$/g, '');
}

function generateRaidId() {
    return `raid-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffff).toString(16)}`;
}

async function resolveChannel(client, channelId) {
    if (!channelId) return null;
    try {
        return await client.channels.fetch(channelId);
    } catch {
        return null;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('raid')
        .setDescription('[RHP] Raid management commands')
        .addSubcommand(sub =>
            sub.setName('schedule')
                .setDescription('Schedule a new raid')
                .addStringOption(option =>
                    option.setName('timestamp')
                        .setDescription('Unix timestamp (seconds) for the raid start')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('start')
                .setDescription('Mark a scheduled raid as started')
                .addStringOption(option =>
                    option.setName('raid_id')
                        .setDescription('Raid ID to start')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('timechange')
                .setDescription('Change the scheduled time for a raid')
                .addStringOption(option =>
                    option.setName('raid_id')
                        .setDescription('Raid ID to change')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('timestamp')
                        .setDescription('New unix timestamp (seconds)')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('cancel')
                .setDescription('Cancel a scheduled raid')
                .addStringOption(option =>
                    option.setName('raid_id')
                        .setDescription('Raid ID to cancel')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for cancelling the raid')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('conclude')
                .setDescription('Conclude a raid')
                .addStringOption(option =>
                    option.setName('raid_id')
                        .setDescription('Raid ID to conclude')
                        .setRequired(true)
                )
        ),

    async execute(interaction, client) {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'schedule') return scheduleRaid(interaction, client);
        if (subcommand === 'start') return updateRaidStatus(interaction, 'started', client);
        if (subcommand === 'timechange') return changeRaidTime(interaction, client);
        if (subcommand === 'cancel') return updateRaidStatus(interaction, 'cancelled', client);
        if (subcommand === 'conclude') return updateRaidStatus(interaction, 'concluded', client);
    },

    async handleReaction(reaction, user, client) {
        return handleRaidReaction(reaction, user, client);
    }
};

async function scheduleRaid(interaction, client) {
    try {
        if (!process.env.DATABASE_URL) {
            return interaction.reply({ content: 'This command requires an external Postgres database. Set DATABASE_URL in your .env and restart the bot.', ephemeral: true });
        }

        const tsString = interaction.options.getString('timestamp');
        const scheduledAt = parseInt(tsString, 10);
        if (Number.isNaN(scheduledAt) || scheduledAt < 0) {
            return interaction.reply({ content: 'Invalid unix timestamp provided.', ephemeral: true });
        }

        const raidId = generateRaidId();
        const host = interaction.user.tag;

        const nbiChannel = await resolveChannel(client, NBI_CHANNEL_ID);
        const ndriddChannel = await resolveChannel(client, NDRIDD_CHANNEL_ID);

        if (!nbiChannel || !ndriddChannel) {
            return interaction.reply({ content: 'Missing configured raid channel IDs in .env or channels are unavailable.', ephemeral: true });
        }

        const nbiEmbed = new EmbedBuilder()
        
            .setTitle('# NBI Raid Has been Sheduled')
            .setDescription(`Raid ID: ${raidId}
                -# <@&1511689349899485224>

                \nHost: <@${interaction.user.id}>

                \nRaid Time: <t:${scheduledAt}:F> (<t:${scheduledAt}:R>)
                React with ✅ If you want to Participate in it,
                also please make sure you have enough time to participate in it.
                
 # Raid Rules
 >>> all Raider and NBI rules apply
* Do not sabotage other people
* Work as a team.
* Listen to the Raid Host
* Note: try to doge the bullets
* and use your tactical and all other skills to win`)

                
            .addFields(
                { name: 'Raiders', value: 'NBI Reactions ✅: 0', inline: false },

                { name: 'Security Tracker', value: 'NDRIDD Reactions ✅: 0', inline: false },

                
            )
            .setTimestamp();

        const ndriddEmbed = new EmbedBuilder()
            .setTitle(' # NBI Raid Sheduled')
            
            .setDescription(`Raid ID: ${raidId}
                -# <@&1466769214512693402>
                \nHost: <@${interaction.user.id}>

                \nRaid Time: <t:${scheduledAt}:F> (<t:${scheduledAt}:R>)

                 React with ✅ If you want to Participate in it,
                also please make sure you have enough time to participate in it.

            All attending Security Personal Please get ready to Defend the Facility
            
            # Tips
            * Try to doge the bullets
            * Camp the door in Missle silo
            * Work as a Team Teamwork = win 
            * And listen to The Team Lead`)
            .addFields(
                { name: 'Security', value: 'NDRIDD Reactions ✅: 0', inline: false },

                { name: 'Raiders Tracker', value: 'NBI Reactions ✅: 0', inline: false },
                
                
            )
            .setTimestamp();

        let nbiMessage;
        let ndriddMessage;
        try {
            nbiMessage = await nbiChannel.send({ embeds: [nbiEmbed] });
            ndriddMessage = await ndriddChannel.send({ embeds: [ndriddEmbed] });
        } catch (err) {
            return interaction.reply({ content: `Failed to send raid embeds: ${err.message}`, ephemeral: true });
        }

        try { await nbiMessage.react(REACTION_EMOJI); } catch (e) {}
        try { await ndriddMessage.react(REACTION_EMOJI); } catch (e) {}

        try {
            await db.insertRaid({
                raid_id: raidId,
                guild_id: interaction.guildId || null,
                channel_id: nbiChannel.id,
                message_id: nbiMessage.id,
                other_guild_id: ndriddChannel.guildId,
                other_channel_id: ndriddChannel.id,
                other_message_id: ndriddMessage.id,
                scheduled_at: scheduledAt,
                created_at: Date.now()
            });
        } catch (err) {
            console.error('DB insert raid error', err);
        }

        return interaction.reply({ content: `Raid scheduled with ID: ${raidId}. NBI channel: <#${nbiChannel.id}>, NDRIDD channel: <#${ndriddChannel.id}>`, ephemeral: true });
    } catch (err) {
        console.error('scheduleRaid failed:', err);
        if (!interaction.replied && !interaction.deferred) {
            return interaction.reply({ content: 'Raid embed sent but scheduling failed. Please check logs.', ephemeral: true });
        }
    }
}

function dbQuery(sql, params = []) {
    return db.run(sql, params);
}

function dbGet(sql, params = []) {
    return db.get(sql, params);
}

async function updateRaidStatus(interaction, newStatus, client) {
    const raidId = interaction.options.getString('raid_id');
    const reason = newStatus === 'cancelled' ? interaction.options.getString('reason') || 'No reason provided.' : null;
    const raid = await dbGet('SELECT * FROM raids WHERE raid_id = ?', [raidId]);
    if (!raid) {
        return interaction.reply({ content: `Raid ID ${raidId} not found.`, ephemeral: true });
    }

    try {
        await dbQuery('UPDATE raids SET status = ? WHERE raid_id = ?', [newStatus, raidId]);
    } catch (err) {
        console.error('DB update status error', err);
        return interaction.reply({ content: 'Failed to update raid status.', ephemeral: true });
    }

    const statusLabel = newStatus === 'started' ? 'Raid Started' : newStatus === 'cancelled' ? 'Raid Cancelled' : 'Raid Concluded';
    const statusEmbed = new EmbedBuilder()
        .setTitle(statusLabel)
        .setDescription(`Raid ID: ${raidId}\nScheduled for <t:${raid.scheduled_at}:F> (<t:${raid.scheduled_at}:R>)\nStatus: ${newStatus}`)
        .addFields(
            { name: 'Embed ID', value: raidId, inline: false }
        )
        .setTimestamp();

    if (reason) {
        statusEmbed.addFields({ name: 'Reason', value: reason, inline: false });
    }

    try {
        await sendRaidEmbedToChannels(raid, client, statusEmbed);
    } catch (err) {
        console.error('Failed to send raid status embed', err);
    }

    return interaction.reply({ content: `Raid ${raidId} status updated to ${newStatus}.`, ephemeral: true });
}

async function changeRaidTime(interaction, client) {
    const raidId = interaction.options.getString('raid_id');
    const tsString = interaction.options.getString('timestamp');
    const scheduledAt = parseInt(tsString, 10);
    if (Number.isNaN(scheduledAt) || scheduledAt < 0) {
        return interaction.reply({ content: 'Invalid unix timestamp provided.', ephemeral: true });
    }

    const raid = await dbGet('SELECT * FROM raids WHERE raid_id = ?', [raidId]);
    if (!raid) {
        return interaction.reply({ content: `Raid ID ${raidId} not found.`, ephemeral: true });
    }

    try {
        await dbQuery('UPDATE raids SET scheduled_at = ? WHERE raid_id = ?', [scheduledAt, raidId]);
    } catch (err) {
        console.error('DB update time error', err);
        return interaction.reply({ content: 'Failed to update raid time.', ephemeral: true });
    }

    const timeChangeEmbed = new EmbedBuilder()
        .setTitle('Raid Time Changed')
        .setDescription(`Raid ID: ${raidId}\nNew time: <t:${scheduledAt}:F> (<t:${scheduledAt}:R>)`)
        .setTimestamp();

    try {
        await sendRaidEmbedToChannels(raid, client, timeChangeEmbed);
    } catch (err) {
        console.error('Failed to send raid time change embeds', err);
    }

    return interaction.reply({ content: `Raid ${raidId} time updated to <t:${scheduledAt}:F>.`, ephemeral: true });
}

async function sendRaidEmbedToChannels(raid, client, embed) {
    const sendMessage = async channelId => {
        if (!channelId) return null;
        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel || !channel.isTextBased()) return null;
            return await channel.send({ embeds: [embed] });
        } catch (err) {
            console.error('Failed to send raid command embed to channel', err);
            return null;
        }
    };

    await sendMessage(raid.channel_id);
    await sendMessage(raid.other_channel_id);
}

async function handleRaidReaction(reaction, user, client) {
    if (user.bot) return;

    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (err) {
            console.error('Failed to fetch partial reaction', err);
            return;
        }
    }

    if (reaction.emoji.name !== REACTION_EMOJI) return;
    const message = reaction.message;

    if (message.partial) {
        try {
            await message.fetch();
        } catch (err) {
            console.error('Failed to fetch partial message', err);
            return;
        }
    }

    let raid;
    try {
        raid = await dbGet('SELECT * FROM raids WHERE message_id = ? OR other_message_id = ?', [message.id, message.id]);
    } catch (err) {
        console.error('Failed to query raid for reaction', err);
        return;
    }
    if (!raid) return;

    const fetchRaidMessage = async (channelId, messageId) => {
        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel || !channel.isTextBased()) return null;
            return await channel.messages.fetch(messageId);
        } catch (err) {
            console.error('Failed to fetch raid message for tracking', err);
            return null;
        }
    };

    const primaryMessage = message.id === raid.message_id ? message : await fetchRaidMessage(raid.channel_id, raid.message_id);
    const secondaryMessage = message.id === raid.other_message_id ? message : await fetchRaidMessage(raid.other_channel_id, raid.other_message_id);
    if (!primaryMessage || !secondaryMessage) return;

    const getCount = msg => Math.max((msg.reactions.cache.get(REACTION_EMOJI)?.count || 0) - 1, 0);
    const primaryCount = getCount(primaryMessage);
    const secondaryCount = getCount(secondaryMessage);

    const updateEmbed = async (targetMessage, firstField, secondField, firstCount, secondCount) => {
        try {
            const embed = EmbedBuilder.from(targetMessage.embeds[0]);
            const fields = embed.data.fields || [];
            if (fields.length >= 2) {
                fields[0].value = `${firstField}: ${firstCount}`;
                fields[1].value = `${secondField}: ${secondCount}`;
            }
            embed.setFields(fields);
            await targetMessage.edit({ embeds: [embed] });
        } catch (err) {
            console.error('Failed to update raid embed', err);
        }
    };

    const updatedFields = {
        primary: message.id === raid.message_id ? 'NBI Reactions✅' : 'NDRIDD Reactions✅',
        secondary: message.id === raid.message_id ? 'NDRIDD Reactions✅' : 'NBI Reactions✅'
    };

    await updateEmbed(primaryMessage, updatedFields.primary, updatedFields.secondary, primaryCount, secondaryCount);
    await updateEmbed(secondaryMessage, updatedFields.secondary, updatedFields.primary, secondaryCount, primaryCount);
}
