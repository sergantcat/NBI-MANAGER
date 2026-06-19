# NBI Manager

NBI Manager is a Discord bot for coordinating raids and handling common server-management tasks. It includes cross-server raid announcements, reaction tracking, moderation tools, a points system, blacklist management, and automatic error reporting.

## Features

- Schedule, start, reschedule, cancel, and conclude raids
- Send separate NBI and NDRIDD security announcements
- Track participation through Discord reactions
- Include server links or join instructions when a raid starts
- Manage bans, warnings, and blacklisted members
- Award, remove, reset, and view points
- Report runtime and command errors to an owner or reporting channel
- Restrict sensitive commands using configurable Discord roles

## Requirements

- [Node.js](https://nodejs.org/) 18 or newer
- A Discord application and bot token
- A PostgreSQL database for raid management
- A Discord server where you can install the bot

## Installation

1. Clone the repository and enter its directory:

   ```bash
   git clone YOUR_REPOSITORY_URL
   cd "NBI MANAGER"
   ```

2. Install the dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the project root and configure the bot.

4. Start the bot:

   ```bash
   npm start
   ```

## Configuration

Use this as a starting point for your `.env` file:

```env
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_application_id
GUILD_ID=your_development_server_id

DATABASE_URL=your_postgresql_connection_url
DB_PATH=raids.db

OWNER_ID=your_discord_user_id
REPORT_USER_ID=your_discord_user_id
REPORT_CHANNEL_ID=your_error_report_channel_id

NBI_RAID_CHANNEL_ID=your_nbi_raid_channel_id
NDRIDD_SECURITY_CHANNEL_ID=your_ndridd_security_channel_id
RAID_HOST_ROLE_IDS=role_id_1,role_id_2

POINTS_MANAGER_ROLE_IDS=role_id_1,role_id_2
MODERATION_COMMAND_ROLE_IDS=role_id_1,role_id_2
BAN_COMMAND_ROLE_IDS=role_id_1,role_id_2
WARN_COMMAND_ROLE_IDS=role_id_1,role_id_2
BLACKLIST_COMMAND_ROLE_IDS=role_id_1,role_id_2
BLACKLIST_ROLE_ID=your_blacklist_role_id

REACTION_EMOJI=✅
```

Separate multiple IDs with commas and do not include spaces unless desired.

> [!CAUTION]
> Never commit your real `.env`, Discord token, or database credentials. The included `.gitignore` prevents `.env` and log files from being tracked.

## Commands

### Raid management

- `/raid schedule` — Schedule a raid using a Unix timestamp.
- `/raid start` — Start a raid and include server information.
- `/raid timechange` — Change a scheduled raid time.
- `/raid cancel` — Cancel a raid with an optional reason.
- `/raid conclude` — Mark a raid as concluded.

### Moderation and utilities

- `/ban` — Ban a member and record the action.
- `/warn` — Warn a member.
- `/warn-remove` — Remove a warning.
- `/blacklist` — Blacklist a member and apply the configured role.
- `/unblacklist` — Remove a member from the blacklist.
- `/points` — Manage member points.
- `/botinfo`, `/botping`, and `/botstatus` — View bot information and health.
- `/reportboterror` — Submit an error report.
- `/reboot` — Restart the bot on supported hosting platforms.

## Discord Timestamps

Raid commands accept Unix timestamps in seconds. Discord displays timestamps in each viewer's local timezone. A timestamp can be created with tools such as [Hammertime](https://hammertime.cyou/).

## Project Structure

```text
commands/   Slash commands and raid reaction handling
lib/        Database, permissions, and error-reporting helpers
index.js    Bot startup, command registration, and event listeners
```

## License

This project is licensed under the terms in [LICENSE](LICENSE).
