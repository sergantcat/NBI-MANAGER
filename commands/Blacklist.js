const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { parseRoleIds, hasAnyRole } = require('../lib/rolePermissions');
const { upsertBlacklist } = require('../lib/moderationDb');

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
    .setName('blacklist')
    .setDescription('Blacklist a user and send them a notice')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user to blacklist')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('The reason for blacklisting the user')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('details')
        .setDescription('Additional details about the blacklist')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ embeds: [errorEmbed('Server Only', 'This command can only be used inside a server.')], flags: 64 });
    }

    if (!hasAnyRole(interaction, BLACKLIST_COMMAND_ROLE_IDS)) {
      return interaction.reply({ embeds: [errorEmbed('No Permission', 'You need an allowed blacklist role to use this command.')], flags: 64 });
    }

    if (!BLACKLIST_ROLE_ID) {
      return interaction.reply({ embeds: [errorEmbed('Missing Config', 'Set BLACKLIST_ROLE_ID in .env before using this command.')], flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const details = interaction.options.getString('details') || 'No additional details';

    try {
      let targetMember = interaction.options.getMember('user');
      try {
        if (!targetMember) targetMember = await interaction.guild.members.fetch(targetUser.id);
      } catch {
        targetMember = null;
      }

      if (!targetMember) {
        return interaction.editReply({ embeds: [errorEmbed('User Not Found', 'That user is not in this server.')], flags: 64 });
      }

      try {
        await targetMember.roles.add(BLACKLIST_ROLE_ID, `Blacklisted by ${interaction.user.tag}: ${reason}`);
      } catch (roleError) {
        console.error(`Failed to add blacklist role to ${targetUser.tag}:`, roleError.message);
        return interaction.editReply({
          embeds: [errorEmbed('Role Failed', 'I could not add the blacklist role. Check my role position and permissions.')],
          flags: 64
        });
      }

      // Create embed for DM
      const dmEmbed = new EmbedBuilder()
        .setTitle('⚠️ You Have Been Blacklisted')
        .setColor('#ff0000')
        .addFields(
          { name: 'Reason', value: reason, inline: false },
          { name: 'Details', value: details, inline: false },
          { name: 'Guild', value: interaction.guild.name, inline: true },
          { name: 'Blacklisted By', value: interaction.user.tag, inline: true },
          { name: 'Date', value: new Date().toLocaleString(), inline: true }
        )
        .setThumbnail(interaction.guild.iconURL())
        .setFooter({ text: 'This is a blacklist notice, Please Contact The NBI Command if you belive that this is a misstake or open an appeal.' });

      // Send DM to user
      try {
        await targetUser.send({ embeds: [dmEmbed] });
      } catch (dmError) {
        console.error(`Failed to send DM to ${targetUser.tag}:`, dmError.message);
        // Continue anyway, still log the blacklist
      }

      // Load and update database
      const db = loadDatabase();
      const existingIndex = db.blacklistedUsers.findIndex(u => u.userId === targetUser.id);
      const entry = {
        userId: targetUser.id,
        userTag: targetUser.tag,
        reason,
        details,
        guild: interaction.guild.name,
        guildId: interaction.guild.id,
        blacklistedBy: interaction.user.tag,
        blacklistedById: interaction.user.id,
        blacklistRoleId: BLACKLIST_ROLE_ID,
        timestamp: new Date().toISOString(),
      };

      if (existingIndex >= 0) {
        db.blacklistedUsers[existingIndex] = entry;
      } else {
        db.blacklistedUsers.push(entry);
      }
      saveDatabase(db);

      await upsertBlacklist({
        guildId: interaction.guildId,
        userId: targetUser.id,
        userTag: targetUser.tag,
        reason,
        details,
        roleId: BLACKLIST_ROLE_ID,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        createdAt: Date.now()
      });

      // Reply to interaction
      const replyEmbed = new EmbedBuilder()
        .setTitle('✓ User Blacklisted')
        .setColor('#00ff00')
        .addFields(
          { name: 'User', value: `${targetUser.tag} (${targetUser.id})`, inline: false },
          { name: 'Role Added', value: `<@&${BLACKLIST_ROLE_ID}>`, inline: false },
          { name: 'Reason', value: reason, inline: false },
          { name: 'Details', value: details, inline: false }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [replyEmbed], flags: 64 });
    } catch (error) {
      console.error('Blacklist command error:', error);
      await interaction.editReply({ content: `Error: ${error.message}`, flags: 64 }).catch(() => {});
    }
  },
};

function errorEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor('#ff0000')
    .setTimestamp();
}
    
