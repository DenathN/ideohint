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

	var hgiStream = argv._[2] ? fs.createReadStream(argv._[1]) : process.stdin;

	var parameterFile = require('../paramfile').from(argv);
	var strategy = require('../strategy').from(argv, parameterFile);
	var cvtlib = require('../cvt');
	var cvt = cvtlib.createCvt([], strategy, cvtlib.getPadding(argv, parameterFile))

	var buf = '';
	hgiStream.on('data', function (d) { buf += d });
	hgiStream.on('end', function () {
		var a = buf.trim().split('\n').map(function (l) { return JSON.parse(l.trim()); })
		var activeInstructions = {};
		for (var j = 0; j < a.length; j++) activeInstructions[a[j][1]] = a[j][2];

		var format = argv.format || 'hgl';
		var formatMap = {
			sfd: pass_weaveSFD,
			otd: pass_weaveOTD,
			hgl: pass_weaveOTD
		}
		formatMap[format](activeInstructions);
	});

	if (argv.subpattern) { var pattern = new RegExp(argv.subpattern, argv.subflag || ''); var replacement = argv.subreplacement }

	function pass_weaveSFD(activeInstructions) {
		var sfdStream = argv._[2] ? fs.createReadStream(argv._[2]) : fs.createReadStream(argv._[1]);
		var outStream = argv.o ? fs.createWriteStream(argv.o, { encoding: 'utf-8' }) : process.stdout;
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
		var otdPath = argv._[2] ? argv._[2] : argv._[1];
		var instream = fs.createReadStream(otdPath, 'utf-8');
		var foundCVT = false;
		oboe(instream)
			.on('node', 'cvt_', function (cvt) {
				foundCVT = true;
				return cvtlib.createCvt(cvt, strategy, cvtlib.getPadding(argv, parameterFile));
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
					glyph.instructions = activeInstructions[hash].split('\n');
				}
				return glyph;
			})
			.on('done', function (otd) {
				if (!foundCVT) {
					otd.cvt_ = cvtlib.createCvt([], strategy, cvtlib.getPadding(argv, parameterFile));
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