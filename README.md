# Log Viewer Bot

For looking up logs from CBenni's logviewer.

## Usage

`!lv <username> [channel] [limit]`

- ! can be customized with the prefix config option
- channel and limit are optional
- limit is the maximum number of lines returned (max 50, default 10)

## Setup

```
$ git clone git@github.com:3ventic/riotlv.git
$ cd riotlv
$ npm install
$ cp config.sample.js config.js
$ vi config.js
$ node lv
```
