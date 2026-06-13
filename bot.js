const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const express = require('express');

// -------------------- WEB SERVER (για Render) --------------------
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('RobloxLx Tracker Bot is running!');
});

app.listen(PORT, () => {
    console.log(`Web server is running on port ${PORT}`);
});

// -------------------- CONFIGURATION --------------------
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = '151588746147794286';
const PING_ID = '1515081507918581942';
const VERSION_STORE_FILE = path.join(__dirname, 'last_version.json');

// -------------------- HELPER FUNCTIONS --------------------
async function fetchRobloxVersion() {
    try {
        const response = await axios.get('https://clientsettingscdn.roblox.com/v1/client-version', {
            params: {
                binaryType: 'Windows',
                channel: 'LIVE'
            },
            timeout: 10000
        });
        
        const data = response.data;
        return {
            version: data.clientVersionUpload || data.version || 'Unknown',
            clientUpload: data.clientVersionUpload || 'Unknown',
            bootstrap: generateBootstrap(data.version || data.clientVersionUpload)
        };
    } catch (error) {
        console.error('Failed to fetch Roblox version:', error.message);
        try {
            const response2 = await axios.get('https://setup.rbxcdn.com/version', { timeout: 10000 });
            const versionFromCDN = response2.data.trim();
            return {
                version: versionFromCDN,
                clientUpload: `version-${versionFromCDN}`,
                bootstrap: generateBootstrap(versionFromCDN)
            };
        } catch (error2) {
            console.error('Alternative endpoint also failed:', error2.message);
            return null;
        }
    }
}

function generateBootstrap(version) {
    if (!version) return "1, 6, 0, 7251138";
    const parts = version.toString().split('.');
    if (parts.length >= 4) {
        return `${parts[0]}, ${parts[1]}, ${parts[2]}, ${parts[3]}`;
    }
    return "1, 6, 0, 7251138";
}

function loadStoredVersion() {
    if (fs.existsSync(VERSION_STORE_FILE)) {
        const data = fs.readFileSync(VERSION_STORE_FILE, 'utf-8');
        return JSON.parse(data);
    }
    return { version: null, lastUpdateTimestamp: null, updateCount: 0 };
}

function saveVersionData(version, updateCount, lastUpdateTimestamp) {
    const data = { version, updateCount, lastUpdateTimestamp };
    fs.writeFileSync(VERSION_STORE_FILE, JSON.stringify(data, null, 2));
}

function createVersionEmbed(versionData, updateMessage = null, isInitial = false) {
    const now = new Date();
    const formattedDate = `${now.getMonth()+1}/${now.getDate()}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2,'0')} ${now.getHours() >= 12 ? 'pm' : 'am'}`;

    const embed = new EmbedBuilder()
        .setTitle('🚀 RobloxLx Tracker')
        .setColor(0x00AE86)
        .addFields(
            { name: 'Version', value: versionData.version || 'N/A', inline: true },
            { name: 'Client Upload', value: versionData.clientUpload || 'N/A', inline: true },
            { name: 'Bootstrap', value: versionData.bootstrap || 'N/A', inline: true }
        )
        .setFooter({ text: `EΦAPM • ${formattedDate}` })
        .setTimestamp();

    if (updateMessage) {
        embed.setDescription(updateMessage);
    } else if (isInitial) {
        embed.setDescription('✅ **RobloxLx tracker is online!** Current version shown below.');
    }

    return embed;
}

function createDownloadButton(clientUpload) {
    const downloadUrl = `https://rdd.weao.gg/?channel=LIVE&binaryType=WindowsPlayer&version=${clientUpload}&includeLauncher=true&parallelDownload=true`;
    
    const button = new ButtonBuilder()
        .setLabel('📥 Download Here')
        .setStyle(ButtonStyle.Link)
        .setURL(downloadUrl);
    return new ActionRowBuilder().addComponents(button);
}

function getPingFormat() {
    return `<@&${PING_ID}>`;
}

async function checkForUpdates(client) {
    const currentVersionData = await fetchRobloxVersion();
    if (!currentVersionData) {
        console.log('Could not fetch version data, will retry later');
        return;
    }

    const stored = loadStoredVersion();
    const oldVersion = stored.version;

    if (currentVersionData.version !== oldVersion) {
        let updateMessage = '';
        let newUpdateCount = stored.updateCount;
        const nowTimestamp = Date.now();

        if (oldVersion === null) {
            const embed = createVersionEmbed(currentVersionData, null, true);
            const buttonRow = createDownloadButton(currentVersionData.clientUpload);
            const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
            if (channel) {
                await channel.send({ content: getPingFormat(), embeds: [embed], components: [buttonRow] });
            }
            saveVersionData(currentVersionData.version, 0, nowTimestamp);
            console.log(`Initial post: version ${currentVersionData.version}`);
            return;
        }

        newUpdateCount++;
        const daysSinceLastUpdate = stored.lastUpdateTimestamp ? (nowTimestamp - stored.lastUpdateTimestamp) / (1000 * 3600 * 24) : 0;

        if (daysSinceLastUpdate > 60) {
            updateMessage = `🔄 **Major update after several months!**\nRobloxLx has been updated from **${oldVersion}** → **${currentVersionData.version}**.\nGet the latest client now.`;
        } else if (daysSinceLastUpdate > 30) {
            updateMessage = `📢 **Update after over a month!**\nVersion changed from ${oldVersion} to ${currentVersionData.version}.`;
        } else {
            updateMessage = `✨ **New RobloxLx update available!**\nPrevious: ${oldVersion} → Current: ${currentVersionData.version}.`;
        }

        const embed = createVersionEmbed(currentVersionData, updateMessage, false);
        const buttonRow = createDownloadButton(currentVersionData.clientUpload);
        const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
        if (channel) {
            await channel.send({ content: getPingFormat(), embeds: [embed], components: [buttonRow] });
        }
        saveVersionData(currentVersionData.version, newUpdateCount, nowTimestamp);
        console.log(`Update posted: ${oldVersion} -> ${currentVersionData.version}`);
    } else {
        console.log(`No update. Current version: ${currentVersionData.version}`);
    }
}

// -------------------- DISCORD BOT INITIALIZATION --------------------
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Bot will post RobloxLx version updates to channel ID: ${CHANNEL_ID}`);
    console.log(`Ping ID set to: ${PING_ID}`);

    setTimeout(async () => {
        await checkForUpdates(client);
    }, 5000);

    setInterval(async () => {
        await checkForUpdates(client);
    }, 6 * 60 * 60 * 1000);
});

client.login(TOKEN);
