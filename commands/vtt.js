"use strict";

var fs = require("fs");
var readline = require("readline");
var stream = require("stream");
var devnull = require("dev-null");
var util = require("util");
var stripBom = require("strip-bom");
var JSONStream = require("JSONStream");
var es = require("event-stream");
var oboe = require("oboe");
var instruct = require("../instructor").instruct;

var cvtlib = require("../instructor/cvt");
var roundings = require("../roundings");
var hashContours = require("../otdParser").hashContours;
var talk = require('../instructor/vtttalk').talk;

const GREEN = "\x1b[92m";
const RESTORE = "\x1b[39;49m";

exports.command = "vtt";
exports.describe = "Create VTTTalk file.";
exports.builder = function (yargs) {
	return yargs.alias("o", "output-into")
		.alias("?", "help")
		.alias("p", "parameters")
		.describe("help", "Displays this help.")
		.describe("o", "Output XML file path.")
		.describe("parameters", "Specify parameter file (in TOML).")
		.describe("CVT_PADDING", "Specify CVT Padding.");
};
exports.handler = function (argv) {
	var hgiStream = argv._[2] ? fs.createReadStream(argv._[1], "utf-8") : process.stdin;
	var rl = readline.createInterface(hgiStream, devnull());
	var parameterFile = require("../paramfile").from(argv);
	var strategy = require("../strategy").from(argv, parameterFile);

	var cvtPadding = cvtlib.getPadding(argv, parameterFile);

	var activeInstructions = {};
	var gid = 0;
	rl.on("line", function (line) {
		if (!line) return;
		gid += 1;
		var data = JSON.parse(line.trim());
		activeInstructions[data[1]] = talk(data[2].si, data[2].sd, strategy, cvtPadding);
	});

	rl.on("close", function () { pass_weaveOTD(activeInstructions); });

	function pass_weaveOTD(activeInstructions) {
		var otdPath = argv._[2] ? argv._[2] : argv._[1];
		process.stderr.write("Weaving OTD " + otdPath + "\n");
		var instream = fs.createReadStream(otdPath, "utf-8");
		var foundCVT = false;
		var gid = 0;
		var arr = [];
		oboe(instream)
			.on("node", "glyf.*", function (glyph, path) {
				if (glyph.contours && glyph.contours.length) {
					var hash = hashContours(glyph.contours);
					if (activeInstructions[hash]) {
						arr.push({ gid, hash });
					}
				}
				glyph.instructions = [];
				gid += 1;
				return null;
			})
			.on("done", function (otd) {
				let controlStream = fs.createWriteStream(argv.o, { encoding: "utf-8" });
				controlStream.write(`<?xml version="1.0" encoding="UTF-8"?>
						<ttFont ttVttLibVersion="1.0">
						<glyf>
					`);
				let buffer = "";
				for (let {gid, hash} of arr) {
					buffer += (`
						<TTGlyph ID="${gid}">
							<instructions>
								<talk>
								${activeInstructions[hash]}
								</talk>
							</instructions>
						</TTGlyph>`);
					if (buffer.length > 0x20000) {
						controlStream.write(buffer);
						buffer = "";
					}
				}
				controlStream.write(buffer);
				controlStream.write(`  </glyf></ttFont>`);
				console.log("Please assign these CVT items in Visual TrueType:");
				console.log("/* ----------------------- */");
				console.log(`${GREEN}${cvtPadding + 1} : ${strategy.BLUEZONE_TOP_CENTER} /* BLUEZONE_TOP_CENTER */${RESTORE}`);
				console.log(`${GREEN}${cvtPadding + 2} : ${strategy.BLUEZONE_BOTTOM_CENTER} /* BLUEZONE_BOTTOM_CENTER */ ${RESTORE}`);
				console.log("/* ---------------------- */");
				console.log(`And then import '${argv.o}' to it.`);
			});
	}
};
