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

var crypto = require("crypto");
function md5 (text) {
	return crypto.createHash("md5").update(text).digest("hex");
}
function sanityDelta (z, d) {
	var deltas = d.filter((x) => x.delta);
	if (deltas.length) {
		return `YDelta(${z},${deltas.map((x)=>`${x.delta}@${x.ppem}`).join(',')})`;
	} else {
		return "";
	}
}
function decideDelta (source, dest, upm, ppem) {
	return {
		ppem: ppem,
		delta: Math.round((dest - source) / (upm / ppem))
	};
}
function talk (si, sd, strategy, cvt, padding, gid) {
	const upm = strategy.UPM;
	let buf = "";
	function talk (s) {buf += s + "\n";}
	// bottom
	for (let z of si.bottomBluePoints) {
		talk(`YAnchor(${z},${padding + 2})`);
	}
	for (let z of si.topBluePoints) {
		talk(`YAnchor(${z},${padding + 1})`);
		let deltas = [];
		for (let ppem = strategy.PPEM_MIN; ppem <= strategy.PPEM_MAX; ppem++) {
			let source = roundings.rtg(strategy.BLUEZONE_TOP_CENTER, upm, ppem);
			let vtop = roundings.rtg(strategy.BLUEZONE_BOTTOM_CENTER, upm, ppem)
			+ roundings.rtg(strategy.BLUEZONE_TOP_CENTER - strategy.BLUEZONE_BOTTOM_CENTER, upm, ppem);
			deltas.push(decideDelta(source, vtop, upm, ppem));
		}
		talk(sanityDelta(z, deltas));
	}
	for (var sid = 0; sid < si.stems.length; sid++) {
		let s = si.stems[sid];

		let deltaPos = [];
		let deltaADv = [];

		for (let ppem = strategy.PPEM_MIN; ppem <= strategy.PPEM_MAX; ppem++) {
			if (!sd[ppem]) continue;
			const [ytouch, wtouch] = sd[ppem][sid];
			if (s.posKeyAtTop) {
				const psrc = roundings.rtg(s.y0, upm, ppem);
				const pdst = roundings.rtg(ytouch * (upm / ppem), upm, ppem);
				deltaPos.push(decideDelta(psrc, pdst, upm, ppem));
				const wsrc = pdst - roundings.rtg1(s.w0, upm, ppem);
				const wdst = pdst - roundings.rtg1(wtouch * (upm / ppem), upm, ppem);
				deltaADv.push(decideDelta(wsrc, wdst, upm, ppem));
			} else {
				const psrc = roundings.rtg(s.y0 - s.w0, upm, ppem);
				const pdst = roundings.rtg((ytouch - wtouch) * (upm / ppem), upm, ppem);
				deltaPos.push(decideDelta(psrc, pdst, upm, ppem));
				const wsrc = pdst + roundings.rtg1(s.w0, upm, ppem);
				const wdst = pdst + roundings.rtg1(wtouch * (upm / ppem), upm, ppem);
				deltaADv.push(decideDelta(wsrc, wdst, upm, ppem));
			}
		}

		talk(`YAnchor(${s.posKey})`);
		talk(sanityDelta(s.posKey, deltaPos));
		talk(`YDist(${s.posKey},${s.advKey})`);
		talk(sanityDelta(s.advKey, deltaADv));
		let pk = s.posKey;
		for (let zp of s.posAlign) {
			talk(`YShift(${pk},${zp})`);
			pk = zp;
		}
		pk = s.advKey;
		for (let zp of s.advAlign) {
			talk(`YShift(${s.advKey},${zp})`);
			pk = zp;
		}
	}
	for (let c of si.ipsacalls) {
		if (c.length === 3) { // ip
			if (c[0] !== c[1]) talk(`YInterpolate(${c[0]},${c[2]},${c[1]})`);
		} else {
			talk(`YShift(${c[0]},${c[1]})`);
		}
	}
	talk("Smooth()");
	return buf;
}

exports.command = "makevtt";
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
	var linkCvt = cvtlib.createCvt([], strategy, cvtPadding);

	var activeInstructions = {};
	var gid = 0;
	rl.on("line", function (line) {
		if (!line) return;
		gid += 1;
		var data = JSON.parse(line.trim());
		activeInstructions[data[1]] = talk(data[2].si, data[2].sd, strategy, linkCvt, cvtPadding, gid);
	});

	rl.on("close", function () { pass_weaveOTD(activeInstructions); });

	function pass_weaveOTD (activeInstructions) {
		var otdPath = argv._[2] ? argv._[2] : argv._[1];
		process.stderr.write("Weaving OTD " + otdPath + "\n");
		var instream = fs.createReadStream(otdPath, "utf-8");
		var foundCVT = false;
		var gid = 0;
		var arr = [];
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
				if (glyph.contours && glyph.contours.length) {
					var hash = hashContours(glyph.contours);
					if (activeInstructions[hash]) {
						arr.push({gid, hash});
					}
				}
				glyph.instructions = [];
				gid += 1;
				return null;
			})
			.on("done", function (otd) {
				if (!foundCVT) {
					otd.cvt_ = cvtlib.createCvt([], strategy, cvtPadding);
				}
				otd.fpgm = [];
				otd.prep = [];

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
								<talk>${activeInstructions[hash]}</talk>
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
				console.log(`${cvtPadding + 1} : ${strategy.BLUEZONE_TOP_CENTER}`);
				console.log(`${cvtPadding + 2} : ${strategy.BLUEZONE_BOTTOM_CENTER}`);
				console.log(`And then import thr XML ${argv.o} to it.`);
			});
	}
};
