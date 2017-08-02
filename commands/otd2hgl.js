"use strict";

var fs = require("fs");
var hashContours = require("../support/otdParser").hashContours;
var JSONStream = require("JSONStream");

exports.command = "otd2hgl";
exports.describe = "Prepare HGL file from OpenType Dump.";
exports.builder = function(yargs) {
	yargs.alias("o", "output-into").boolean(["all", "ideo-only"]);
};

exports.handler = function(argv) {
	var outstream = argv.o ? fs.createWriteStream(argv.o, { encoding: "utf-8" }) : process.stdout;

	if (!argv._[1]) return;

	var hasCmap = false;
	var keep = {};
	var selects = argv.select ? argv.select.split("").map(c => c.charCodeAt(0)) : null;

	getCMAPInfo();

	function getCMAPInfo() {
		var sParseCmap = JSONStream.parse(["cmap"]);
		var instream = fs.createReadStream(argv._[1], "utf-8");
		sParseCmap.on("data", function(cmap) {
			hasCmap = true;
			for (var k in cmap) {
				var code;
				if (k[0] == "U" && k[1] == "+") {
					// hex dump
					code = parseInt(k.slice(2), 16);
				} else {
					code = parseInt(k, 10);
				}

				if (selects) {
					if (selects.indexOf(code) >= 0) {
						keep[cmap[k]] = true;
					}
				} else if (argv["all"]) {
					keep[cmap[k]] = true;
				} else if (
					(code >= 0x2e80 && code <= 0x2fff) ||
					(code >= 0x3192 && code <= 0x319f) ||
					(code >= 0x3300 && code <= 0x9fff) ||
					(code >= 0xf900 && code <= 0xfa6f) ||
					(code >= 0x20000 && code <= 0x2ffff)
				) {
					keep[cmap[k]] = true;
				}
			}
		});
		sParseCmap.on("end", function() {
			getGSUBinfo();
		});
		instream.pipe(sParseCmap);
	}
	function getGSUBinfo() {
		var sParseCmap = JSONStream.parse(["GSUB"]);
		var instream = fs.createReadStream(argv._[1], "utf-8");
		sParseCmap.on("data", function(gsub) {
			let lookups = gsub.lookups;
			if (!lookups) return;
			for (let passes = 0; passes < 10; passes++) {
				for (let lid in lookups) {
					if (!lookups[lid]) continue;
					if (lookups[lid].type !== "gsub_single") continue;
					for (let subtable of lookups[lid].subtables) {
						for (let g in subtable)
							if (keep[g]) {
								keep[subtable[g]] = true;
							}
					}
				}
			}
		});
		sParseCmap.on("end", function() {
			mapGlyf();
		});
		instream.pipe(sParseCmap);
	}
	function mapGlyf() {
		var sParseGlyf = JSONStream.parse(["glyf", { emitKey: true }]);
		var instream = fs.createReadStream(argv._[1], "utf-8");
		sParseGlyf.on("data", function(data) {
			var k = data.key,
				glyph = data.value;
			if (!glyph.contours || !glyph.contours.length || (hasCmap && !keep[k])) return;
			var h = hashContours(glyph.contours);

			outstream.write(
				JSON.stringify({
					name: k,
					hash: h,
					contours: glyph.contours
				}) + "\n"
			);
			// outstream.write("\n");
			//outstream.write(JSON.stringify([k, h, glyph.contours]) + "\n");
		});
		sParseGlyf.on("end", function() {
			outstream.end();
		});
		instream.pipe(sParseGlyf);
	}
};
