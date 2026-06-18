const util = require('util');
const { EmbedBuilder } = require('discord.js');

const MAX_FIELD_LENGTH = 1000;
const MAX_QUEUE_SIZE = 25;
const DUPLICATE_WINDOW_MS = 10000;

function truncate(value, maxLength = MAX_FIELD_LENGTH) {
  const text = String(value ?? 'No details provided.');
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function redactSecrets(text) {
  let output = String(text ?? '');
  const secretKeys = ['DISCORD_TOKEN', 'TOKEN', 'DATABASE_URL'];

  for (const key of secretKeys) {
    const value = process.env[key];
    if (value && value.length > 5) {
      output = output.split(value).join(`[redacted ${key}]`);
    }
  }

  output = output.replace(/postgresql:\/\/[^@\s]+@/gi, 'postgresql://[redacted]@');
  output = output.replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}/g, '[redacted discord token]');
  return output;
}

function formatError(error) {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || 'No message',
      stack: error.stack || error.message || String(error)
    };
  }

  return {
    name: typeof error,
    message: typeof error === 'string' ? error : util.inspect(error, { depth: 4 }),
    stack: util.inspect(error, { depth: 4 })
  };
}

function formatConsoleArgs(args) {
  return args.map(arg => {
    if (arg instanceof Error) return arg.stack || arg.message;
    if (typeof arg === 'string') return arg;
    return util.inspect(arg, { depth: 4 });
  }).join(' ');
}

function createErrorReporter(client, options = {}) {
  const ownerId = options.ownerId || process.env.REPORT_USER_ID || process.env.OWNER_ID;
  const reportChannelId = options.reportChannelId || process.env.REPORT_CHANNEL_ID;
  const originalConsoleError = options.originalConsoleError || console.error.bind(console);
  const queue = [];
  const recent = new Map();
  let sending = false;

  async function sendReport(report) {
    if (!ownerId && !reportChannelId) return;

    const error = formatError(report.error || report.details || 'Unknown error');
    const context = report.context || {};
    const signature = `${report.source}:${error.name}:${error.message}`;
    const now = Date.now();

    if (recent.get(signature) && now - recent.get(signature) < DUPLICATE_WINDOW_MS) return;
    recent.set(signature, now);

    const embed = new EmbedBuilder()
      .setTitle('Bot Error Report')
      .setColor('#ff3333')
      .addFields(
        { name: 'Source', value: truncate(report.source || 'Unknown'), inline: true },
        { name: 'Error', value: truncate(`${error.name}: ${error.message}`), inline: false },
        { name: 'Details', value: truncate(redactSecrets(error.stack)), inline: false }
      )
      .setTimestamp();

    if (context.commandName) embed.addFields({ name: 'Command', value: truncate(context.commandName), inline: true });
    if (context.user) embed.addFields({ name: 'User', value: truncate(context.user), inline: true });
    if (context.guild) embed.addFields({ name: 'Guild', value: truncate(context.guild), inline: true });
    if (context.channel) embed.addFields({ name: 'Channel', value: truncate(context.channel), inline: true });

    let sent = false;

    if (ownerId) {
      try {
        const owner = await client.users.fetch(ownerId);
        await owner.send({ embeds: [embed] });
        sent = true;
      } catch (error) {
        originalConsoleError('Failed to DM bot error report to owner:', error);
      }
    }

    if (!sent && reportChannelId) {
      const channel = await client.channels.fetch(reportChannelId);
      if (channel && channel.isTextBased()) {
        await channel.send({ embeds: [embed] });
      }
    }
  }

  async function flushQueue() {
    if (sending || !client.isReady()) return;
    sending = true;

    try {
      while (queue.length > 0) {
        const report = queue.shift();
        try {
          await sendReport(report);
        } catch (error) {
          originalConsoleError('Failed to send bot error report:', error);
        }
      }
    } finally {
      sending = false;
    }
  }

  function report(source, error, context = {}) {
    const reportEntry = { source, error, context };

    if (!client.isReady()) {
      if (queue.length >= MAX_QUEUE_SIZE) queue.shift();
      queue.push(reportEntry);
      return;
    }

    queue.push(reportEntry);
    void flushQueue();
  }

  client.once('ready', () => {
    void flushQueue();
  });

  return {
    report,
    originalConsoleError,
    formatConsoleArgs
  };
}

function setupGlobalErrorReporting(client) {
  const reporter = createErrorReporter(client);
  const originalConsoleError = reporter.originalConsoleError;

  process.on('unhandledRejection', reason => {
    originalConsoleError('Unhandled promise rejection:', reason);
    reporter.report('unhandledRejection', reason);
  });

  process.on('uncaughtException', error => {
    originalConsoleError('Uncaught exception:', error);
    reporter.report('uncaughtException', error);
  });

  process.on('warning', warning => {
    reporter.report('process.warning', warning);
  });

  client.on('error', error => {
    reporter.report('client.error', error);
  });

  client.on('shardError', error => {
    reporter.report('client.shardError', error);
  });

  return reporter;
}

module.exports = {
  setupGlobalErrorReporting
};
