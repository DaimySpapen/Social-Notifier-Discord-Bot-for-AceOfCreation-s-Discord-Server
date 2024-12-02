const { Client, GatewayIntentBits, ActivityType } = require('discord.js'); // discord api wrapper
const fetch = require('node-fetch'); // for api requests
const cron = require('node-cron'); // for intervals
const fs = require('fs'); // for writing/reading json files
require('dotenv').config(); // configuration file for sensitive information (like discord token and youtube api keys)

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const videoDataFile = 'videos.json'; // json file for video ids
let lastVideos = []; // array to save last 3 video ids
let isCheckingVideo = false; // lock for overlapping api calls

// api key array voor rotatie
const apiKeys = [
    process.env.YOUTUBE_API_KEY_1,
    process.env.YOUTUBE_API_KEY_2,
    process.env.YOUTUBE_API_KEY_3,
    process.env.YOUTUBE_API_KEY_4
];
let apiKeyIndex = 0; // track current api key

// load saved video ids on start
function loadVideoData() {
    if (fs.existsSync(videoDataFile)) {
        const data = JSON.parse(fs.readFileSync(videoDataFile, 'utf-8'));
        lastVideos = data.videoIds || [];
    }
}

// save the last 3 video ids
function saveVideoData() {
    fs.writeFileSync(
        videoDataFile,
        JSON.stringify({ videoIds: lastVideos.slice(-3) }, null, 2),
        'utf-8'
    );
}

// get next api key
function getNextApiKey() {
    const key = apiKeys[apiKeyIndex];
    apiKeyIndex = (apiKeyIndex + 1) % apiKeys.length;
    return key;
}

// better api key rotation with fallback
async function fetchWithRetries(url) {
    let retries = 0;
    while (retries < apiKeys.length) {
        const apiKey = getNextApiKey();
        const fullUrl = `${url}&key=${apiKey}`;
        try {
            const response = await fetch(fullUrl);
            const data = await response.json();
            if (data.error) {
                console.error(`API Key Error (${apiKey}):`, data.error.message);
                retries++;
            } else {
                return data;
            }
        } catch (error) {
            console.error(`Fetch error with API key (${apiKey}):`, error);
            retries++;
        }
    }
    console.error('All API keys failed.');
    return null;
}

// check for new videos
async function checkNewVideo() {
    if (isCheckingVideo) return; // prevent overlap
    isCheckingVideo = true;

    try {
        const channelId = process.env.YOUTUBE_CHANNEL_ID;
        const url = `https://www.googleapis.com/youtube/v3/search?channelId=${channelId}&part=snippet,id&order=date&maxResults=1`;

        const data = await fetchWithRetries(url);
        if (!data || !data.items || data.items.length === 0) {
            console.error('Invalid or empty response from YouTube API.');
            return;
        }

        // filter only video items
        const validVideos = data.items.filter(item => item.id.kind === 'youtube#video');
        const ignoredItems = data.items.filter(item => item.id.kind !== 'youtube#video');

        if (ignoredItems.length > 0) {
            console.warn('Non-video items found in response:', ignoredItems.map(item => item.id.kind));
        }

        if (validVideos.length > 0) {
            const latestVideo = validVideos[0];
            if (!lastVideos.includes(latestVideo.id.videoId)) {
                lastVideos.push(latestVideo.id.videoId);
                notifyDiscord(latestVideo.id.videoId);

                // keep only the last 3 videos
                lastVideos = lastVideos.slice(-3);
                saveVideoData();
            } else {
                console.log('No new videos found.');
            }
        } else {
            console.log('No valid video items found in the response.');
        }
    } catch (error) {
        console.error('Error checking for new videos:', error);
    } finally {
        isCheckingVideo = false;
    }
}

// send notifications to discord
function notifyDiscord(videoId) {
    const channel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);
    if (channel) {
        channel.send(`Hey @everyone, AceOfCreation just posted a new video! 🎥 Check it out:\nhttps://www.youtube.com/watch?v=${videoId}`);
        console.log(`Notified about video: ${videoId}`);
    } else {
        console.error('Discord channel not found.');
    }
}

// start bot and set status
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    loadVideoData();

    const statuses = [
        { name: 'AceOfCreation', type: ActivityType.Listening },
        { name: 'you', type: ActivityType.Watching }  // funny?:)
    ];

    let currentIndex = 0;
    setInterval(() => {
        const nextStatus = statuses[currentIndex];
        client.user.setPresence({
            status: 'online',
            activities: [nextStatus],
        });
        currentIndex = (currentIndex + 1) % statuses.length;
    }, 10000);

    cron.schedule('*/3 * * * *', checkNewVideo); // every 3 minutes check for video ids
});

// test api keys on startup
async function testApiKeys() {
    console.log('Testing API keys...');
    for (const apiKey of apiKeys) {
        try {
            const testUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&key=${apiKey}`;
            const response = await fetch(testUrl);
            const data = await response.json();
            if (data.error) {
                console.error(`API Key Test Failed (${apiKey}): ${data.error.message}`);
            } else {
                console.log(`API Key Working: ${apiKey}`);
            }
        } catch (error) {
            console.error(`Error testing API key (${apiKey}):`, error);
        }
    }
}

testApiKeys(); // test api keys on startup
client.login(process.env.DISCORD_TOKEN);
