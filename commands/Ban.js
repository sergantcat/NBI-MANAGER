const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { parseRoleIds, hasAnyRole } = require('../lib/rolePermissions');
const { insertBan } = require('../lib/moderationDb');

const BAN_COMMAND_ROLE_IDS = parseRoleIds(process.env.BAN_COMMAND_ROLE_IDS || process.env.MODERATION_COMMAND_ROLE_IDS);

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

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ embeds: [errorEmbed('Server Only', 'This command can only be used inside a server.')], ephemeral: true });
    }

    if (!hasAnyRole(interaction, BAN_COMMAND_ROLE_IDS)) {
      return interaction.reply({ embeds: [errorEmbed('No Permission', 'You need an allowed ban role to use this command.')], ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!user || user.id === interaction.user.id) {
      return interaction.reply({ embeds: [errorEmbed('Invalid User', 'You cannot ban that user.')], ephemeral: true });
    }

    let member = interaction.options.getMember('user');
    try {
      if (!member) member = await interaction.guild.members.fetch(user.id);
    } catch {
      member = null;
    }

    if (member && !member.bannable) {
      return interaction.reply({ embeds: [errorEmbed('Cannot Ban', 'I cannot ban this user. Check my role position and permissions.')], ephemeral: true });
    }

    try {
      await interaction.guild.members.ban(user.id, { reason: `${reason} | Banned by ${interaction.user.tag}` });
      await insertBan({
        guildId: interaction.guildId,
        userId: user.id,
        userTag: user.tag,
        reason,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        createdAt: Date.now()
      });

      const embed = new EmbedBuilder()
        .setTitle('User Banned')
        .setDescription(`${user.tag} has been banned from the server.`)
        .setColor('#00ff00')
        .addFields(
          { name: 'User', value: `${user.tag} (${user.id})`, inline: false },
          { name: 'Reason', value: reason, inline: false }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Ban command error:', error);
      return interaction.reply({ embeds: [errorEmbed('Error', 'An error occurred while trying to ban the user.')], ephemeral: true });
    }
  },
};

function errorEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor('#ff0000')
    .setTimestamp();
}
