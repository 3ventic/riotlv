"use strict";

var fs = require('fs');
var Discord = require('discord.js');
var Request = require('request');
var parseIrc = require('irc-message').parse;
var config = require('./config.js');
var request = Request.defaults({
    headers: {
        'User-Agent': 'riotlv v' + require('./package.json').version
    }
});

var tokens = config.lvtokens;

const invitelink = 'https://discordapp.com/oauth2/authorize?client_id='
    + config.client_id + '&scope=bot&permissions=0';
console.log("Invite link: ", invitelink)
const defaults_file = './defaults.json';
const tokens_file = './tokens.json';

var channel_defaults = {};

var client = new Discord.Client({
    autoReconnect: true
});

client.on('ready', function () {
    console.log("Ready");
    client.user.setGame('deny the unbans');
});

client.on('message', function (message) {
    let words = message.cleanContent.match(/(?:[^\s"]+|"[^"]*")+/g);
    if (words && words[0].startsWith(config.prefix)) {
        let cmd = words[0].substring(config.prefix.length);
        if (commands[cmd]) {
            words.shift();
            commands[cmd](message, words);
        }
    }
});

client.on('warn', function (warn) {
    console.error('WARN', warn);
});

client.on('error', function (error) {
    console.error('ERROR', error);
});

client.login(config.token, function (error) {
    if (error) {
        console.error("Couldn't login: ", error);
        process.exit(15);
    }
});

function getToken(message) {
	console.log("Tokens: ",config.lvtokens);
	console.log("Message from guild: ",message.guild.id);
    return message.guild ? (config.lvtokens[message.guild.id] || "") : "";
}

function apiRequest(api, cb, errorcb) {
    request('http://' + config.lvdomain + '/api/' + api, function (error, response, body) {
        let data;
        if (error) {
            if (typeof errorcb === "function") errorcb("an error occurred with the API request");
            console.error('RERROR', api, error);
        } else if (response.statusCode !== 200) {
            if (typeof errorcb === "function") errorcb("an error occurred with the API request");
            console.error('RERROR', api, response.statusCode);
        } else {
            try {
                data = JSON.parse(body);
            } catch (e) {
                data = null;
                if (typeof errorcb === "function") errorcb("an error occurred parsing the API response");
                console.error('PERROR', e);
                return;
            }
            if (data != null && typeof cb === "function") {
                cb(data);
            }
            else if (typeof errorcb === "function") {
                errorcb("no data returned");
            }
        }
    });
}

var formatTimespan = function (timespan) {
    var age = Math.round(timespan);
    var periods = [
        { abbr: "y", len: 3600 * 24 * 365 },
        { abbr: "m", len: 3600 * 24 * 30 },
        { abbr: "d", len: 3600 * 24 },
        { abbr: " hrs", len: 3600 },
        { abbr: " min", len: 60 },
        { abbr: " sec", len: 1 },
    ];
    var res = "";
    var count = 0;
    for (var i = 0; i < periods.length; ++i) {
        if (age >= periods[i].len) {
            var pval = Math.floor(age / periods[i].len);
            age = age % periods[i].len;
            res += (res ? " " : "") + pval + periods[i].abbr;
            count++;
            if (count >= 2) break;
        }
    }
    return res;
}

function sendLogs(replyto, channel, logs) {
    var now = Math.floor(Date.now() / 1000);
    var reply = "here are logs for **" + logs.user.nick + "** from **" + channel + " (" + logs.user.messages + " messages, " + logs.user.timeouts + " timeouts, " + logs.user.bans + " bans)**\n\n```";
    // reverse iteration for pretty pagination
    for (let i = logs.before.length - 1; i >= 0; --i) {
        let index = logs.before.length - 1 - i;
        let message = logs.before[index];
        let ircmsg = parseIrc(message.text);
        let line = "\n[" + formatTimespan(now - message.time) + " ago] " + message.nick + ": " + ircmsg.params[1];
        if (reply.length + line.length > 1900) {
            reply += "\n```";
            sendReply(replyto, reply);
            reply = "\n```";
        }
        reply += line;
    }
    reply += "\n```";
    if (reply.length > 1900) {
        sendReply(replyto, reply);
        reply = ""
    }
    if (logs.comments) {
        for (let i = 0; i < logs.comments.length; ++i) {
            let comment = logs.comments[i];
            let line = "Comment by " + comment.author + " (";
            if (comment.added == comment.edited) line += "added";
            else line += "edited";
            line += " " + formatTimespan(now - comment.edited) + " ago)";
            line += "```" + comment.text + "```";
            if (reply.length + line.length > 1900) {
                sendReply(replyto, reply);
                reply = "";
            }
            reply += line;
        }
    }
    reply += '\nSee http://' + config.lvpublicdomain + '/' + encodeURIComponent(channel) + "/?user=" + encodeURIComponent(logs.user.nick);
    if (reply) sendReply(replyto, reply);
}

var commands = {
    help: function (message, words) {
        sendReply(message, "command prefix: " + config.prefix + " - commands: " + Object.keys(commands).join(', '));
    },
    setdefault: function (message, words) {
        if (message.channel.permissionsFor(message.author).has(Discord.Permissions.FLAGS.MANAGE_CHANNELS)) {
            let default_channel = words[0] || null;
            if (default_channel !== null) {
                channel_defaults[message.channel.id] = default_channel.toLowerCase();
                sendReply(message, "default for this channel set to " + channel_defaults[message.channel.id]);
            } else {
                sendReply(message, "usage: !setdefault [channel name]");
            }
        } else {
            sendReply(message, "shush, you don't have permission to do this!");
        }
    },
    lv: function (message, words) {
        let user = words[0] || null;
        let channel = channel_defaults[message.channel.id];
        let limit = 10;
        if (words.length > 1) {
            if (isNaN(words[1])) {
                channel = words[1]
                limit = Math.floor(Math.min(parseInt(words[2]), 50)) || 10;
            } else {
                limit = Math.floor(Math.min(parseInt(words[1]), 50)) || 10;
                if (words[2]) channel = words[2];
            }
        }

        console.log("Log request for: `" + JSON.stringify({ user: words[0], channel: channel, limit: limit }) + "`");

        if (!user) {
            sendReply(message, "usage: " + config.prefix + "lv <user> [channel] [limit]");
            return;
        } else if (!channel) {
            sendReply(message, "usage: " + config.prefix + "lv <user> [channel] [limit] - or use !setdefault <channel> to set a default channel");
            return;
        } else if (!/^[a-zA-Z0-9]\w+$/.test(user)) {
            sendReply(message, "Invalid user name!");
            return;
        }

		let token = getToken(message);
		console.log("Got token: ",token)

        apiRequest('logs/' + encodeURIComponent(channel) + "/?token=" + token
            + "&nick=" + encodeURIComponent(user) + "&before=" + limit,
            function (logs) {
                if (logs.error) {
                    sendReply(message, logs.error);
                    return;
                }
                sendLogs(message, channel, logs);
            }, function (error) {
                sendReply(message, error);
            });
    },
    game: function (message, words) {
        let game = words.join(' ') || "with butts";
        client.setStatus('online', game);
    },
    invite: function (message, words) {
        sendReply(message, `Invite the logviewer lookup bot to your server here: <${invitelink}>`);
    },
    verify: function (message, words) {
        if (message.channel.permissionsFor(message.author).has(Discord.Permissions.FLAGS.MANAGE_CHANNELS)) {
            if (config.lvadmin) {
                const integrationName = "_discord_" + message.guild.id;
                if (config.lvtokens[message.guild.id]) {
                    sendReply(message, `Please add the user ${integrationName} as a manager in your channel settings.`);
                } else {
                    request.post("https://" + config.lvdomain + "/api/token", { form: { token: config.lvadmin, user: integrationName, duration: 3600 * 24 * 365 * 10 } }, (err, res, body) => {
                        if (err) {
                            sendReply(message, "An error occurred: " + res.statusCode);
                        } else {
                            const response = JSON.parse(body);
                            console.log("Token response: ",response);
                            config.lvtokens[message.guild.id] = response.token;
                            saveTokens();
                            sendReply(message, `Please add the user ${integrationName} as a manager in your channel settings.`);
                        }
                    })
                }
            } else {
                sendReply(message, "Missing logviewer admin token!")
            }
        }
    },
    game: function (message, words) {
        let game = words.join(' ') || "with butts";
        client.user.setGame(game);
    },
    invite: function (message, words) {
        sendReply(message, invitelink);
    }
};

function sendReply(message, reply) {
    message.reply(reply, { tts: false }, function (error) {
        if (error) {
            console.error('WERROR', error);
        }
    });
}

process.on('SIGINT', function () {
    var exit_tasks_done = 0;
    var exit_tasks_total = 2;
    function exitTaskCheck() {
        if (++exit_tasks_done >= exit_tasks_total) {
            process.exit();
        }
    }
    console.log("Logging out and saving data...");
    client.destroy().then(exitTaskCheck);
    saveDefaults(exitTaskCheck);
});

function saveDefaults(cb) {
    fs.writeFile(defaults_file, JSON.stringify(channel_defaults), (err) => {
        if (err) {
            console.error("Write error", defaults_file);
        }
        cb();
    });
}

// Load defaults
fs.readFile(defaults_file, (err, data) => {
    if (err) {
        if (err.code == "ENOENT") {
            console.log("No defaults file found.")
        } else {
            console.error("Read error", defaults_file, err);
        }
    } else {
        try {
            channel_defaults = JSON.parse(data);
        } catch (e) {
            console.error("JSON error", e);
        }
    }
});

// Load tokens
fs.readFile(tokens_file, (err, data) => {
    if (err) {
        if (err.code == "ENOENT") {
            console.log("No tokens file found.")
        } else {
            console.error("Read error", tokens_file, err);
        }
    } else {
        try {
            config.lvtokens = JSON.parse(data);
        } catch (e) {
            console.error("JSON error", e);
        }
    }
});

function saveTokens(cb) {
    fs.writeFile(tokens_file, JSON.stringify(config.lvtokens), (err) => {
        if (err) {
            console.error("Write error", defaults_file);
        }
        if(cb) cb();
    });
}