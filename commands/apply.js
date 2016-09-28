"use strict"

var fs = require('fs');
var readline = require('readline');
var stream = require('stream');
var devnull = require('dev-null');
var util = require('util');
var stripBom = require('strip-bom');
var JSONStream = require('JSONStream');
var es = require('event-stream');
var oboe = require('oboe');
var instruct = require('../instructor').instruct;

var cvtlib = require('../cvt');

var hashContours = require('../otdParser').hashContours;

var crypto = require('crypto');
function md5(text) {
	return crypto.createHash('md5').update(text).digest('hex');
};


exports.command = "apply";
exports.describe = "Apply hints to font dump.";
exports.builder = function (yargs) {
	return yargs.alias('o', 'output-into')
		.alias('?', 'help')
		.alias('p', 'parameters')
		.describe('help', 'Displays this help.')
		.describe('o', 'Output sfd path. When absent, the result sfd is written to STDOUT.')
		.describe('parameters', 'Specify parameter file (in TOML).')
		.describe('CVT_PADDING', 'Specify CVT Padding.');
}
exports.handler = function (argv) {

	var hgiStream = argv._[2] ? fs.createReadStream(argv._[1], 'utf-8') : process.stdin;
	var rl = readline.createInterface(hgiStream, devnull());
	var parameterFile = require('../paramfile').from(argv);
	var strategy = require('../strategy').from(argv, parameterFile);

	var cvtPadding = cvtlib.getPadding(argv, parameterFile);
	var linkCvt = cvtlib.createCvt([], strategy, cvtPadding);

	var activeInstructions = {};

	rl.on('line', function (line) {
		if (!line) return;
		var data = JSON.parse(line.trim());
		activeInstructions[data[1]] = instruct(data[2].si, data[2].sd, strategy, linkCvt, cvtPadding);
	});
	rl.on('close', function () { pass_weaveOTD(activeInstructions); });


	function pass_weaveOTD(activeInstructions) {
		var otdPath = argv._[2] ? argv._[2] : argv._[1];
		process.stderr.write("Weaving OTD " + otdPath + '\n');
		var instream = fs.createReadStream(otdPath, 'utf-8');
		var foundCVT = false;

		oboe(instream)
			.on('node', 'cvt_', function (cvt) {
				foundCVT = true;
				return cvtlib.createCvt(cvt, strategy, cvtPadding);
			})
			.on('node', 'maxp', function (maxp) {
				if (maxp.maxStackElements < strategy.STACK_DEPTH + 20) {
					maxp.maxStackElements = strategy.STACK_DEPTH + 20
				}
				return maxp;
			})
			.on('node', 'glyf.*', function (glyph, path) {
				if (!glyph.contours || !glyph.contours.length) return glyph;
				var hash = hashContours(glyph.contours);
				if (!argv.just_modify_cvt && activeInstructions[hash]) {
					glyph.instructions = activeInstructions[hash];
				}
				return glyph;
			})
			.on('done', function (otd) {
				if (!foundCVT) {
					otd.cvt_ = cvtlib.createCvt([], strategy, cvtPadding);
				}
				var outStream = argv.o ? fs.createWriteStream(argv.o, { encoding: 'utf-8' }) : process.stdout;
				es.readable(function (count, next) {
					for (var k in otd) {
						this.emit('data', [k, otd[k]]);
					}
					this.emit('end');
					next()
				}).pipe(JSONStream.stringifyObject()).pipe(outStream);
			});
	}
}