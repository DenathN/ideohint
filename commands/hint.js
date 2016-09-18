"use strict"

var fs = require('fs');
var readline = require('readline');
var stream = require('stream');
var util = require('util');
var devnull = require('dev-null');
var hint = require('../hinter').hint;
var instruct = require('../instructor').instruct;

exports.command = 'hint';
exports.describe = 'Hint a feature file (hgf).'
exports.builder = function (yargs) {
	return yargs.alias('o', 'output-into')
		.alias('?', 'help')
		.alias('p', 'parameters')
		.describe('help', 'Displays this help.')
		.describe('o', 'Output sfd path. When absent, the result sfd is written to STDOUT.')
		.describe('d', 'Only process dk+m\'th glyphs in the feature file. Combine with -m for parallel processing.')
		.describe('m', 'Only process dk+m\'th glyphs in the feature file. Combine with -d for parallel processing.')
		.describe('parameters', 'Specify parameter file (in TOML).')
		.describe('CVT_PADDING', 'Specify CVT Padding.');
}

exports.handler = function (argv) {

	if (argv.help) { yargs.showHelp(); process.exit(0) }

	var inStream = argv._[1] ? fs.createReadStream(argv._[1]) : process.stdin;
	var outStream = argv.o ? fs.createWriteStream(argv.o, { encoding: 'utf-8' }) : process.stdout;
	var rl = readline.createInterface(inStream, devnull());


	var parameterFile = require('../paramfile').from(argv);
	var strategy = require('../strategy').from(argv, parameterFile);
	var cvtlib = require('../cvt');
	var cvtPadding = cvtlib.getPadding(argv, parameterFile);
	var cvt = cvtlib.createCvt([], strategy, cvtlib.getPadding(argv, parameterFile))

	var divide = argv.d || 1;
	var modulo = argv.m || 0;

	function pad(s, p, n) {
		s = '' + s;
		while (s.length < n) s = p + s;
		return s;
	}
	function progressbar(u, len) {
		var buf = '';
		for (var j = 1; j <= len; j++) {
			buf += (j > u * len) ? ' ' : '#'
		}
		return buf;
	}

	var finished = false;
	var pendings = [];
	var PROGRESS_LENGTH = 30;

	function showProgressBar(currentProgress, j, n) {
		var pb = progressbar(j / n, PROGRESS_LENGTH);
		if (pb !== currentProgress) {
			process.stderr.write('HGFHINT: Hinting [' + pb + '](#' + pad(j, ' ', 5) + '/' + pad(n, ' ', 5) + ')' + ' of ' + (argv._[1] || '(stdin)') + ' ' + pad(modulo, '0', 3) + "d" + pad(divide, '0', 3) + '\n');
		};
		return pb;
	}

	function finish() {
		if (finished) return;
		finished = true;
		var currentProgress = progressbar(0, PROGRESS_LENGTH);
		for (var j = 0; j < pendings.length; j++) {
			var data = pendings[j];
			var glyph = data[2];
			var stemActions = [];
			var nMDRPnr = 0, nMDRPr = 0;
			for (var ppem = strategy.PPEM_MIN; ppem < strategy.PPEM_MAX; ppem++) {
				var actions = hint(glyph, ppem, strategy);
				for (var k = 0; k < actions.length; k++) {
					if (actions[k].length === 4) {
						nMDRPnr += 1
					} else if (Math.round(actions[k][3]) === actions[k][4] && Math.abs(actions[k][3] - actions[k][4]) < 0.48) {
						nMDRPr += 1
					}
				}
				stemActions[ppem] = actions;
			}
			currentProgress = showProgressBar(currentProgress, j, pendings.length);
			var exportGlyph = {
				bottomBluePoints: glyph.bottomBluePoints,
				topBluePoints: glyph.topBluePoints,
				interpolations: glyph.interpolations,
				shortAbsorptions: glyph.shortAbsorptions,
				stems: glyph.stems.map(function (s) {
					return {
						y0: s.yori,
						w0: s.width,
						posKeyAtTop: s.posKeyAtTop,
						posKey: s.posKey.id,
						advKey: s.advKey.id,
						posAlign: s.posAlign,
						advAlign: s.advAlign
					}
				})
			};
			var recordLine = [data[0], data[1], { si: exportGlyph, sd: stemActions }];
			outStream.write(JSON.stringify(recordLine) + '\n');
		};
		currentProgress = showProgressBar(currentProgress, j, pendings.length);
		if (process.stdout !== outStream) outStream.end();
	}

	var j = 0;
	rl.on('line', function (line) {
		if (j % divide === modulo % divide) {
			var l = line.trim();
			if (l) pendings.push(JSON.parse(l));
		}
		j += 1;
	});
	rl.on('close', finish);

}