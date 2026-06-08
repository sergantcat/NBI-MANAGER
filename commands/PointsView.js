const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('pointsview')
		.setDescription('Placeholder: view points'),
	async execute(interaction) {
		await interaction.reply({ content: 'This command is not yet implemented.', ephemeral: true });
	},
};

