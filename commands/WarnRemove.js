const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn-remove')
    .setDescription('Remove a warning from a server member')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user whose warning should be removed')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for removing the warning')
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const embed = new EmbedBuilder()
      .setTitle('Warning Removed')
      .setDescription(`${targetUser.tag}'s warning has been removed.`)
      .addFields(
        { name: 'User', value: `${targetUser.tag} (${targetUser.id})` },
        { name: 'Reason', value: reason }
      )
      .setColor('#00ff00')
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
