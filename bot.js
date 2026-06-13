// roblox-tracker-bot.js
// A Discord bot that tracks RobloxLx client versions, announces updates,
// and provides a download button linking to rdd.weao.gg

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// -------------------- CONFIGURATION --------------------
const TOKEN = process.env.DISCORD_BOT_TOKEN;  // Set your bot token in environment variables
const CHANNEL_ID = 'YOUR_CHANNEL_ID_HERE';    // Channel where updates will be posted
const VERSION_STORE_FILE = path.join(__dirname, 'last_version.json');
const ROBLOX_VERSION_API = 'https://clientsettingscdn.roblox.com/v2/client-version/RobloxApp';
const DOWNLOAD_URL = 'https://rdd.weao.gg';   // Link for the download button

// -------------------- HELPER FUNCTIONS --------------------
// Fetch current Roblox client version from official API
async function fetchRobloxVersion() {
    try {
        const response = await axios.get(ROBLOX_VERSION_API);
        const data = response.data;
        return {
            version: data.version,                  // e.g., "0.725.0.7251138"
            clientUpload: data.clientVersionUpload, // e.g., "version-76173e47a79145c7"
            bootstrap: generateBootstrap(data.version) // derived bootstrap info
        };
    } catch (error) {
        console.error('Failed to fetch Roblox version:', error.message);
        return null;
    }
}

// Generate a Bootstrap string similar to the one shown in the image
// Example: "1, 6, 0, 7251138" based on the version number
function generateBootstrap(version) {
    const parts = version.split('.');
    if (parts.length >= 4) {
        const major = parts[0];
        const minor = parts[1];
        const patch = parts[2];
        const build = parts[3];
        return `${major}, ${minor}, ${patch}, ${build}`;
    }
    return "1, 6, 0, 7251138"; // fallback
}

// Load previously stored version data
function loadStoredVersion() {
    if (fs.existsSync(VERSION_STORE_FILE)) {
        const data = fs.readFileSync(VERSION_STORE_FILE, 'utf-8');
        return JSON.parse(data);
    }
    return { version: null, lastUpdateTimestamp: null, updateCount: 0 };
}

// Save current version and metadata
function saveVersionData(version, updateCount, lastUpdateTimestamp) {
    const data = { version, updateCount, lastUpdateTimestamp };
    fs.writeFileSync(VERSION_STORE_FILE, JSON.stringify(data, null, 2));
}

// Create an embed message for the current version, with an optional custom message
function createVersionEmbed(versionData, updateMessage = null, isInitial = false) {
    const now = new Date();
    const formattedDate = `${now.getMonth()+1}/${now.getDate()}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')} ${now.getHours() >= 12 ? 'pm' : 'am'}`;

    const embed = new EmbedBuilder()
        .setTitle('🚀 RobloxLx Tracker')
        .setColor(0x00AE86)
        .addFields(
            { name: 'Version', value: versionData.version, inline: true },
            { name: 'Client Upload', value: versionData.clientUpload, inline: true },
            { name: 'Bootstrap', value: versionData.bootstrap, inline: true }
        )
        .setFooter({ text: `EΦAPM • ${formattedDate}` })
        .setTimestamp();

    // Add update announcement message if provided
    if (updateMessage) {
        embed.setDescription(updateMessage);
    } else if (isInitial) {
        embed.setDescription('✅ **RobloxLx tracker is online!** Current version shown below.');
    }

    return embed;
}

// Create a button row with a download link
function createDownloadButton() {
    const button = new ButtonBuilder()
        .setLabel('📥 Download Here')
        .setStyle(ButtonStyle.Link)
        .setURL(DOWNLOAD_URL);
    return new ActionRowBuilder().addComponents(button);
}

// Main update logic: check for new version and post to Discord if changed
async function checkForUpdates(client) {
    const currentVersionData = await fetchRobloxVersion();
    if (!currentVersionData) return;

    const stored = loadStoredVersion();
    const oldVersion = stored.version;

    // If version has changed (or first run)
    if (currentVersionData.version !== oldVersion) {
        let updateMessage = '';
        let isUpdate = false;
        let newUpdateCount = stored.updateCount;
        const nowTimestamp = Date.now();

        if (oldVersion === null) {
            // First run – just post current info without "update" message
            const embed = createVersionEmbed(currentVersionData, null, true);
            const buttonRow = createDownloadButton();
            await client.channels.cache.get(CHANNEL_ID).send({ embeds: [embed], components: [buttonRow] });
            saveVersionData(currentVersionData.version, 0, nowTimestamp);
            console.log(`Initial post: version ${currentVersionData.version}`);
            return;
        }

        // It's an actual update
        isUpdate = true;
        newUpdateCount++;
        const daysSinceLastUpdate = stored.lastUpdateTimestamp ? (nowTimestamp - stored.lastUpdateTimestamp) / (1000 * 3600 * 24) : 0;

        // Custom update message based on time elapsed (for "after months" requirement)
        if (daysSinceLastUpdate > 60) {
            updateMessage = `🔄 **Major update after several months!**\nRobloxLx has been updated from **${oldVersion}** → **${currentVersionData.version}**.\nGet the latest client now.`;
        } else if (daysSinceLastUpdate > 30) {
            updateMessage = `📢 **Update after over a month!**\nVersion changed from ${oldVersion} to ${currentVersionData.version}.`;
        } else {
            updateMessage = `✨ **New RobloxLx update available!**\nPrevious: ${oldVersion} → Current: ${currentVersionData.version}.`;
        }

        const embed = createVersionEmbed(currentVersionData, updateMessage, false);
        const buttonRow = createDownloadButton();
        await client.channels.cache.get(CHANNEL_ID).send({ embeds: [embed], components: [buttonRow] });
        saveVersionData(currentVersionData.version, newUpdateCount, nowTimestamp);
        console.log(`Update posted: ${oldVersion} -> ${currentVersionData.version}`);
    } else {
        console.log(`No update. Current version: ${currentVersionData.version}`);
    }
}

// -------------------- DISCORD BOT INITIALIZATION --------------------
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Bot will post RobloxLx version updates to channel ID: ${1515087460147794051}`);

    // First check immediately
    await checkForUpdates(client);

    // Then check every 6 hours (adjust as needed)
    setInterval(async () => {
        await checkForUpdates(client);
    }, 6 * 60 * 60 * 1000);
});

client.login(process.env.DISCORD_BOT_TOKEN);
