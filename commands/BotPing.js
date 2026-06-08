const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('botping')
        .setDescription('Replies with bot latency and API latency'),

    async execute(interaction) {
        const apiLatency = Math.round(interaction.client.ws.ping);
        const botLatency = Math.round(Date.now() - interaction.createdTimestamp);

        const embed = new EmbedBuilder()
            .setTitle('Bot Ping')
            .setDescription(`Bot Latency: ${botLatency}ms\nAPI Latency: ${apiLatency}ms`)
            .setColor('#00b7ff');

        await interaction.reply({ embeds: [embed] });
    },
};
