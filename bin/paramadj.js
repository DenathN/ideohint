#!/usr/bin/env node
var fs = require('fs');
var readline = require('readline');
var stream = require('stream');
var devnull = require('dev-null');
var yargs = require('yargs');
var nodeStatic = require("node-static");
var argv = yargs.argv;

var strategy = require('../strategy').from(argv);
var defaultStrategy = require('../strategy').defaultStrategy;

var instream = fs.createReadStream(argv._[0]);
var w = argv.w || "我能吞下玻璃而不伤身体";
var matches = [];
var rl = readline.createInterface(instream, devnull());

var started = false;

var curChar = null;
var readingSpline = false;

rl.on('line', function(line) {

	if(/^StartChar:/.test(line)) {
		curChar = { input: '', id: line.split(' ')[1] }
	} else if(curChar && /^Encoding:/.test(line)){
		curChar.encoding = line.split(' ')[2] - 0;
	} else if(/^SplineSet/.test(line)) {
		readingSpline = true;
	} else if(/^EndSplineSet/.test(line)) {
		readingSpline = false;
	} else if(curChar && readingSpline) {
		curChar.input += line + '\n';
	} else if(/^EndChar/.test(line)) {
		if(curChar && curChar.encoding) {
			for(var k = 0; k < w.length; k++) if(curChar.encoding === w.charCodeAt(k)){
				matches[k] = 'SplineSet\n' + curChar.input + '\nEndSplineSet';
			}
		};
		curChar = null;
	};
});

var fileServer = new nodeStatic.Server(require('path').resolve(__dirname, "../previewer"));

rl.on('close', function() {
	var port = process.env.PORT || 9527;
	// Start a web server which displays an user interface for parameter adjustment
	require('http').createServer(function(request, response){
		request.addListener("end", function(){
			if(request.url === "/characters.json") {
				response.setHeader("Content-Type", "application/json;charset=UTF-8");
				response.end(JSON.stringify(matches));
			} else if(request.url === "/strategy.json") {
				response.setHeader("Content-Type", "application/json;charset=UTF-8");
				response.end(JSON.stringify({
					start: strategy,
					default: defaultStrategy
				}));
			} else {
				fileServer.serve(request, response);
			}
		}).resume();
	}).listen(port);
	console.log("Server listening at port " + port);
});

(function(){
	var stdin = process.stdin;
	// without this, we would only get streams once enter is pressed
	stdin.setRawMode( true );
	
	// resume stdin in the parent process (node app won't quit all by itself
	// unless an error or process.exit() happens)
	stdin.resume();
	
	// i don't want binary, do you?
	stdin.setEncoding( 'utf8' );
	
	// on any data into stdin
	stdin.on( 'data', function( key ){
	  // ctrl-c ( end of text )
	  if ( key === '\u0003' ) {
	    process.exit();
	  }
	  // write the key to stdout all normal like
	  process.stdout.write( key );
	});
})();