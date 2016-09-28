"use strict"

var fs = require('fs');
var readline = require('readline');
var stream = require('stream');
var findStems = require('../findstem').findStems;
var extractFeature = require('../extractfeature').extractFeature;
var devnull = require('dev-null');
var util = require('util');

var parseOTD = require('../otdParser').parseOTD;

var crypto = require('crypto');
function md5(text) { return crypto.createHash('md5').update(text).digest('hex'); };

exports.command = "extract"
exports.describe = "Extract features from HGL."
exports.builder = function (yargs) {
	yargs.alias('o', 'output-into')
		.alias('?', 'help')
		.alias('p', 'parameters')
		.describe('help', 'Displays this help.')
		.describe('o', 'Output sfd path. When absent, the result sfd is written to STDOUT.')
		.describe('d', 'Only process dk+m\'th glyphs in the feature file. Combine with -m for parallel processing.')
		.describe('m', 'Only process dk+m\'th glyphs in the feature file. Combine with -d for parallel processing.')
		.describe('parameters', 'Specify parameter file (in TOML).');
}

exports.handler = function (argv) {
	var instream = argv._[1] ? fs.createReadStream(argv._[1]) : process.stdin;
	var outstream = argv.o ? fs.createWriteStream(argv.o, { encoding: 'utf-8' }) : process.stdout;

	var parameterFile = require('../paramfile').from(argv);
	var strategy = require('../strategy').from(argv, parameterFile);

	processHGL(argv, instream, outstream, strategy);
}

function processHGL(argv, instream, outstream, strategy) {
	var rl = readline.createInterface(instream, devnull());
	var divide = argv.d || 1;
	var modulo = argv.m || 0;
	var n = 0;
	var j = 0;
	rl.on('line', function (line) {
		if (n % divide === modulo % divide) {
			var data = JSON.parse(line);
			var glyphdata = extractFeature(findStems(parseOTD(data[2]), strategy), strategy);
			glyphdata.id = data[0];
			outstream.write(JSON.stringify([data[0], data[1], glyphdata, j]) + '\n');
			j++
		}
		n++;
	});
}