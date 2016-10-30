"use strict";

var fs = require("fs");
var hashContours = require("../otdParser").hashContours;
var JSONStream = require("JSONStream");

exports.command = "otd2hgl";
exports.describe = "Prepare HGL file from OpenType Dump.";
exports.builder = function (yargs) {
	yargs.alias("o", "output-into")
		.boolean(["ideo-only"]);
};

exports.handler = function (argv) {
	var outstream = argv.o ? fs.createWriteStream(argv.o, { encoding: "utf-8" }) : process.stdout;

	if (!argv._[1]) return;

	var onlyhan = false;
	var keep = {};
	getCMAPInfo();
	function getCMAPInfo() {
		var sParseCmap = JSONStream.parse(["cmap"]);
		var instream = fs.createReadStream(argv._[1], "utf-8");
		sParseCmap.on("data", function (cmap) {
			onlyhan = true;
			for (var k in cmap) {
				var code;
				if (k[0] == "U" && k[1] == "+") {
					// hex dump
					code = parseInt(k.slice(2), 16);
				} else {
					code = parseInt(k, 10);
				}
				if (code >= 0x2E80 && code <= 0x2FFF
					|| code >= 0x3192 && code <= 0x319F
					|| code >= 0x3300 && code <= 0x9FFF
					|| code >= 0xF900 && code <= 0xfa6F
					|| code >= 0x20000 && code <= 0x2FFFF) {
					keep[cmap[k]] = true;
				}
			}
		});
		sParseCmap.on("end", function () {
			mapGlyf();
		});
		instream.pipe(sParseCmap);
	}
	function mapGlyf() {
		var sParseGlyf = JSONStream.parse(["glyf", { emitKey: true }]);
		var instream = fs.createReadStream(argv._[1], "utf-8");
		sParseGlyf.on("data", function (data) {
			var k = data.key, glyph = data.value;
			if (!glyph.contours || !glyph.contours.length || (onlyhan && !keep[k])) return;
			var h = hashContours(glyph.contours);
			outstream.write(JSON.stringify([k, h, glyph.contours]) + "\n");
		});
		sParseGlyf.on("end", function () {
			outstream.end();
		});
		instream.pipe(sParseGlyf);
	}
};
