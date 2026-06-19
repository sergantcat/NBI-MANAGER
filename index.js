require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Partials, REST, Routes } = require('discord.js');
const { setupGlobalErrorReporting } = require('./lib/errorReporter');

const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildIds = (process.env.GUILD_IDS || process.env.GUILD_ID || process.env.TEST_GUILD_ID || '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);

if (!token) {
  console.error('Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

if (!clientId) {
  console.error('Missing CLIENT_ID in .env');
  process.exit(1);
}

// Create a client with intents and partials needed for message & reaction handling
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.Channel]
});
client.commands = new Collection();
const errorReporter = setupGlobalErrorReporting(client);

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
const commands = [];

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  let command;

  try {
    command = require(filePath);
  } catch (error) {
    console.error(`Failed to load command file ${file}:`, error);
    continue;
  }

  if (!command || !command.data || !command.execute) {
    console.warn(`Skipping command file ${file}: missing data or execute`);
    continue;
  }

  
  client.commands.set(command.data.name ?? command.data.name?.toString(), command);
  try { commands.push(command.data.toJSON()); } catch (e) { console.warn('Failed to serialize command data for', file, e); }
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log(`Registering ${commands.length} commands...`);
    if (guildIds.length > 0) {
      for (const id of guildIds) {
        await rest.put(Routes.applicationGuildCommands(clientId, id), { body: commands });
        console.log(`Registered slash commands to guild ${id}`);
      }
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log('Registered slash commands globally');
    }
  } catch (error) {
    console.error('Failed to register commands:', error);
  }

  client.once('clientReady', () => {
    console.log(`Logged in successfully as ${client.user.tag}`);
  });

  client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand && !interaction.isChatInputCommand) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      // pass client as second argument to command.execute for commands that need it
      await command.execute(interaction, client);
    } catch (error) {
      errorReporter.originalConsoleError(`Error executing ${interaction.commandName}:`, error);
      errorReporter.report(`command:${interaction.commandName}`, error, {
        commandName: interaction.commandName,
        user: `${interaction.user.tag} (${interaction.user.id})`,
        guild: interaction.guild ? `${interaction.guild.name} (${interaction.guildId})` : interaction.guildId,
        channel: interaction.channelId
      });
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: 'There was an error while executing this command.', flags: 64 }).catch(err => console.error('FollowUp failed:', err));
        } else {
          await interaction.reply({ content: 'There was an error while executing this command.', flags: 64 }).catch(err => console.error('Reply failed:', err));
        }
      } catch (notifyErr) {
        errorReporter.originalConsoleError('Failed to send error response to interaction:', notifyErr);
        errorReporter.report('interactionErrorResponse', notifyErr, {
          commandName: interaction.commandName,
          user: `${interaction.user.tag} (${interaction.user.id})`,
          guild: interaction.guild ? `${interaction.guild.name} (${interaction.guildId})` : interaction.guildId,
          channel: interaction.channelId
        });
      }
    }
  });

  client.on('messageReactionAdd', async (reaction, user) => {
    try {
      const command = client.commands.get('raid');
      if (command && typeof command.handleReaction === 'function') {
        await command.handleReaction(reaction, user, client);
      }
    } catch (err) {
      errorReporter.originalConsoleError('Error handling reaction add:', err);
      errorReporter.report('messageReactionAdd', err, {
        user: `${user.tag} (${user.id})`,
        guild: reaction.message?.guild ? `${reaction.message.guild.name} (${reaction.message.guildId})` : reaction.message?.guildId,
        channel: reaction.message?.channelId
      });
    }
  });

  client.on('messageReactionRemove', async (reaction, user) => {
    try {
      const command = client.commands.get('raid');
      if (command && typeof command.handleReaction === 'function') {
        await command.handleReaction(reaction, user, client);
      }
    } catch (err) {
      errorReporter.originalConsoleError('Error handling reaction remove:', err);
      errorReporter.report('messageReactionRemove', err, {
        user: `${user.tag} (${user.id})`,
        guild: reaction.message?.guild ? `${reaction.message.guild.name} (${reaction.message.guildId})` : reaction.message?.guildId,
        channel: reaction.message?.channelId
      });
    }
  });

  try {
    await client.login(token);
  } catch (error) {
    console.error('Login failed:', error);
  }
})();
