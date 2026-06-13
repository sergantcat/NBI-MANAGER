const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reportboterror')
        .setDescription('Report a bug or issue with the bot')
        .addStringOption(option =>
            option
                .setName('issue')
                .setDescription('Describe the bug or issue you found')
                .setRequired(true)
        ),

    async execute(interaction) {
        const issueText = interaction.options.getString('issue');
        const reportId = `ERR-${Date.now().toString(36).toUpperCase()}`;
        const ownerId = process.env.REPORT_USER_ID || process.env.OWNER_ID;
        const reportChannelId = process.env.REPORT_CHANNEL_ID;

        const reportEmbed = new EmbedBuilder()
            .setTitle('New Error Report')
            .setColor('#ff9900')
            .addFields(
                { name: 'Reporter', value: `${interaction.user.tag} (${interaction.user.id})` },
                { name: 'Issue', value: issueText },
                { name: 'Report ID', value: reportId }
            )
            .setTimestamp();

        let notified = false;

        if (ownerId) {
            try {
                const owner = await interaction.client.users.fetch(ownerId);
                await owner.send({ embeds: [reportEmbed] });
                notified = true;
            } catch (error) {
                console.error('Error sending report DM to owner:', error);
            }
        }

        if (!notified && reportChannelId) {
            try {
                const channel = await interaction.client.channels.fetch(reportChannelId);
                if (channel && channel.isTextBased()) {
                    await channel.send({ embeds: [reportEmbed] });
                    notified = true;
                }
            } catch (error) {
                console.error('Error sending report to fallback channel:', error);
            }
        }

        const responseEmbed = new EmbedBuilder()
            .setTitle('Report Submitted')
            .setColor('#00b7ff')
            .setDescription('Your issue has been sent to the developer.')
            .addFields(
                { name: 'Issue', value: issueText },
                { name: 'Report ID', value: reportId },
                { name: 'Status', value: notified ? 'Owner notified' : 'Notification failed - contact me directly' }
            );

        await interaction.reply({ embeds: [responseEmbed], ephemeral: true });
    },
};

