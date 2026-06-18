const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { parseRoleIds, hasAnyRole } = require('../lib/rolePermissions');
const { insertWarn } = require('../lib/moderationDb');

const WARN_COMMAND_ROLE_IDS = parseRoleIds(process.env.WARN_COMMAND_ROLE_IDS || process.env.MODERATION_COMMAND_ROLE_IDS);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a server member')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user to warn')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for the warning')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ embeds: [errorEmbed('Server Only', 'This command can only be used inside a server.')], ephemeral: true });
    }

    if (!hasAnyRole(interaction, WARN_COMMAND_ROLE_IDS)) {
      return interaction.reply({ embeds: [errorEmbed('No Permission', 'You need an allowed warn role to use this command.')], ephemeral: true });
    }

    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!targetUser || targetUser.bot) {
      return interaction.reply({ embeds: [errorEmbed('Invalid User', 'You can only warn normal users.')], ephemeral: true });
    }

    await insertWarn({
      guildId: interaction.guildId,
      userId: targetUser.id,
      userTag: targetUser.tag,
      reason,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      createdAt: Date.now()
    });

    const embed = new EmbedBuilder()
      .setTitle('User Warned')
      .setDescription(`${targetUser.tag} has been warned.`)
      .addFields(
        { name: 'User', value: `${targetUser.tag} (${targetUser.id})` },
        { name: 'Reason', value: reason }
      )
      .setColor('#ff9900')
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

function errorEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor('#ff0000')
    .setTimestamp();
}
