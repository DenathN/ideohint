#!/usr/bin/env node
var fs = require('fs');
var readline = require('readline');
var stream = require('stream');
var devnull = require('dev-null');
var colors = require('colors');
var util = require('util');
var JSONStream = require('JSONStream');
var es = require('event-stream');
var stripBom = require('strip-bom');
var hashContours = require('../otdParser').hashContours;

var crypto = require('crypto');
function md5(text) {
	return crypto.createHash('md5').update(text).digest('hex');
};


var yargs = require('yargs')
	.alias('o', 'output-into')
	.alias('?', 'help')
	.alias('silent', 'quiet')
	.alias('verbose', 'v')
	.boolean(['just_modify_cvt', 'silent', 'verbose'])
	.usage('$0 [Options] [instructions.hgi] [<input.sfd>] [-o <output.sfd>]\n\
	       |Apply Instructions to .sfd file\n\
	       |'.replace(/^\s*\|/gm, ''))
	.describe('help', 'Displays this help.')
	.describe('o', 'Output sfd path. When absent, the result sfd is written to STDOUT.')
	.describe('UPM', 'Specify the units-per-em (upm) value for the input. Default: 1000.')
	.describe('PPEM_MIN', 'Disable gridfits below this PPEM value. Default: 10.')
	.describe('PPEM_MAX', 'Disable gridfits above this PPEM value. Default: 36.')
	.describe('MIN_STEM_WIDTH', 'Specify the min width of horizontal strokes. Default: 20.')
	.describe('MAX_STEM_WIDTH', 'Specify the max width of horizontal strokes. Default: 100.')
	.describe('MOST_COMMON_STEM_WIDTH', 'Specify the most common width of horizontal strokes. Default: 65.')
	.describe('gears', 'Specify how wide for strokes under each ppem in pixels. Format: [[ppem1,commonwidth1,minwidth1],[ppem2,commonwidth2,minwidth2],...]')
	.describe('silent', 'Run in quiet mode')
	.describe('verbose', 'Run in verbose mode')
	.describe('just_modify_cvt', 'Don\'t change any glyph\'s Truetype insructions, just append items necessary into the cvt table.')

var argv = yargs.argv;

if (argv.help) { yargs.showHelp(), process.exit(0) }

var hgiStream = argv._[1] ? fs.createReadStream(argv._[0]) : process.stdin;
var outStream = argv.o ? fs.createWriteStream(argv.o, { encoding: 'utf-8' }) : process.stdout;

var parameterFile = require('../paramfile').from(argv);
var strategy = require('../strategy').from(argv, parameterFile);
var cvtlib = require('../cvt');
var cvt = cvtlib.createCvt([], strategy, cvtlib.getPadding(argv, parameterFile))

var buf = '';
hgiStream.on('data', function (d) { buf += d });
hgiStream.on('end', function () {
	var a = JSON.parse(stripBom(buf));
	var activeInstructions = {};
	for (var j = 0; j < a.length; j++) activeInstructions[a[j][1]] = a[j][2];

	var format = argv.format || 'sfd';
	var formatMap = {
		sfd: pass_weaveSFD,
		otd: pass_weaveOTD
	}
	formatMap[format](activeInstructions);
});

if (argv.subpattern) { var pattern = new RegExp(argv.subpattern, argv.subflag || ''); var replacement = argv.subreplacement }

function pass_weaveSFD(activeInstructions) {
	var sfdStream = argv._[1] ? fs.createReadStream(argv._[1]) : fs.createReadStream(argv._[0]);
	var rl = readline.createInterface(sfdStream, devnull());

	process.stderr.write('WEAVE: Start weaving ' + (argv.o || '(stdout)') + '\n')
	process.stderr.write('WEAVE: ' + (Object.keys(activeInstructions).length) + ' Active hinting records : ' + Object.keys(activeInstructions).slice(0, 3) + '...' + '\n')

	var nGlyphs = 0;
	var nApplied = 0;
	var buf = '';

	var curChar = null;
	var readingSpline = false;
	var readingTT = false;
	var sourceCvt = '';
	var readingCvt = false;
	rl.on('line', function (line) {
		line = line.replace(/\r$/, '');

		if (/^ShortTable: cvt /.test(line)) {
			sourceCvt += line + "\n";
			readingCvt = true;
			return;
		} else if (readingCvt) {
			sourceCvt += line + "\n";
			if (/^EndShort/.test(line)) {
				readingCvt = false;
				var oldCvt = sourceCvt.trim().split('\n').slice(1, -1).map(function (x) { return x.trim() - 0 });
				cvt = cvtlib.createCvt(oldCvt, strategy, cvtlib.getPadding(argv, parameterFile));
				if (argv.dump_cvt) {
					fs.writeFileSync(argv.dump_cvt, JSON.stringify({ cvt: cvt }), 'utf-8')
				}
			};
			return;
		} else if (/^StartChar:/.test(line)) {
			curChar = { input: '', id: line.split(' ')[1] }
		} else if (/^SplineSet/.test(line)) {
			readingSpline = true;
		} else if (/^EndSplineSet/.test(line)) {
			readingSpline = false;
		} else if (curChar && readingSpline) {
			curChar.input += line + '\n';
		} else if (/^EndChar/.test(line)) {
			if (curChar) {
				var hash = md5(curChar.input);
				if (!argv.just_modify_cvt && activeInstructions[hash]) {
					nApplied += 1;
					buf += "TtInstrs:\n" + activeInstructions[hash] + "\nEndTTInstrs\n";
				}
				nGlyphs += 1;
			};
			curChar = null;
		} else if (/^BeginChars:/.test(line)) {
			buf += 'ShortTable: cvt  ' + cvt.length + '\n' + cvt.join('\n') + '\nEndShort\n'
		};

		if (pattern) line = line.replace(pattern, replacement);

		buf += line + '\n';
		if (buf.length >= 4096) {
			outStream.write(buf);
			buf = '';
		}
	});

	rl.on('close', function () {
		process.stderr.write('WEAVE: ' + nGlyphs + ' glyphs processed; ' + nApplied + ' glyphs applied hint.\n');
		if (buf) outStream.write(buf);
		outStream.end();
	});
}

function pass_weaveOTD(activeInstructions) {
	var otdPath = argv._[1] ? argv._[1] : argv._[0];
	var otd = JSON.parse(fs.readFileSync(otdPath, 'utf-8'));
	if (otd.cvt_) {
		otd.cvt_ = cvtlib.createCvt(otd.cvt_, strategy, cvtlib.getPadding(argv, parameterFile));
	} else {
		otd.cvt_ = cvtlib.createCvt([], strategy, cvtlib.getPadding(argv, parameterFile));
	}
	if (otd.maxp && otd.maxp.maxStackElements < strategy.STACK_DEPTH + 10) {
		otd.maxp.maxStackElements = strategy.STACK_DEPTH + 10;
	}
	for (var k in otd.glyf) {
		var glyph = otd.glyf[k];
		if (!glyph.contours || !glyph.contours.length) continue;
		var hash = hashContours(glyph.contours);
		if (!argv.just_modify_cvt && activeInstructions[hash]) {
			glyph.instructions = activeInstructions[hash].split('\n');
		}
	}
	outStream.write(JSON.stringify(otd));
	outStream.end();
}