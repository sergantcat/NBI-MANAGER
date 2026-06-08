const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'blacklist.json');

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
    await interaction.deferReply({ flags: 64 });

    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    try {
      // Load database
      const db = loadDatabase();
      const existingIndex = db.blacklistedUsers.findIndex(u => u.userId === targetUser.id);

      if (existingIndex === -1) {
        await interaction.editReply({ content: `${targetUser.tag} is not on the blacklist.`, flags: 64 });
        return;
      }

      // Remove from blacklist
      const removed = db.blacklistedUsers[existingIndex];
      db.blacklistedUsers.splice(existingIndex, 1);
      saveDatabase(db);

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
        console.error(`Failed to send DM to ${targetUser.tag}:`, dmError.message);
      }

      // Reply to interaction
      const replyEmbed = new EmbedBuilder()
        .setTitle('✓ User Removed From Blacklist')
        .setColor('#00ff00')
        .addFields(
          { name: 'User', value: `${targetUser.tag} (${targetUser.id})`, inline: false },
          { name: 'Previous Reason', value: removed.reason, inline: false },
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

