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
    await interaction.deferReply({ flags: 64 });

    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const details = interaction.options.getString('details') || 'No additional details';

    try {
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
        timestamp: new Date().toISOString(),
      };

      if (existingIndex >= 0) {
        db.blacklistedUsers[existingIndex] = entry;
      } else {
        db.blacklistedUsers.push(entry);
      }
      saveDatabase(db);

      // Reply to interaction
      const replyEmbed = new EmbedBuilder()
        .setTitle('✓ User Blacklisted')
        .setColor('#00ff00')
        .addFields(
          { name: 'User', value: `${targetUser.tag} (${targetUser.id})`, inline: false },
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
    