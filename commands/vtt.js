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

const GREEN = "\x1b[92m";
const RESTORE = "\x1b[39;49m";
const ROUNDING_SEGMENTS = 16;
const ROUNDING_CUTOFF = 1 / 2 - 1 / 32;
const HALF_PIXEL_PPEM = 20;

function md5(text) {
	return crypto.createHash("md5").update(text).digest("hex");
}
function formatdelta(delta) {
	let u = Math.round(delta * ROUNDING_SEGMENTS);
	let d = ROUNDING_SEGMENTS;
	while (!(u % 2) && !(d % 2) && d > 1) { u /= 2, d /= 2; }
	if (d > 1) {
		return u + "/" + d;
	} else {
		return "" + u;
	}
}
function sanityDelta(z, d) {
	var deltas = d.filter((x) => x.delta);
	if (!deltas.length) return "";
	let buf = [];
	let ppemstart = 0, ppemend = 0;
	let curdelta = 0;
	for (let x of deltas) {
		if (x.ppem === ppemend + 1 && x.delta === curdelta) {
			ppemend += 1;
		} else {
			if (curdelta) buf.push(formatdelta(curdelta) + "@" + (ppemend > ppemstart ? ppemstart + ".." + ppemend : ppemstart));
			ppemstart = ppemend = x.ppem;
			curdelta = x.delta;
		}
	}
	if (curdelta) buf.push(formatdelta(curdelta) + "@" + (ppemend > ppemstart ? ppemstart + ".." + ppemend : ppemstart));
	return `YDelta(${z},${buf.join(',')})`;
}
function decideDelta(source, dest, upm, ppem) {
	let delta = Math.round(ROUNDING_SEGMENTS * (dest - source) / (upm / ppem));
	return {
		ppem: ppem,
		delta: delta / ROUNDING_SEGMENTS
	};
}
function decideDeltaShift(base, sign, source, dest, isStrict, isStacked, upm, ppem) {
	// source : original stroke width
	// dest : desired stroke width
	const y1 = base + sign * source;
	const y2 = base + sign * dest;
	const rounding = (sign > 0) === (source < dest) ? Math.floor : Math.ceil;
	// delta needed for rounding
	let actualDelta = rounding(ROUNDING_SEGMENTS * (y2 - y1) / (upm / ppem));
	// We will try to shrink collided strokes to zero
	let shrunkDelta = isStacked ? rounding(ROUNDING_SEGMENTS * (base - y1) / (upm / ppem)) : 0;
	let delta = actualDelta - shrunkDelta;
	while (!(source < dest && dest <= (1 + 1 / 16) * (upm / ppem) && !isStacked) && delta) {
		const delta1 = (delta > 0 ? delta - 1 : delta + 1);
		const y2a = y1 + (delta1 + shrunkDelta) * (upm / ppem / ROUNDING_SEGMENTS);
		if (roundings.rtg(y2, upm, ppem) !== roundings.rtg(y2a, upm, ppem)
			|| Math.abs(y2a - roundings.rtg(y2, upm, ppem)) > ROUNDING_CUTOFF * (upm / ppem)
			|| (source > dest)
			&& Math.abs(y2a - roundings.rtg(y2, upm, ppem)) > (1 / 2) * (upm / ppem) * (ppem / HALF_PIXEL_PPEM)
			|| (isStrict && (Math.abs(y2 - base - (y2a - base)) > (upm / ppem) * (3 / 16)))) break;
		delta = delta1;
	}
	return {
		ppem: ppem,
		delta: (shrunkDelta + delta) / ROUNDING_SEGMENTS
	};
}
function talk(si, sd, strategy, cvt, padding, gid) {
	const upm = strategy.UPM;
	let buf = "";
	function talk(s) { buf += s + "\n"; }
	// bottom
	for (let z of si.bottomBluePoints) {
		talk(`YAnchor(${z},${padding + 2})`);
	}
	// top
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
			const [ytouch, wtouch, isStrict, isStacked] = sd[ppem][sid];
			if (s.posKeyAtTop) {
				const psrc = roundings.rtg(s.y0, upm, ppem);
				const pdst = roundings.rtg(ytouch * (upm / ppem), upm, ppem);
				const posdelta = decideDelta(psrc, pdst, upm, ppem);
				deltaPos.push(posdelta);
				const wsrc = s.w0;
				const wdst = wtouch * (upm / ppem);
				deltaADv.push(decideDeltaShift(
					pdst + posdelta.delta * (upm / ppem), -1,
					wsrc, wdst,
					isStrict, isStacked,
					upm, ppem));
			} else {
				const psrc = roundings.rtg(s.y0 - s.w0, upm, ppem);
				const pdst = roundings.rtg((ytouch - wtouch) * (upm / ppem), upm, ppem);
				const posdelta = decideDelta(psrc, pdst, upm, ppem);
				deltaPos.push(posdelta);
				const wsrc = s.w0;
				const wdst = wtouch * (upm / ppem);
				deltaADv.push(decideDeltaShift(
					pdst + posdelta.delta * (upm / ppem), 1,
					wsrc, wdst,
					isStrict, isStacked,
					upm, ppem));
			}
		}

		talk(`YAnchor(${s.posKey})`);
		talk(sanityDelta(s.posKey, deltaPos));
		talk(`YNoRound(${s.advKey})`);
		talk(`YDist(${s.posKey},${s.advKey})`);
		talk(sanityDelta(s.advKey, deltaADv));
		let pk = s.posKey;
		for (let zp of s.posAlign) {
			talk(`YShift(${pk},${zp})`);
		}
		pk = s.advKey;
		for (let zp of s.advAlign) {
			talk(`YShift(${s.advKey},${zp})`);
		}
	}
	var l = 0;
	for (let j = 1; j < si.ipsacalls.length; j++) {
		if (
			si.ipsacalls[l].length > 2
			&& si.ipsacalls[l].length < 16
			&& si.ipsacalls[j].length > 2
			&& si.ipsacalls[l][0] === si.ipsacalls[j][0]
			&& si.ipsacalls[l][1] === si.ipsacalls[j][1]) {
			si.ipsacalls[l].push(si.ipsacalls[j][2]);
			si.ipsacalls[j] = null;
		} else {
			l = j;
		}
	}
	for (let c of si.ipsacalls) {
		if (!c) continue;
		if (c.length >= 3) { // ip
			if (c[0] !== c[1]) talk(`YInterpolate(${c[0]},${c.slice(2).join(',')},${c[1]})`);
		} else {
			talk(`YShift(${c[0]},${c[1]})`);
		}
	}
	talk("Smooth()");
	return buf;
}

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

	function pass_weaveOTD(activeInstructions) {
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
						arr.push({ gid, hash });
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
