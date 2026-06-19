const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('botinfo')
        .setDescription('Displays information about the bot.'),

    execute: async (interaction) => {
        const commandsCount = interaction.client.commands ? interaction.client.commands.size : 0;
        const usersCount = interaction.client.users?.cache?.size ?? 0;

        const embed = new EmbedBuilder()
            .setTitle('NBI Manager Information')
            .setDescription('Here is some information about the bot:')
            .addFields(
                { name: 'Name', value: interaction.client.user.username, inline: true },
                { name: 'ID', value: interaction.client.user.id, inline: true },
                { name: 'Created At', value: interaction.client.user.createdAt.toDateString(), inline: true },
                { name: 'Commands', value: `${commandsCount}`, inline: true },
            
                { name: 'Creator', value: '@sergantcat(erycd14)', inline: true },
                { name: 'Source Code', value: 'https://github.com/sergantcat/NBI-Manager', inline: true }
            )
            .setThumbnail(interaction.client.user.displayAvatarURL())
            .setColor('#ff6600');

        await interaction.reply({ embeds: [embed] });
    },
};