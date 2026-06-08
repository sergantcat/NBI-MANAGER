const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bans a user from the server')
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('The reason for banning the user')
        .setRequired(true)
    )
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user to ban')
        .setRequired(true)
    ),
};
module.exports.execute = async (interaction) => {    const user = interaction.options.getUser('user');
    if (!interaction.member.permissions.has('BAN_MEMBERS')) {
        const embed = new EmbedBuilder()
            .setTitle('Error')
            .setDescription('You do not have permission to ban users.')
            .setColor('#ff0000');
        await interaction.reply({ embeds: [embed] });
        return;
    }
    const member = interaction.guild.members.cache.get(user.id);
    if (!member) {
        const embed = new EmbedBuilder()
            .setTitle('Error')        .setDescription('User not found in the server.')         .setColor('#ff0000');    await interaction.reply({ embeds: [embed] });   
        return;
    }
    try {        await member.ban({ reason: `Banned by ${interaction.user.tag}` });
        const embed = new EmbedBuilder()
            .setTitle('User Banned')        .setDescription(`${user.tag} has been banned from the server.`)        .setColor('#00ff00');
        await interaction.reply({ embeds: [embed] });
    }
    catch (error) {        const embed = new EmbedBuilder()
            .setTitle('Error')
            .setDescription('An error occurred while trying to ban the user.')          .setColor('#ff0000');     await interaction.reply({ embeds: [embed] });  }
}           
