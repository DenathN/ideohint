#!/usr/bin/env node

var yargs = require("yargs")
	.alias("?", "help")
	.command(require("../commands/otd2hgl"))
	.command(require("../commands/extract"))
	.command(require("../commands/hint"))
	.command(require("../commands/hinthgl"))
	.command(require("../commands/apply"))
	.command(require("../commands/merge"))
	.command(require("../commands/visual"))
	.command(require("../commands/vtt"))
	.help()
	.argv;
