#!/usr/bin/env node
var fs = require('fs');
var yargs = require('yargs')
	.alias('o', 'output-into');
var hashContours = require('../otdParser').hashContours;

var argv = yargs.argv;
var outstream = argv.o ? fs.createWriteStream(argv.o, { encoding: 'utf-8' }) : process.stdout;

if (argv._[0]) {
	var glyf = JSON.parse(fs.readFileSync(argv._[0], 'utf-8')).glyf;
	for (var k in glyf) {
		var glyph = glyf[k];
		if (!glyph.contours || !glyph.contours.length) continue;
		var h = hashContours(glyph.contours);
		outstream.write(JSON.stringify([k, h, glyph.contours]) + '\n');
	}
}

outstream.end();