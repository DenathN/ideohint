"use strict";

var fs = require("fs");
var readline = require("readline");
var stream = require("stream");
var devnull = require("dev-null");
var util = require("util");
var stripBom = require("strip-bom");
var oboe = require("oboe");
var instruct = require("../instructor").instruct;
var stringifyToStream = require("../support/stringify-to-stream");
var cvtlib = require("../instructor/cvt");
var { talk, generateCVT } = require("../instructor/vtttalk");

var hashContours = require("../support/otdParser").hashContours;

var crypto = require("crypto");
function md5(text) {
	return crypto.createHash("md5").update(text).digest("hex");
}

exports.command = "apply";
exports.describe = "Apply hints to font dump.";
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
	var hgiStream = argv._[2] ? fs.createReadStream(argv._[1], "utf-8") : process.stdin;
	var rl = readline.createInterface(hgiStream, devnull());
	var parameterFile = require("../support/paramfile").from(argv);
	var strategy = require("../support/strategy").from(argv, parameterFile);

	var cvtPadding = cvtlib.getPadding(argv, parameterFile);
	var linkCvt = cvtlib.createCvt([], strategy, cvtPadding);

	var activeInstructions = {};
	var tsi = {};
	var glyfcor = {};

	rl.on("line", function(line) {
		const dataStr = line.trim();
		if (!dataStr) return;
		var data = JSON.parse(dataStr);
		activeInstructions[data.hash] = {
			TTF: instruct(data.ideohint_decision, strategy, cvtPadding),
			VTTTalk: talk(data.ideohint_decision, strategy, cvtPadding, false) || ""
		};
	});
	rl.on("close", function() {
		pass_weaveOTD(activeInstructions);
	});

	function pass_weaveOTD(activeInstructions) {
		var otdPath = argv._[2] ? argv._[2] : argv._[1];
		process.stderr.write("Weaving OTD " + otdPath + "\n");
		var instream = fs.createReadStream(otdPath, "utf-8");
		var foundCVT = false;

		oboe(instream)
			.on("node", "cvt_", function(cvt) {
				foundCVT = true;
				return cvtlib.createCvt(cvt, strategy, cvtPadding);
			})
			.on("node", "maxp", function(maxp) {
				if (maxp.maxStackElements < strategy.STACK_DEPTH + 20) {
					maxp.maxStackElements = strategy.STACK_DEPTH + 20;
				}
				return maxp;
			})
			.on("node", "glyf.*", function(glyph, path) {
				if (!glyph.contours || !glyph.contours.length) return glyph;
				var hash = hashContours(glyph.contours);
				if (!argv.just_modify_cvt && activeInstructions[hash]) {
					glyph.instructions = activeInstructions[hash].TTF;
					glyfcor[path[path.length - 1]] = hash;
				}
				return glyph;
			})
			.on("done", function(otd) {
				if (!foundCVT) {
					otd.cvt_ = cvtlib.createCvt([], strategy, cvtPadding);
				}
				if (otd.TSI_23) {
					if (!otd.TSI_23.glyphs) otd.TSI_23.glyphs = {};
					for (let k in otd.glyf) {
						if (!otd.glyf[k].contours || !glyfcor[k]) continue;
						let data = activeInstructions[glyfcor[k]];
						otd.TSI_23.glyphs[k] = (data.VTTTalk || "").replace(/\n/g, "\r"); // vtt uses CR
					}
				}
				if (otd.TSI_01 && otd.TSI_01.glyphs) {
					for (let k in otd.TSI_01.glyphs) {
						if (otd.TSI_23 && otd.TSI_23.glyphs && otd.TSI_23.glyphs[k]) {
							otd.TSI_01.glyphs[k] = "";
						}
					}
				}
				if (otd.TSI_01 && otd.TSI_01.extra && otd.TSI_01.extra.cvt) {
					otd.TSI_01.extra.cvt = generateCVT(otd.TSI_01.extra.cvt, cvtPadding, strategy);
				}
				if (argv.padvtt && !otd.TSI_01) {
					otd.TSI_01 = { glyphs: {}, extra: {} };
					otd.TSI_23 = { glyphs: {}, extra: {} };
				}
				var outStream = argv.o
					? fs.createWriteStream(argv.o, { encoding: "utf-8" })
					: process.stdout;
				stringifyToStream(otd, outStream, outStream === process.stdout)();
			})
			.on("fail", function(e) {
				console.log(e);
			});
	}
};
