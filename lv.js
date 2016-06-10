var fs = require('fs');
var bodyParser = require('body-parser');
var express = require('express');
var http_app = express();
var Request = require('request');
var parseIrc = require('irc-message').parse;
var config = require('./config.js');
var request = Request.defaults({
    headers: {
        'User-Agent': 'riotlv v' + require('./package.json').version
    }
});

function apiRequest(api, cb, errorcb) {
    request('http://' + config.lvdomain + '/api/' + api, function (error, response, body) {
        let data;
        if (error) {
            if (typeof errorcb === "function") errorcb("an error occurred with the API request");
            console.error('RERROR', error);
        }
        else {
            try {
                data = JSON.parse(body);
            } catch (e) {
                data = null;
                if (typeof errorcb === "function") errorcb("an error occurred parsing the API response");
                console.error('PERROR', e);
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


function lookupLogs(words, cb) {
    let limit = words[2] || 10;
    let channel = words[1] || "riotgames";
    let user = words[0] || null;

    try {
        limit = Math.min(parseInt(limit), 50);
    } catch (e) {
        cb("limit must be a number");
        return;
    }

    console.log("Log request for: `" + JSON.stringify({ user: words[0], channel: channel, limit: limit }) + "`");

    if (user === null) {
        cb("usage: /lv <user> [channel] [limit]");
        return;
    }

    apiRequest('logs/' + encodeURIComponent(channel) + "/?token=" + config.lvtoken
            + "&nick=" + encodeURIComponent(user) + "&before=" + limit,
    function (data) {
        if (data.before) {
            reply = "here are logs for " + user + " on " + channel + "\n\n```";
            for (let i = data.before.length - 1; i >= 0; --i) {
                let index = data.before.length - 1 - i;
                let ircmsg = parseIrc(data.before[index].text);
                let line = "\n" + (new Date(data.before[index].time * 1000)).toISOString().replace('T', ' ').replace('Z', ' UTC')
                    + " | " + ircmsg.params[1];
                reply += line;
            }
            reply += "\n```";
        }
        else {
            reply = "no data found.";
        }
        reply += '\nSee http://' + config.lvpublicdomain + '/' + encodeURIComponent(channel) + "/?user=" + encodeURIComponent(user);
        cb(reply);
    }, function (error) {
        cb(error);
    });
}

http_app.use(bodyParser.json());
http_app.use(bodyParser.urlencoded({ extended: true }));
http_app.post('/command', function (req, res) {
    let token = req.body.token;
    if (token !== config.token) {
        res.status(403).send('No access token');
        return;
    }
    let text = req.body.text;
    lookupLogs(text.match(/(?:[^\s"]+|"[^"]*")+/g), (msg) => {
        res.status(200).send(msg);
    });
});

var port = config.port || 8080;
http_app.listen(port);
console.log("Listening to HTTP on port " + port);

process.on('SIGINT', function () {
    var exit_tasks_done = 0;
    var exit_tasks_total = 2;
    function exitTaskCheck() {
        if (++exit_tasks_done >= exit_tasks_total) {
            process.exit();   
        }
    }
    console.log("Exiting..");
    process.exit();
});
