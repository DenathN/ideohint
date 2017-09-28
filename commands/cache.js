"use strict";

const fs = require("fs");
const readline = require("readline");
const stream = require("stream");
const util = require("util");
const devnull = require("dev-null");
const paramfileLib = require("../support/paramfile");
const strategyLib = require("../support/strategy");

const core = require("../core/index");
const { progress } = require("./support/progress");

exports.command = "cache";
exports.describe = "Update cache";
exports.builder = function(yargs) {
	return yargs
		.alias("o", "output-into")
		.alias("?", "help")
		.describe("help", "Displays this help.")
		.describe("o", "Output cache HGC path.");
};

exports.handler = function(argv) {
	if (argv.help) {
		yargs.showHelp();
		return;
	}

	const OutStream = () =>
		argv.o ? fs.createWriteStream(argv.o, { encoding: "utf-8" }) : process.stdout;

	readCache({ cache: new Map(), tasks: argv._, OutStream });
};

function readCache(_) {
	const { cache, tasks, outStream } = _;
	if (!tasks.length) return setImmediate(() => finish(_));
	const [current, ...rest] = tasks;
	_.tasks = rest;

	if (!fs.existsSync(current)) return setImmediate(() => readCache(_));
	const rl = readline.createInterface(fs.createReadStream(current), devnull());
	rl.on("line", function(line) {
		const l = line.trim();
		if (!l) return;
		const data = JSON.parse(l);
		if (data.ideohint_version && data.ideohint_version !== core.version) return;
		if (!data.ideohint_version) data.ideohint_version = core.version;
		cache.set(data.hash, data);
	});
	rl.on("close", () => readCache(_));
}
function finish(_) {
	const { OutStream, cache } = _;
	const outStream = OutStream();
	for (let [hash, data] of cache) {
		outStream.write(JSON.stringify(data) + "\n");
	}
	if (process.stdout !== outStream) outStream.end();
}
