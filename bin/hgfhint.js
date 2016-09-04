#!/usr/bin/env node
var fs = require('fs');
var readline = require('readline');
var stream = require('stream');
var util = require('util');
var devnull = require('dev-null');

var hint = require('../hinter').hint;
var instruct = require('../instructor').instruct;

var yargs = require('yargs')
	.alias('o', 'output-into')
	.alias('?', 'help')
	.alias('silent', 'quiet')
	.alias('verbose', 'v')
	.boolean(['just_modify_cvt', 'silent', 'verbose'])
	.usage('$0 [Options] [<input.hgf>] [-o <output.hgi>]\n\
	       |Generate Gridfit Instructions from feature file.\n\
	       |The new gridfits are optimized for Han characters.\n\
	       |'.replace(/^\s*\|/gm, ''))
	.describe('help', 'Displays this help.')
	.describe('o', 'Output sfd path. When absent, the result sfd is written to STDOUT.')
	.describe('d', 'Only process dk+m\'th glyphs in the feature file. Combine with -m for parallel processing.')
	.describe('m', 'Only process dk+m\'th glyphs in the feature file. Combine with -d for parallel processing.')
	.describe('UPM', 'Specify the units-per-em (upm) value for the input. Default: 1000.')
	.describe('PPEM_MIN', 'Disable gridfits below this PPEM value. Default: 10.')
	.describe('PPEM_MAX', 'Disable gridfits above this PPEM value. Default: 36.')
	.describe('MIN_STEM_WIDTH', 'Specify the min width of horizontal strokes. Default: 20.')
	.describe('MAX_STEM_WIDTH', 'Specify the max width of horizontal strokes. Default: 100.')
	.describe('MOST_COMMON_STEM_WIDTH', 'Specify the most common width of horizontal strokes. Default: 65.')
	.describe('gears', 'Specify how wide for strokes under each ppem in pixels. Format: [[ppem1,commonwidth1,minwidth1],[ppem2,commonwidth2,minwidth2],...]')
	.describe('silent', 'Run in quiet mode, do not output progress.')
	.describe('verbose', 'Run in verbose mode.')

var argv = yargs.argv;

if(argv.help) {
	yargs.showHelp();
	process.exit(0)
}

var inStream = argv._[0] ? fs.createReadStream(argv._[0]): process.stdin;
var outStream = argv.o ? fs.createWriteStream(argv.o, { encoding: 'utf-8' }): process.stdout;
var rl = readline.createInterface(inStream, devnull());
var strategy = require('../strategy').from(argv);
var cvt = require('../cvt').from(argv, strategy);

var divide = argv.d || 1;
var modulo = argv.m || 0;

function pad(s, p, n){
	s = '' + s;
	while(s.length < n) s = p + s;
	return s;
}
function progressbar(u, len){
	var buf = '';
	for(var j = 1; j <= len; j++){
		buf += (j > u * len) ? ' ' : '#'
	}
	return buf;
}

var finished = false;
var pendings = [];
var ans = [];
var PROGRESS_LENGTH = 30;
function finish(){
	if(finished) return;
	finished = true;
	var currentProgress = progressbar(0, PROGRESS_LENGTH);
	for(var j = 0; j < pendings.length; j++) {
		var data = pendings[j];
		var pb = progressbar(j / pendings.length, PROGRESS_LENGTH);
		if(!argv.silent && pb !== currentProgress) {
			process.stderr.write('HGFHINT: Hinting [' +  pb + '](#' + pad(j, ' ', 5) + '/' + pad(pendings.length, ' ', 5) + ')' + ' of ' + (argv._[0] || '(stdin)') + ' ' + pad(modulo, '0', 3) + "d" + pad(divide, '0', 3) + '\n');
			currentProgress = pb;
		}
		var glyph = data[2];
		var stemActions = [];
		var nMDRPnr = 0, nMDRPr = 0;
		for(var ppem = strategy.PPEM_MIN; ppem < strategy.PPEM_MAX; ppem++){
			var actions = hint(glyph, ppem, strategy);
			for(var k = 0; k < actions.length; k++){
				if(actions[k].length === 4) {
					nMDRPnr += 1
				} else if(Math.round(actions[k][3]) === actions[k][4] && Math.abs(actions[k][3] - actions[k][4]) < 0.48){
					nMDRPr += 1
				}
			}
			stemActions[ppem] = actions;
		}
		ans.push([data[0], data[1], instruct(glyph, stemActions, strategy, cvt, argv.CVT_PADDING || 0, nMDRPnr > nMDRPr)]);
	};
	process.stderr.write('HGFHINT: Hinting [' +  progressbar(1, PROGRESS_LENGTH) + '](#' + pad(j, ' ', 5) + '/' + pad(pendings.length, ' ', 5) + ')' + ' of ' + (argv._[0] || '(stdin)') + ' ' + pad(modulo, '0', 3) + "d" + pad(divide, '0', 3) + '\n');
	outStream.write(JSON.stringify(ans));
}

var j = 0;
rl.on('line', function(line){
	if(j % divide === modulo) {
		var l = line.trim();
		if(l) pendings.push(JSON.parse(l));
	}
	j += 1;
});
rl.on('close', finish);