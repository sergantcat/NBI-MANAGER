const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reboot')
        .setDescription('Reboots the bot (Dev only)'),

    async execute(interaction) {
        const ownersRaw = process.env.OWNER_IDS || process.env.OWNER_ID || '';
        const ownerIds = ownersRaw.split(',').map(s => s.trim()).filter(Boolean);

        if (ownerIds.length === 0) {
            await interaction.reply({ content: 'Reboot is restricted. Set OWNER_IDS in .env to your Discord ID.', flags: 64 });
            return;
        }

        if (!ownerIds.includes(interaction.user.id)) {
            await interaction.reply({ content: 'You do not have permission to use this command.', flags: 64 });
            return;
        }

        await interaction.reply({ content: 'Rebooting...', flags: 64 });

        // give Discord time to receive the response, then destroy client and exit
        setTimeout(async () => {
            try {
                await interaction.client.destroy();
            } catch (e) {
                // ignore
            }
            process.exit(0);
        }, 1000);
    },
};

