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

const invitelink = 'https://discordapp.com/oauth2/authorize?client_id='
    + config.client_id + '&scope=bot&permissions=19456';
const defaults_file = './defaults.json';

var channel_defaults = {};

var client = new Discord.Client({
    autoReconnect: true
});

client.on('ready', function () {
    console.log("Ready");
    client.setStatus('online', 'with butts');
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

client.loginWithToken(config.token, function (error) {
    if (error) {
        console.error("Couldn't login: ", error);
        process.exit(15);
    }
});

function getToken(message) {
    return message.channel.server ? (config.lvtokens[message.channel.server.id] || "") : "";
}

function apiRequest(api, cb, errorcb) {
    request('http://' + config.lvdomain + '/api/' + api, function (error, response, body) {
        let data;
        if (error) {
            if (typeof errorcb === "function") errorcb("an error occurred with the API request");
            console.error('RERROR', api, error);
        } else if(response.statusCode !== 200) {
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

var formatTimespan = function(timespan) {
	var age = Math.round(timespan);
	var periods = [
		{abbr:"y", len: 3600*24*365},
		{abbr:"m", len: 3600*24*30},
		{abbr:"d", len: 3600*24},
		{abbr:" hrs", len: 3600},
		{abbr:" min", len: 60},
		{abbr:" sec", len: 1},
	];
	var res = "";
	var count = 0;
	for(var i=0;i<periods.length;++i) {
		if(age >= periods[i].len) {
			var pval = Math.floor(age / periods[i].len);
			age = age % periods[i].len;
			res += (res?" ":"")+pval+periods[i].abbr;
			count ++;
			if(count >= 2) break;
		}
	}
	return res;
}

function sendLogs(replyto, channel, logs, comments) {
	var now = Math.floor(Date.now()/1000);
	var reply = "here are logs for **" + logs.user.nick + "** from **" + channel + " ("+logs.user.messages+" messages, "+logs.user.timeouts+" timeouts)**\n\n```";
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
	for (let i = 0; i < comments.length; ++i) {
		let comment = comments[i];
		let line =  "Comment by "+comment.author+" (";
		if(comment.added == comment.edited) line += "added";
		else line += "edited";
		line += " " + formatTimespan(now - comment.edited) + " ago)";
		line += "```"+comment.text+"```";
		if (reply.length + line.length > 1900) {
			sendReply(replyto, reply);
			reply = "";
		}
		reply += line;
	}
	reply += '\nSee http://' + config.lvpublicdomain + '/' + encodeURIComponent(channel) + "/?user=" + encodeURIComponent(logs.user.nick);
	if(reply) sendReply(replyto, reply);
}

var commands = {
    help: function (message, words) {
        sendReply(message, "command prefix: " + config.prefix + " - commands: " + Object.keys(commands).join(', '));
    },
    list: function (message, words) {
        let token = getToken(message);
        apiRequest('channels?token=' + token, function (data) {
            let reply = "";
            data.forEach(function (ch) {
                if (reply.length > 1900) {
                    sendReply(message, reply.slice(0, -2));
                    reply = "";
                }
                reply += ch.name + ", ";
            });
            sendReply(message, reply.slice(0, -2));
        }, function (error) {
            sendReply(message, error);
        });
    },
    setdefault: function (message, words) {
        if (message.channel.permissionsOf(message.author).hasPermission('manageChannel')) {
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
		if(words.length > 1) {
			if(isNaN(words[1])) {
				channel = words[1]
				limit = Math.floor(Math.min(parseInt(words[2]), 50)) || 10;
			} else {
				limit = Math.floor(Math.min(parseInt(words[1]), 50)) || 10;
				if(words[2]) channel = words[2];
			}
		}

        console.log("Log request for: `" + JSON.stringify({ user: words[0], channel: channel, limit: limit }) + "`");

        if (!user || !channel) {
            sendReply(message, "usage: " + config.prefix + "lv <user> [channel] [limit]");
            return;
        }

        let token = getToken(message);

        apiRequest('logs/' + encodeURIComponent(channel) + "/?token=" + token
                + "&nick=" + encodeURIComponent(user) + "&before=" + limit,
        function (logs) {
			if(logs.error) {
				sendReply(message, logs.error);
				return;
			}
			apiRequest('comments/' + encodeURIComponent(channel) + "/?token=" + token
                + "&topic=" + encodeURIComponent(user), 
			function(comments) {
				console.log("Comments successful")
				sendLogs(message, channel, logs, comments);
			}, function(error) {
				console.log("Comments unsuccessful")
				sendLogs(message, channel, logs, []);
			});
        }, function (error) {
            sendReply(message, error);
        });
    },
    game: function (message, words) {
        let game = words.join(' ') || "with butts";
        client.setStatus('online', game);
    },
    invite: function(message, words) {
        sendReply(message, invitelink);
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
    var exit_tasks_done = 0;
    var exit_tasks_total = 2;
    function exitTaskCheck() {
        if (++exit_tasks_done >= exit_tasks_total) {
            process.exit();   
        }
    }
    console.log("Logging out and saving data...");
    client.logout(exitTaskCheck);
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
		if(err.code == "ENOENT") {
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