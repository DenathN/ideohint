#!/usr/bin/env node
var fs = require('fs');
var path = require('path');
var stream = require('stream');
var readline = require('readline');
var argv = require('yargs').argv;


var outStream = argv.o ? fs.createWriteStream(argv.o, { encoding: 'utf-8' }) : process.stdout;
var result = []
argv._.forEach(function(file){ 
	result = result.concat(JSON.parse(fs.readFileSync(file, 'utf-8')))
})
outStream.write(JSON.stringify(result));