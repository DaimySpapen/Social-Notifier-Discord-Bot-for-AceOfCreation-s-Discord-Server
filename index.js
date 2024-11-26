const { Client, GatewayIntentBits, ActivityType } = require('discord.js'); // the library that makes everything work with discord (discord api wrapper)
const fetch = require('node-fetch');  // for sending api requests
const cron = require('node-cron');  // for setting intervals
const fs = require('fs');  // for reading/writing json files
require('dotenv').config();  // configuration file for sensitive information (like discord token and youtube api keys)

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const lastVideoFile = 'lastVideo.json'; // json file for saving newest video id
let lastVideoId = null;

// array of api keys to use for rotation
const apiKeys = [
    process.env.YOUTUBE_API_KEY_1,
    process.env.YOUTUBE_API_KEY_2,
    process.env.YOUTUBE_API_KEY_3,
    process.env.YOUTUBE_API_KEY_4
];
let apiKeyIndex = 0; // tracks which api key to use

// function to load the newest video id
function loadLastVideoId() {
    if (fs.existsSync(lastVideoFile)) {
        const data = JSON.parse(fs.readFileSync(lastVideoFile, 'utf-8'));
        lastVideoId = data.lastVideoId || null;
    }
}

// function to save the newest video ID
function saveLastVideoId(videoId) {
    fs.writeFileSync(lastVideoFile, JSON.stringify({ lastVideoId: videoId }, null, 2), 'utf-8');
}

// function to get the next api key (rotating through the array)
function getNextApiKey() {
    const key = apiKeys[apiKeyIndex];
    apiKeyIndex = (apiKeyIndex + 1) % apiKeys.length; // rotate to the next key
    return key;
}

// function to test all API keys
async function testApiKeys() {
    console.log('Testing API keys...');
    for (const apiKey of apiKeys) {
        try {
            const testUrl = `https://www.googleapis.com/youtube/v3/search?key=${apiKey}&part=snippet&maxResults=1`;
            const response = await fetch(testUrl);
            const data = await response.json();

            if (data.error) {
                console.error(`API Key Test Failed: ${apiKey} - ${data.error.message}`);
            } else {
                console.log(`API Key Working: ${apiKey}`);
            }
        } catch (error) {
            console.error(`Error testing API key: ${apiKey}`, error);
        }
    }
}

// function to check youtube api
async function checkNewVideo() {
    try {
        const apiKey = getNextApiKey(); // get the next API key
        const channelId = process.env.YOUTUBE_CHANNEL_ID;
        const url = `https://www.googleapis.com/youtube/v3/search?key=${apiKey}&channelId=${channelId}&part=snippet,id&order=date&maxResults=1`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.items && data.items.length > 0) {
            const video = data.items[0];
            const videoId = video.id.videoId;

            if (videoId && videoId !== lastVideoId) {
                lastVideoId = videoId;
                saveLastVideoId(videoId); // save newest video id in json file
                notifyDiscord(videoId);
            }
        }
    } catch (error) {
        console.error('Error checking YouTube API:', error);
    }
}

// function to send a notification in the discord server
function notifyDiscord(videoId) {
    const channel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);
    if (channel) {
        channel.send(`Hey @everyone, AceOfCreation just posted a video! Go check it out!\nhttps://www.youtube.com/watch?v=${videoId}`);
    } else {
        console.error('Channel not found'); // this should not happen lol
    }
}

// start the bot
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    
    loadLastVideoId();

 // Set custom status and activity
 client.user.setPresence({
    status: 'online',
    activities: [
        {
            name: 'AceOfCreations',
            type: ActivityType.Watching
        }
    ]
});

    // test api keys at startup
    await testApiKeys();
    
    // cron job setup (3 minutes and 30 seconds interval)
    cron.schedule('*/3 * * * *', () => {
        checkNewVideo();
    });
});

client.login(process.env.DISCORD_TOKEN);