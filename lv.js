var Discord = require('discord.js');
var Request = require('request');
var parseIrc = require('irc-message').parse;
var config = require('./config.js');
var request = Request.defaults({
    headers: {
        'User-Agent': 'riotlv v' + require('./package.json').version
    }
});

const invitelink = 'https://discordapp.com/oauth2/authorize?client_id='
    + config.client_id + '&scope=bot&permissions=19456';

var client = new Discord.Client({
    autoReconnect: true
});

client.on('ready', function () {
    console.log("Ready");
    client.setStatus('online', 'with butts');
});

client.on('message', function (message) {
    // Make sure we're on allowed server
    if (message.channel.server.id === config.server_id) {
        let words = message.cleanContent.match(/(?:[^\s"]+|"[^"]*")+/g);
        if (words[0].startsWith(config.prefix)) {
            let cmd = words[0].substring(config.prefix.length);
            if (commands[cmd]) {
                words.shift();
                commands[cmd](message, words);
            }
        }
    }
});

client.on('warn', function (warn) {
    console.error('WARN', warn);
});

client.on('error', function (error) {
    console.error('ERROR', error);
});

client.loginWithToken(config.token, function (error) {
    if (error) {
        console.error("Couldn't login: ", error);
        process.exit(15);
    }
});

var commands = {
    help: function (message, words) {
        sendReply(message, "command prefix: " + config.prefix + " - commands: " + Object.keys(commands).join(', '));
    },
    lv: function (message, words) {
        let limit = words[2] || 10;
        let channel = words[1] || "riotgames";
        let user = words[0] || null;

        try {
            limit = Math.min(parseInt(limit), 50);
        } catch (e) {
            sendReply(message, "limit must be a number");
            return;
        }

        console.log("Log request for: `" + JSON.stringify({ user: words[0], channel: channel, limit: limit }) + "`");

        if (user === null) {
            sendReply(message, "usage: " + config.prefix + "lv <user> [channel] [limit]");
            return;
        }

        request('http://' + config.lvdomain + '/api/logs/'
                + encodeURIComponent(channel) + "/?token=" + config.lvtoken
                + "&nick=" + encodeURIComponent(user) + "&before=" + limit,
        function (error, response, body) {
            let reply;
            let data;
            if (error) {
                reply = "an error occurred with the API request";
                console.error('RERROR', error);
            }
            else {
                try {
                    data = JSON.parse(body);
                } catch (e) {
                    data = null;
                    reply = "an error occurred parsing the API response";
                    console.error('PERROR', e);
                }

                if (data !== null && data.before) {
                    reply = "here are logs for **" + user + "** from **" + channel + "**\n\n```";
                    for (let i = data.before.length - 1; i >= 0; --i) {
                        let index = data.before.length - 1 - i;
                        let ircmsg = parseIrc(data.before[index].text);
                        let line = "\n" + (new Date(data.before[index].time * 1000)).toISOString().replace('T', ' ').replace('Z', ' UTC')
                            + " | " + ircmsg.params[1];
                        if (reply.length + line.length > 1900) {
                            reply += "\n```";
                            sendReply(message, reply);
                            reply = "\n```";
                        }
                        reply += line;
                    }
                    reply += "\n```";
                }
                else {
                    reply = "no data found.";
                }
            }
            sendReply(message, reply);
        });
    },
    game: function (message, words) {
        let game = words.join(' ') || "with butts";
        client.setStatus('online', game);
    }
};

function sendReply(message, reply) {
    client.reply(message, reply, { tts: false }, function (error) {
        if (error) {
            console.error('WERROR', error);
        }
    });
}

process.on('SIGINT', function () {
    console.log("Logging out");
    client.logout(function () { process.exit(); });
});
