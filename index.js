const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, REST, Routes } = require('discord.js');
require('dotenv').config();

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token) {
  console.error('Missing TOKEN in .env');
  process.exit(1);
}

if (!clientId) {
  console.error('Missing CLIENT_ID in .env');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
const commands = [];

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  if (!command.data || !command.execute) {
    console.warn(`Skipping command file ${file}: missing data or execute`);
    continue;
  }

  client.commands.set(command.data.name, command);
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log(`Registering ${commands.length} commands...`);
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log(`Registered slash commands to guild ${guildId}`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log('Registered slash commands globally');
    }
  } catch (error) {
    console.error('Failed to register commands:', error);
  }

  client.once('ready', () => {
    console.log(`Logged in successfully as ${client.user.tag}`);
  });

  client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error executing ${interaction.commandName}:`, error);
      // Try to notify the user, but don't let API errors crash the bot.
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: 'There was an error while executing this command.', ephemeral: true }).catch(err => console.error('FollowUp failed:', err));
        } else {
          await interaction.reply({ content: 'There was an error while executing this command.', ephemeral: true }).catch(err => console.error('Reply failed:', err));
        }
      } catch (notifyErr) {
        console.error('Failed to send error response to interaction:', notifyErr);
      }
    }
  });

  try {
    await client.login(token);
  } catch (error) {
    console.error('Login failed:', error);
  }
})();
