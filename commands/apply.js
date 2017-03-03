"use strict";

var fs = require("fs");
var readline = require("readline");
var stream = require("stream");
var devnull = require("dev-null");
var util = require("util");
var stripBom = require("strip-bom");
var oboe = require("oboe");
var instruct = require("../instructor").instruct;
var stringifyToStream = require('../support/stringify-to-stream');
var cvtlib = require("../instructor/cvt");
var talk = require('../instructor/vtttalk').talk;

var hashContours = require("../otdParser").hashContours;

var crypto = require("crypto");
function md5(text) {
	return crypto.createHash("md5").update(text).digest("hex");
}


exports.command = "apply";
exports.describe = "Apply hints to font dump.";
exports.builder = function (yargs) {
	return yargs.alias("o", "output-into")
		.alias("?", "help")
		.alias("p", "parameters")
		.describe("help", "Displays this help.")
		.describe("o", "Output otd path. When absent, the result OTD will be written to STDOUT.")
		.describe("parameters", "Specify parameter file (in TOML).")
		.describe("CVT_PADDING", "Specify CVT Padding.");
};
exports.handler = function (argv) {
	var hgiStream = argv._[2] ? fs.createReadStream(argv._[1], "utf-8") : process.stdin;
	var rl = readline.createInterface(hgiStream, devnull());
	var parameterFile = require("../paramfile").from(argv);
	var strategy = require("../strategy").from(argv, parameterFile);

	var cvtPadding = cvtlib.getPadding(argv, parameterFile);
	var linkCvt = cvtlib.createCvt([], strategy, cvtPadding);

	var activeInstructions = {};
	var tsi = {};
	var glyfcor = {};

	rl.on("line", function (line) {
		if (!line) return;
		var data = JSON.parse(line.trim());
		activeInstructions[data[1]] = data[2];
	});
	rl.on("close", function () { pass_weaveOTD(activeInstructions); });

	function pass_weaveOTD(activeInstructions) {
		var otdPath = argv._[2] ? argv._[2] : argv._[1];
		process.stderr.write("Weaving OTD " + otdPath + "\n");
		var instream = fs.createReadStream(otdPath, "utf-8");
		var foundCVT = false;

		oboe(instream)
			.on("node", "cvt_", function (cvt) {
				foundCVT = true;
				return cvtlib.createCvt(cvt, strategy, cvtPadding);
			})
			.on("node", "maxp", function (maxp) {
				if (maxp.maxStackElements < strategy.STACK_DEPTH + 20) {
					maxp.maxStackElements = strategy.STACK_DEPTH + 20;
				}
				return maxp;
			})
			.on("node", "glyf.*", function (glyph, path) {
				if (!glyph.contours || !glyph.contours.length) return glyph;
				var hash = hashContours(glyph.contours);
				if (!argv.just_modify_cvt && activeInstructions[hash]) {
					let data = activeInstructions[hash];
					glyph.instructions = instruct(data, strategy, cvtPadding);
					glyfcor[path[path.length - 1]] = hash;
				}
				return glyph;
			})
			.on('node', "TSI_01.glyphs.*", function () { return "" })
			.on("done", function (otd) {
				if (!foundCVT) {
					otd.cvt_ = cvtlib.createCvt([], strategy, cvtPadding);
				}
				if (otd.TSI_23 && otd.TSI_23.glyphs) {
					if (!otd.TSI_23.glyphs) otd.TSI_23.glyphs = {};
					for (let k in otd.TSI_23.glyphs) {
						if (!otd.glyf[k] || !otd.glyf[k].contours || !glyfcor[k]) continue;
						let data = activeInstructions[glyfcor[k]];
						otd.TSI_23.glyphs[k] = talk(data, strategy, cvtPadding, false).replace(/\n/g, '\r'); // VTT uses single CR, very strange.
					}
				}
				if (otd.TSI_01 && otd.TSI_01.extra && otd.TSI_01.extra.cvt) {
					otd.TSI_01.extra.cvt = otd.TSI_01.extra.cvt
						.replace(new RegExp(`${cvtPadding + 1}` + '\\s*:\\s*-?\\d+'), '')
						.replace(new RegExp(`${cvtPadding + 2}` + '\\s*:\\s*-?\\d+'), '')
						+ `${cvtPadding + 1} : ${strategy.BLUEZONE_TOP_CENTER}`
						+ '\n'
						+ `${cvtPadding + 2} : ${strategy.BLUEZONE_BOTTOM_CENTER}`
				}
				var outStream = argv.o ? fs.createWriteStream(argv.o, { encoding: "utf-8" }) : process.stdout;
				stringifyToStream(otd, outStream, outStream === process.stdout)();
			})
			.on("fail", function (e) {
				console.log(e)
			});
	}
};
