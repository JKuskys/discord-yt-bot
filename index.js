const { GatewayIntentBits, Events, Client } = require('discord.js')
const { createAudioPlayer, createAudioResource, joinVoiceChannel, NoSubscriberBehavior, VoiceConnectionStatus } = require('@discordjs/voice')
const play = require('play-dl')

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates],
    partials: ['CHANNEL', 'MESSAGE']
})
const token = (process.argv.find(argument => argument.startsWith('TOKEN=')) || '').replace('TOKEN=', '')
client.login(token);

const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play }})
let queue = []
let connection = undefined;
let lastMessage = undefined;
let currentlyPlaying = undefined;
let isLoop = false;

client.on('messageCreate', async message => {
    
    if (message.content.startsWith('!play')) {
        lastMessage = message;
        const args = lastMessage.content.split(' ');

        addToQueue(args.slice(1));
    }

    if (message.content.startsWith('!skip')) {
        lastMessage = message;
        await playAvailable(true);
    }

    if (message.content.startsWith('!startLoop')) {
        lastMessage = message;
        isLoop = true;
        lastMessage.channel.send(`Looping current or next song`);
    }

    if (message.content.startsWith('!endLoop')) {
        lastMessage = message;
        isLoop = false;
        lastMessage.channel.send(`Stopped looping`);
    }

    if (message.content.startsWith('!queue')) {
        lastMessage = message;
        if (currentlyPlaying) {
            let message = ` 
Currently playing ${isLoop? '(looping)' : ''}: ${currentlyPlaying.title}`;
            if (queue.length > 0) {
                message += `
Next playing:`;
                queue.forEach((item, i) => message += `
${ i + 1 }. ${item.title}`)
            }

            lastMessage.channel.send(message);
        } else {
            lastMessage.channel.send(`Nothing in the queue`);
        }
    }
})

async function playAvailable(skip) {
    if (!isConnectionValid()) {
        joinChannel()
    }

    if (!isConnectionValid()) {
        return;
    }

    if (isLoop && currentlyPlaying && !skip) {
        const { title, url } = currentlyPlaying;
        const stream = await play.stream(url);
    
        const resource = createAudioResource(stream.stream, {
            inputType: stream.type
        });

        currentlyPlaying.resource = resource;

        player.play(resource)
        queue = queue.filter((_, i) => i !== 0 );
        return;
    }

    if ((queue.length > 0 && player.state.status !== 'playing') || skip) {
        currentlyPlaying = queue[0];
        const { resource, title } = currentlyPlaying;
        player.play(resource)
        queue = queue.filter((_, i) => i !== 0 );
        lastMessage.channel.send(`Now playing: ${title}`);
        return;
    }

    if (queue.length === 0) {
        connection.connection.destroy();
        connection = undefined;
        currentlyPlaying = undefined;
    }
}

async function addToQueue(strings) {
    let videoInfo = undefined;
    
    if (strings[0].startsWith('https') && play.yt_validate(strings[0]) === 'video') {
        videoInfo = (await play.video_info(strings[0])).video_details
    } else {
        videoInfo = (await play.search(strings.join(" "), { limit: 1 }))[0]
    }
    
    const stream = await play.stream(videoInfo.url);
    
    const resource = createAudioResource(stream.stream, {
        inputType: stream.type
    });

    queue.push({title: videoInfo.title, resource, url: videoInfo.url});

    lastMessage.channel.send(`Added to queue: ${videoInfo.title}`);

    await playAvailable();
}


function isConnectionValid() {
    if (!connection) {
        return false;
    }

    if (connection.connection?.state?.status === 'disconnected') {
        return false;
    }

    return true;
}

function joinChannel () {
    if (!lastMessage?.member.voice?.channel) {
        return lastMessage.channel.send('Connect to a Voice Channel')
    }

    connection = joinVoiceChannel({
        channelId: lastMessage.member.voice.channel.id,
        guildId: lastMessage.guild.id,
        adapterCreator: lastMessage.guild.voiceAdapterCreator
    }).subscribe(player)
}

player.addListener("stateChange", async (oldOne, newOne) => {
    if (newOne.status == "idle") {
        await playAvailable();
    }
});

