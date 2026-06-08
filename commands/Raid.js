const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('raid')
		.setDescription('Placeholder: start a raid'),
	async execute(interaction) {
		await interaction.reply({ content: 'This command is not yet implemented.', ephemeral: true });
	},
};

