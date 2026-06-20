const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('botping')
        .setDescription('Replies with bot latency and API latency'),

    async execute(interaction) {
        const apiLatency = Math.round(interaction.client.ws.ping);
        const botLatency = Math.round(Date.now() - interaction.createdTimestamp);
        const serverLocation = interaction.guild?.preferredLocale ?? 'Unknown';

        const embed = new EmbedBuilder()
            .setTitle('Pong - here is some data')
            .setColor('#010608')
            .setAuthor({
                name: interaction.client.user.username,
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setDescription('Here you can see the bot\'s ping and server location')
            .addFields(
                { name: 'Bot Latency', value: `'${botLatency}ms'`, inline: true },
                { name: 'API Latency', value: `'${apiLatency}ms'`, inline: true },
                { name: 'Server Location', value: serverLocation, inline: true },
            );

        await interaction.reply({ embeds: [embed] });
    },
};
