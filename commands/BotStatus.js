const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('botstatus')
    .setDescription('Displays the current status of the bot'),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const botStatusEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Bot Status')
      .setDescription('Here is the current status of the bot:')
      .addFields(
        { name: 'Uptime', value: `${Math.floor(interaction.client.uptime / 1000)} seconds`, inline: true },
        { name: 'Ping', value: `${Math.round(interaction.client.ws.ping)} ms`, inline: true },
        { name: 'Status', value: interaction.client.presence?.status || 'Unknown', inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [botStatusEmbed], flags: 64 });
  },
};