const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { parseRoleIds, hasAnyRole } = require('../lib/rolePermissions');
const { deleteBlacklist } = require('../lib/moderationDb');

const dbPath = path.join(__dirname, '..', 'blacklist.json');
const BLACKLIST_COMMAND_ROLE_IDS = parseRoleIds(process.env.BLACKLIST_COMMAND_ROLE_IDS || process.env.MODERATION_COMMAND_ROLE_IDS);
const BLACKLIST_ROLE_ID = parseRoleIds(process.env.BLACKLIST_ROLE_ID || process.env.BLACKLIST_ROLE_IDS)[0] || null;

function loadDatabase() {
  if (!fs.existsSync(dbPath)) {
    return { blacklistedUsers: [] };
  }
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function saveDatabase(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unblacklist')
    .setDescription('Remove a user from the blacklist and notify them')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user to remove from blacklist')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for removing from blacklist')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'This command can only be used inside a server.', flags: 64 });
    }

    if (!hasAnyRole(interaction, BLACKLIST_COMMAND_ROLE_IDS)) {
      return interaction.reply({ content: 'You need an allowed blacklist role to use this command.', flags: 64 });
    }

    if (!BLACKLIST_ROLE_ID) {
      return interaction.reply({ content: 'Set BLACKLIST_ROLE_ID in .env before using this command.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    try {
      // Load database
      const db = loadDatabase();
      const existingIndex = db.blacklistedUsers.findIndex(u =>
        u.userId === targetUser.id && (!u.guildId || u.guildId === interaction.guildId)
      );

      let targetMember = interaction.options.getMember('user');
      if (!targetMember) {
        targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      }

      let roleRemoved = false;
      if (targetMember?.roles.cache.has(BLACKLIST_ROLE_ID)) {
        await targetMember.roles.remove(
          BLACKLIST_ROLE_ID,
          `Unblacklisted by ${interaction.user.tag}: ${reason}`
        );
        roleRemoved = true;
      }

      const removed = existingIndex >= 0 ? db.blacklistedUsers[existingIndex] : null;
      if (existingIndex >= 0) {
        db.blacklistedUsers.splice(existingIndex, 1);
        saveDatabase(db);
      }
      await deleteBlacklist(interaction.guildId, targetUser.id);

      if (!removed && !roleRemoved) {
        return interaction.editReply({ content: `${targetUser.tag} is not on this server's blacklist.`, flags: 64 });
      }

      // Create embed for DM
      const dmEmbed = new EmbedBuilder()
        .setTitle('✓ You Have Been Removed From The Blacklist')
        .setColor('#00ff00')
        .addFields(
          { name: 'Reason', value: reason, inline: false },
          { name: 'Guild', value: interaction.guild.name, inline: true },
          { name: 'Removed By', value: interaction.user.tag, inline: true },
          { name: 'Date', value: new Date().toLocaleString(), inline: true }
        )
        .setThumbnail(interaction.guild.iconURL())
        .setFooter({ text: 'You are now able to use this server again. Welcome back!' });

      // Send DM to user
      try {
        await targetUser.send({ embeds: [dmEmbed] });
      } catch (dmError) {
        console.warn(`Failed to send unblacklist DM to ${targetUser.tag}:`, dmError.message);
      }

      // Reply to interaction
      const replyEmbed = new EmbedBuilder()
        .setTitle('✓ User Removed From Blacklist')
        .setColor('#00ff00')
        .addFields(
          { name: 'User', value: `${targetUser.tag} (${targetUser.id})`, inline: false },
          { name: 'Previous Reason', value: removed?.reason || 'No stored reason', inline: false },
          { name: 'Role Removed', value: roleRemoved ? 'Yes' : 'Role was not present', inline: false },
          { name: 'Removal Reason', value: reason, inline: false }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [replyEmbed], flags: 64 });
    } catch (error) {
      console.error('Unblacklist command error:', error);
      await interaction.editReply({ content: `Error: ${error.message}`, flags: 64 }).catch(() => {});
    }
  },
};

