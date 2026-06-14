// WARNING REBOOT COMMAND WILL BE REVAMPED 
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reboot')
        .setDescription('Reboots the bot (Dev only)'),

    async execute(interaction) {
        let ownersRaw = process.env.OWNER_IDS || process.env.OWNER_ID || '';
        let ownerIds = ownersRaw.split(',').map(s => s.trim()).filter(Boolean);

        if (ownerIds.length === 0) {
            const application = interaction.client.application ? await interaction.client.application.fetch() : null;
            if (application?.owner) {
                if (application.owner.members && typeof application.owner.members.map === 'function') {
                    ownerIds = application.owner.members.map(member => member.user.id);
                } else if (application.owner.id) {
                    ownerIds = [application.owner.id];
                }
            }
        }

        if (ownerIds.length === 0) {
            await interaction.reply({ content: 'Reboot is restricted. Set OWNER_IDS or OWNER_ID in .env to your Discord ID.', flags: 64 });
            return;
        }

        if (!ownerIds.includes(interaction.user.id)) {
            await interaction.reply({ content: 'You do not have permission to use this command.', flags: 64 });
            return;
        }

        await interaction.reply({ content: 'Rebooting...', flags: 64 });

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

