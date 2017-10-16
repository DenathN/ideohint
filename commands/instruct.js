"use strict";

const fs = require("fs");
const readline = require("readline");
const devnull = require("dev-null");
const instruct = require("../instructor").instruct;

const cvtlib = require("../instructor/cvt");
const paramLib = require("../support/paramfile");
const strategyLib = require("../support/strategy");
const { talk } = require("../instructor/vtttalk");

exports.command = "instruct";
exports.describe = "Create instruction file.";
exports.builder = function(yargs) {
	return yargs
		.alias("o", "output-into")
		.alias("?", "help")
		.alias("p", "parameters")
		.describe("help", "Displays this help.")
		.describe("o", "Output otd path. When absent, the result OTD will be written to STDOUT.")
		.describe("parameters", "Specify parameter file (in TOML).")
		.describe("CVT_PADDING", "Specify CVT Padding.");
};

exports.handler = function(argv) {
	const InStream = () => (argv._[1] ? fs.createReadStream(argv._[1]) : process.stdin);
	const OutStream = () =>
		argv.o ? fs.createWriteStream(argv.o, { encoding: "utf-8" }) : process.stdout;

	mapInstrut({ InStream, OutStream, argv });
};

function mapInstrut(_) {
	const { InStream, OutStream, argv } = _;
	const parameterFile = paramLib.from(argv);
	const strategy = strategyLib.from(argv, parameterFile);
	const cvtPadding = cvtlib.getPadding(argv, parameterFile);
	const fpgmPadding = cvtlib.getFpgmPadding(argv, parameterFile);

	const rl = readline.createInterface(InStream(), devnull());
	const outStream = OutStream();

	rl.on("line", function(line) {
		const l = line.trim();
		if (!l) return;
		const data = JSON.parse(l);
		const hgsData = {
			hash: data.hash,
			name: data.name,
			ideohint_decision: data.ideohint_decision,
			TTF_instructions: instruct(data.ideohint_decision, strategy, cvtPadding),
			VTTTalk:
				talk(data.ideohint_decision, strategy, cvtPadding, fpgmPadding, data.contours) || ""
		};
		outStream.write(JSON.stringify(hgsData) + "\n");
	});
	rl.on("close", function() {
		if (process.stdout !== outStream) outStream.end();
	});
}
