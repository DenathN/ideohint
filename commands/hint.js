"use strict";

var fs = require("fs");
var readline = require("readline");
var stream = require("stream");
var util = require("util");
var devnull = require("dev-null");
var paramfileLib = require("../paramfile");
var strategyLib = require("../strategy");

const { hintAllSize } = require("../hinter");
const { progress } = require('./support/progress');

exports.command = "hint";
exports.describe = "Hint a feature file (hgf).";
exports.builder = function (yargs) {
	return yargs.alias("o", "output-into")
		.alias("?", "help")
		.alias("p", "parameters")
		.describe("help", "Displays this help.")
		.describe("o", "Output sfd path. When absent, the result sfd is written to STDOUT.")
		.describe("d", "Only process dk+m'th glyphs in the feature file. Combine with -m for parallel processing.")
		.describe("m", "Only process dk+m'th glyphs in the feature file. Combine with -d for parallel processing.")
		.describe("parameters", "Specify parameter file (in TOML).");
};

exports.handler = function (argv) {
	if (argv.help) { yargs.showHelp(); process.exit(0); }

	let inStream = argv._[1] ? fs.createReadStream(argv._[1]) : process.stdin;
	let outStream = argv.o ? fs.createWriteStream(argv.o, { encoding: "utf-8" }) : process.stdout;
	let rl = readline.createInterface(inStream, devnull());


	let parameterFile = paramfileLib.from(argv);
	let strategy = strategyLib.from(argv, parameterFile);

	let divide = argv.d || 1;
	let modulo = argv.m || 0;
	let pendings = [];

	let name = "Hinting " + (argv._[1] || "(stdin)") + " " + modulo + "/" + divide

	let j = 0;
	rl.on("line", function (line) {
		if (j % divide === modulo % divide) {
			const l = line.trim();
			if (l) pendings.push(JSON.parse(l));
		}
		j += 1;
	});
	rl.on("close", finish.bind(null, name, strategy, pendings, outStream));
};

function finish(name, strategy, pendings, outStream) {
	progress(name, pendings, data => {
		const decision = hintAllSize(data[2], strategy);
		const recordLine = [data[0], data[1], decision];
		outStream.write(JSON.stringify(recordLine) + "\n");
	})
	if (process.stdout !== outStream) outStream.end();
}
