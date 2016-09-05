"use strict"

var fs = require('fs');
var hashContours = require('../otdParser').hashContours;

exports.command = "otd2hgl"
exports.describe = "Prepare HGL file from OpenType Dump."
exports.builder = function (yargs) {
	yargs.alias('o', 'output-into')
		.boolean(['ideo-only'])
}

exports.handler = function (argv) {
	var outstream = argv.o ? fs.createWriteStream(argv.o, { encoding: 'utf-8' }) : process.stdout;

	if (argv._[1]) {
		var otd = JSON.parse(fs.readFileSync(argv._[1], 'utf-8'));
		var glyf = otd.glyf;
		var cmap = otd.cmap;
		var onlyhan = false;
		var keep = {};
		if (argv['ideo-only']) {
			onlyhan = true;
			for (var k in cmap) {
				var code = k - 0;
				if (code >= 0x2E80 && code <= 0x2FFF
					|| code >= 0x3192 && code <= 0x319F
					|| code >= 0x3220 && code <= 0x324F
					|| code >= 0x3300 && code <= 0x9FFF
					|| code >= 0xF900 && code <= 0xfa6F
					|| code >= 0x20000 && code <= 0x2FFFF) {
					keep[cmap[k]] = true;
				}
			}
		}
		for (var k in glyf) {
			var glyph = glyf[k];
			if (!glyph.contours || !glyph.contours.length || (onlyhan && !keep[k])) continue;
			var h = hashContours(glyph.contours);
			outstream.write(JSON.stringify([k, h, glyph.contours]) + '\n');
		}
	}

	outstream.end();
}