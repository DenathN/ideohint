"use strict"

var fs = require('fs');
var readline = require('readline');
var stream = require('stream');
var devnull = require('dev-null');
var yargs = require('yargs');
var nodeStatic = require("node-static");
var querystring = require('querystring');


exports.command = "visual <input>";
exports.describe = "Visual parameter adjuster";
exports.builder = function (yargs) {
	return yargs
		.describe('w', 'Show test word')
		.describe('port', 'Set Port (9527 by default)');
}

function processPost(request, response, callback) {
	var queryData = "";
	if (typeof callback !== 'function') return null;

	if (request.method == 'POST') {
		request.on('data', function (data) {
			queryData += data;
			if (queryData.length > 1e6) {
				queryData = "";
				response.writeHead(413, { 'Content-Type': 'text/plain' }).end();
				request.connection.destroy();
			}
		});

		request.on('end', function () {
			callback(querystring.parse(queryData));
		});

	} else {
		response.writeHead(405, { 'Content-Type': 'text/plain' });
		response.end();
	}
}


exports.handler = function (argv) {

	var parameterFile = require('../paramfile').from(argv);
	var strategy = require('../strategy').from(argv, parameterFile);
	var defaultStrategy = require('../strategy').defaultStrategy;

	var instream = fs.createReadStream(argv.input);
	var w = argv.w || "我能吞下玻璃而不伤身体";

	var started = false;

	var curChar = null;
	var readingSpline = false;

	var matches = [];

	var rl = readline.createInterface(instream, devnull());
	rl.on('line', function (line) {
		var data = JSON.parse(line);
		var gid = data[0];
		if (gid.slice(0, 3) === 'uni') {
			for (var j = 0; j < w.length; j++) if (parseInt(gid.slice(3), 16) === w.charCodeAt(j)) {
				matches[j] = data[2];
			}
		}
	});


	rl.on('close', startServer);

	function startServer() {
		var fileServer = new nodeStatic.Server(require('path').resolve(__dirname, "../visual"));
		var port = process.env.PORT || 9527;
		// Start a web server which displays an user interface for parameter adjustment
		require('http').createServer(function (request, response) {
			if (request.method == 'POST') {
				return processPost(request, response, function (data) {
					if (request.url === "/save") {
						if (argv.parameters) {
							fs.writeFileSync(argv.parameters, data.content);
							console.log("parameters saved to", argv.parameters);
						}
					} else {
						response.writeHead(405, { 'Content-Type': 'text/plain' });
						response.end();
					}
				});
			}
			request.addListener("end", function () {
				if (request.url === "/characters.json") {
					response.setHeader("Content-Type", "application/json;charset=UTF-8");
					response.end(JSON.stringify(matches));
				} else if (request.url === "/strategy.json") {
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
	}

	(function () {
		var stdin = process.stdin;
		// without this, we would only get streams once enter is pressed
		stdin.setRawMode(true);

		// resume stdin in the parent process (node app won't quit all by itself
		// unless an error or process.exit() happens)
		stdin.resume();

		// i don't want binary, do you?
		stdin.setEncoding('utf8');

		// on any data into stdin
		stdin.on('data', function (key) {
			// ctrl-c ( end of text )
			if (key === '\u0003') {
				process.exit();
			}
			// write the key to stdout all normal like
			process.stdout.write(key);
		});
	})();

}