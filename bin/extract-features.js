#!/usr/bin/env node
var fs = require('fs');
var readline = require('readline');
var stream = require('stream');
var findStems = require('../findstem').findStems;
var extractFeature = require('../extractfeature').extractFeature;
var devnull = require('dev-null');
var util = require('util');

var parseSFD = require('../sfdParser').parseSFD;
var parseOTD = require('../otdParser').parseOTD;

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
	.usage('$0 [Options] [<input.sfd>] [-o <output.hgf>]\n\
	       |Extract features form the input SFD file.\n\
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

var argv = yargs.argv;
var format = argv.format || 'sfd';

if (argv.help) {
	yargs.showHelp();
	process.exit(0)
}

var instream = argv._[0] ? fs.createReadStream(argv._[0]) : process.stdin;
var outstream = argv.o ? fs.createWriteStream(argv.o, { encoding: 'utf-8' }) : process.stdout;

var parameterFile = require('../paramfile').from(argv);
var strategy = require('../strategy').from(argv, parameterFile);

var formatMap = {
	sfd: processSFD,
	otd: processOTD
}
formatMap[format]();

function processSFD() {
	var rl = readline.createInterface(instream, devnull());
	var buf = '';
	var started = false;

	var curChar = null;
	var readingSpline = false;

	var divide = argv.d || 1;
	var modulo = argv.m || 0;
	var n = 0;
	var j = 0;

	rl.on('line', function (line) {
		if (/^StartChar:/.test(line)) {
			curChar = { input: '', id: line.split(' ')[1] }
		} else if (/^SplineSet/.test(line)) {
			readingSpline = true;
		} else if (/^EndSplineSet/.test(line)) {
			readingSpline = false;
		} else if (curChar && readingSpline) {
			curChar.input += line + '\n';
		} else if (/^EndChar/.test(line)) {
			if (curChar) {
				if (n % divide === modulo) {
					var hash = md5(curChar.input);
					var glyphdata = extractFeature(findStems(parseSFD(curChar.input), strategy), strategy);
					glyphdata.id = curChar.id;
					buf += JSON.stringify([curChar.id, hash, glyphdata, j]) + '\n';
					j += 1;
					started = true;
				}
				n += 1;
			};
			curChar = null;
		};
		if (buf.length >= 16384) {
			outstream.write(buf);
			buf = '';
		}
	});

	rl.on('close', function () {
		outstream.write(buf + '\n')
	});
}

function processOTD() {
	var rl = readline.createInterface(instream, devnull());
	var divide = argv.d || 1;
	var modulo = argv.m || 0;
	var n = 0;
	var j = 0;
	rl.on('line', function (line) {
		if (n % divide === modulo) {
			var data = JSON.parse(line);
			var glyphdata = extractFeature(findStems(parseOTD(data[2]), strategy), strategy);
			glyphdata.id = data[0];
			outstream.write(JSON.stringify([data[0], data[1], glyphdata, j]) + '\n');
			j++
		}
		n++;
	});
}