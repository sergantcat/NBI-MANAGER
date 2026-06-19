const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const db = require('../lib/db');

const NBI_RAID_ROLE_ID = '1511689349899485224';
const NDRIDD_RAID_ROLE_ID = '1466769214512693402';
const NBI_RAID_PING = `<@&${NBI_RAID_ROLE_ID}>`;
const NDRIDD_RAID_PING = `<@&${NDRIDD_RAID_ROLE_ID}>`;
const RAID_HOST_ROLE_IDS = parseRoleIds(process.env.RAID_HOST_ROLE_IDS || process.env.RAID_HOSTING_ROLE_IDS);
const REACTION_EMOJI = process.env.REACTION_EMOJI || '✅';

function normalizeChannelId(channelId) {
    if (typeof channelId !== 'string' || !channelId.trim()) return null;
    return channelId.trim().replace(/^['"]+|['"]+$/g, '');
}

function getConfiguredChannelIds() {
    return {
        nbi: normalizeChannelId(process.env.NBI_RAID_CHANNEL_ID),
        ndridd: normalizeChannelId(process.env.NDRIDD_SECURITY_CHANNEL_ID)
    };
}

function parseRoleIds(value) {
    if (!value) return [];
    return value
        .split(',')
        .map(roleId => roleId.trim().replace(/^<@&|>$/g, ''))
        .filter(Boolean);
}

function canRunRaidCommand(interaction) {
    return RAID_HOST_ROLE_IDS.some(roleId => interaction.member?.roles?.cache?.has(roleId));
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

function describeChannel(channel) {
    const guildName = channel.guild?.name || channel.guildId || 'unknown guild';
    return `#${channel.name || channel.id} (${channel.id}) in ${guildName}`;
}

function missingSendPermissions(channel, client) {
    const permissions = channel.permissionsFor(client.user);
    if (!permissions) return ['ViewChannel', 'SendMessages'];

    return [
        [PermissionFlagsBits.ViewChannel, 'ViewChannel'],
        [PermissionFlagsBits.SendMessages, 'SendMessages'],
        [PermissionFlagsBits.EmbedLinks, 'EmbedLinks'],
        [PermissionFlagsBits.AddReactions, 'AddReactions']
    ]
        .filter(([permission]) => !permissions.has(permission))
        .map(([, name]) => name);
}

async function validateRaidChannel(client, label, channelId) {
    if (!channelId) {
        return { error: `${label} channel ID is missing in .env.` };
    }

    const channel = await resolveChannel(client, channelId);
    if (!channel) {
        return { error: `${label} channel ${channelId} could not be fetched. Make sure the bot is in that server and can view the channel.` };
    }

    if (!channel.isTextBased()) {
        return { error: `${label} channel ${describeChannel(channel)} is not a text channel.` };
    }

    const missingPermissions = missingSendPermissions(channel, client);
    if (missingPermissions.length > 0) {
        return {
            error: `${label} channel ${describeChannel(channel)} is missing bot permissions: ${missingPermissions.join(', ')}.`
        };
    }

    return { channel };
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
                .addStringOption(option =>
                    option.setName('server_info')
                        .setDescription('Server link or text with join information')
                        .setMaxLength(1024)
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
        if (!interaction.guildId) {
            return interaction.reply({ content: 'Raid commands can only be used inside a server.', flags: MessageFlags.Ephemeral });
        }

        if (!canRunRaidCommand(interaction)) {
            return interaction.reply({ content: 'You need an allowed raid hosting role to use raid commands.', flags: MessageFlags.Ephemeral });
        }

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
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (!process.env.DATABASE_URL) {
            return interaction.editReply({ content: 'This command requires an external Postgres database. Set DATABASE_URL in your .env and restart the bot.' });
        }

        const tsString = interaction.options.getString('timestamp');
        const scheduledAt = parseInt(tsString, 10);
        if (Number.isNaN(scheduledAt) || scheduledAt < 0) {
            return interaction.editReply({ content: 'Invalid unix timestamp provided.' });
        }

        const raidId = generateRaidId();
        const configuredChannels = getConfiguredChannelIds();
        if (configuredChannels.nbi && configuredChannels.nbi === configuredChannels.ndridd) {
            return interaction.editReply({ content: 'Raid channel configuration problem:\n- NBI_RAID_CHANNEL_ID and NDRIDD_SECURITY_CHANNEL_ID must be different channels.' });
        }

        const nbiTarget = await validateRaidChannel(client, 'NBI', configuredChannels.nbi);
        const ndriddTarget = await validateRaidChannel(client, 'NDRIDD', configuredChannels.ndridd);
        const channelErrors = [nbiTarget.error, ndriddTarget.error].filter(Boolean);

        if (channelErrors.length > 0) {
            return interaction.editReply({
                content: `Raid channel configuration problem:\n${channelErrors.map(error => `- ${error}`).join('\n')}`
            });
        }

        const nbiChannel = nbiTarget.channel;
        const ndriddChannel = ndriddTarget.channel;

        const nbiEmbed = new EmbedBuilder()
            .setColor('#ff2600')
            .setTitle('NBI Raid Has Been Scheduled')
            .setAuthor({
    name: client.user.username,
    iconURL: client.user.displayAvatarURL()
})
            .setDescription(`Raid ID: ${raidId}
                

                \n'Raid Host': <@${interaction.user.id}>
                

                \n'Raid Time': <t:${scheduledAt}:F> (<t:${scheduledAt}:R>)

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
                { name: '', value: 'NBI Reactions ✅: 0', inline: false },

                { name: '', value: 'NDRIDD Reactions ✅: 0', inline: false },

                
            )
            .setTimestamp();

        const ndriddEmbed = new EmbedBuilder()
            .setColor('#0400ff')
            .setTitle('NBI Invasion Has Been Scheduled')
            .setAuthor({
    name: client.user.username,
    iconURL: client.user.displayAvatarURL()
})
            .setDescription(`Invasion ID: ${raidId}
                
                \n'Invasion Host': <@${interaction.user.id}>

                \nInvasion Time: <t:${scheduledAt}:F> (<t:${scheduledAt}:R>)

                React with ✅ If you want to Participate in it,
                also please make sure you have enough time to participate in it.

            All attending Security Personal Please get ready to Defend the Facility
            
            # Tips
            * Try to doge the bullets
            * Camp the door in Missle silo
            * Work as a Team Teamwork = win 
            * And listen to The Team Lead`)
            .addFields(
                { name: '', value: 'NDRIDD Reactions ✅: 0', inline: false },
                
                { name: '', value: 'NBI Reactions ✅: 0', inline: false },
                
                
            )
            .setTimestamp();

        let nbiMessage;
        let ndriddMessage;
        try {
            nbiMessage = await nbiChannel.send({
                content: NBI_RAID_PING,
                embeds: [nbiEmbed],
                allowedMentions: { roles: [NBI_RAID_ROLE_ID] }
            });
            ndriddMessage = await ndriddChannel.send({
                content: NDRIDD_RAID_PING,
                embeds: [ndriddEmbed],
                allowedMentions: { roles: [NDRIDD_RAID_ROLE_ID] }
            });
        } catch (err) {
            return interaction.editReply({ content: `Failed to send raid embeds: ${err.message}` });
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

        return interaction.editReply({
            content: `Raid scheduled with ID: ${raidId}.\nNBI: ${describeChannel(nbiChannel)}\nNDRIDD: ${describeChannel(ndriddChannel)}`
        });
    } catch (err) {
        console.error('scheduleRaid failed:', err);
        const response = { content: 'Raid scheduling failed. Please check the bot logs.' };
        if (interaction.deferred || interaction.replied) return interaction.editReply(response).catch(() => {});
        return interaction.reply({ ...response, flags: MessageFlags.Ephemeral }).catch(() => {});
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
    const serverInfo = newStatus === 'started' ? interaction.options.getString('server_info') : null;
    const raid = await dbGet('SELECT * FROM raids WHERE raid_id = ?', [raidId]);
    if (!raid) {
        return interaction.reply({ content: `Raid ID ${raidId} not found.`, flags: MessageFlags.Ephemeral });
    }

    try {
        await dbQuery('UPDATE raids SET status = ? WHERE raid_id = ?', [newStatus, raidId]);
    } catch (err) {
        console.error('DB update status error', err);
        return interaction.reply({ content: 'Failed to update raid status.', flags: MessageFlags.Ephemeral });
    }

    const statusLabel = newStatus === 'started' ? 'Raid Started' : newStatus === 'cancelled' ? 'Raid Cancelled' : 'Raid Concluded';
    const serverInfoLine = serverInfo ? `
    
    \nServer Information: ${serverInfo}` : '';

    const statusEmbed = new EmbedBuilder()
        .setColor('#00ff37')
        .setTitle(statusLabel)
        .setDescription(`Raid ID: ${raidId}

            \nScheduled for <t:${raid.scheduled_at}:F> (<t:${raid.scheduled_at}:R>)

            \nStatus: ${newStatus}${serverInfoLine}`)
        .addFields(
            { name: 'Embed ID', value: raidId, inline: false }
        )
        .setTimestamp();

    if (reason) {
        statusEmbed.addFields({ name: 'Reason', value: reason, inline: false });
    }

    try {
        await sendRaidEmbedToChannels(client, statusEmbed);
    } catch (err) {
        console.error('Failed to send raid status embed', err);
    }

    return interaction.reply({ content: `Raid ${raidId} status updated to ${newStatus}.`, flags: MessageFlags.Ephemeral });
}

async function changeRaidTime(interaction, client) {
    const raidId = interaction.options.getString('raid_id');
    const tsString = interaction.options.getString('timestamp');
    const scheduledAt = parseInt(tsString, 10);
    if (Number.isNaN(scheduledAt) || scheduledAt < 0) {
        return interaction.reply({ content: 'Invalid unix timestamp provided.', flags: MessageFlags.Ephemeral });
    }

    const raid = await dbGet('SELECT * FROM raids WHERE raid_id = ?', [raidId]);
    if (!raid) {
        return interaction.reply({ content: `Raid ID ${raidId} not found.`, flags: MessageFlags.Ephemeral });
    }

    try {
        await dbQuery('UPDATE raids SET scheduled_at = ? WHERE raid_id = ?', [scheduledAt, raidId]);
    } catch (err) {
        console.error('DB update time error', err);
        return interaction.reply({ content: 'Failed to update raid time.', flags: MessageFlags.Ephemeral });
    }

    const timeChangeEmbed = new EmbedBuilder()
        .setColor('#F1C40F')
        .setTitle('Raid Time Changed')
        .setDescription(`Raid Time changed
            Raid ID: ${raidId}\nNew time: <t:${scheduledAt}:F> (<t:${scheduledAt}:R>)`)
        .setTimestamp();

    try {
        await sendRaidEmbedToChannels(client, timeChangeEmbed);
    } catch (err) {
        console.error('Failed to send raid time change embeds', err);
    }

    return interaction.reply({ content: `Raid ${raidId} time updated to <t:${scheduledAt}:F>.`, flags: MessageFlags.Ephemeral });
}

async function sendRaidEmbedToChannels(client, embed) {
    const configuredChannels = getConfiguredChannelIds();
    if (configuredChannels.nbi && configuredChannels.nbi === configuredChannels.ndridd) {
        throw new Error('NBI and NDRIDD raid channels are configured with the same ID.');
    }

    const targets = [
        { label: 'NBI', channelId: configuredChannels.nbi, content: NBI_RAID_PING, roleId: NBI_RAID_ROLE_ID },
        { label: 'NDRIDD', channelId: configuredChannels.ndridd, content: NDRIDD_RAID_PING, roleId: NDRIDD_RAID_ROLE_ID }
    ];

    for (const target of targets) {
        const result = await validateRaidChannel(client, target.label, target.channelId);
        if (result.error) throw new Error(result.error);
        await result.channel.send({
            content: target.content,
            embeds: [embed],
            allowedMentions: { roles: [target.roleId] }
        });
    }
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
