"use strict";

const fs = require("fs");
const readline = require("readline");
const stream = require("stream");
const devnull = require("dev-null");
const util = require("util");
const stripBom = require("strip-bom");
const oboe = require("oboe");
const instruct = require("../instructor").instruct;
const stringifyToStream = require("../support/stringify-to-stream");

const cvtlib = require("../instructor/cvt");
const paramLib = require("../support/paramfile");
const strategyLib = require("../support/strategy");
const { talk, generateCVT, generateFPGM } = require("../instructor/vtttalk");

const hashContours = require("../core/otdParser").hashContours;

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
	if (argv.help) {
		yargs.showHelp();
		return;
	}

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

	let n = 1;
	rl.on("line", function(line) {
		const l = line.trim();
		if (!l) return;
		const data = JSON.parse(l);
		const decision = data.ideohint_decision;
		const hgsData = {
			hash: data.hash,
			name: data.name,
			ideohint_decision: data.ideohint_decision,
			TTF_instructions: instruct(data.ideohint_decision, strategy, cvtPadding),
			VTTTalk:
				talk(data.ideohint_decision, strategy, cvtPadding, fpgmPadding, data.contours) || ""
		};
		outStream.write(JSON.stringify(hgsData) + "\n");

		if (n % 100 === 0) console.error(`Processed ${n} glyphs.`);
		n += 1;
	});
	rl.on("close", function() {
		if (process.stdout !== outStream) outStream.end();
	});
}
