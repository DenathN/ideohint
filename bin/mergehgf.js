#!/usr/bin/env node
var fs = require('fs');
var path = require('path');
var stream = require('stream');
var readline = require('readline');
var argv = require('yargs').argv;


var outStream = argv.o ? fs.createWriteStream(argv.o, { encoding: 'utf-8' }) : process.stdout;
var buf = {};
var nRead = 0;
var nTotal = 0
argv._.forEach(function(file){
	var d = fs.readFileSync(file, 'utf-8').trim().split('\n');
	for(var j = 0; j < d.length; j++) if(d[j].trim()){
		var data = JSON.parse(d[j].trim());
		nRead += 1;
		if(!buf[data[0]]) {
			buf[data[0]] = data[1];
			nTotal += 1;
		}
	}
});
var j = 0;
for(var k in buf) {
	outStream.write(JSON.stringify([k, buf[k], j]) + '\n');
	j += 1;
}
outStream.write('\n');
process.stderr.write(nRead + " records found; " + nTotal + " records after merging.\n");