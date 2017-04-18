"use strict"

const fs = require('fs');
const readline = require('readline');
const stream = require('stream');
const devnull = require('dev-null');
const yargs = require('yargs');
const nodeStatic = require("node-static");

const url = require('url');
const querystring = require('querystring');

const pf = require('../paramfile');
const libstrg = require('../strategy')


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

function acquireCharacters(hgl, w, callback) {
	const instream = fs.createReadStream(hgl);
	let matches = [];
	const rl = readline.createInterface(instream, devnull());
	rl.on('line', function (line) {
		var data = JSON.parse(line);
		var gid = data[0];
		if (gid.slice(0, 3) === 'uni') {
			for (var j = 0; j < w.length; j++) if (parseInt(gid.slice(3), 16) === w.charCodeAt(j)) {
				matches[j] = data[2];
			}
		}
	});
	rl.on('close', function () { callback(matches) });
}

function startServer(argv) {
	const fileServer = new nodeStatic.Server(require('path').resolve(__dirname, "../visual"));
	const port = process.env.PORT || 9527;

	// Start a web server which displays an user interface for parameter adjustment
	require('http').createServer(function (request, response) {
		if (request.method == 'POST') {
			return processPost(request, response, function (data) {
				if (request.url === "/save" && data.to) {
					fs.writeFileSync(data.to, data.content);
					console.log("> Parameters saved to", data.to);
					response.writeHead(200, { 'Content-Type': 'text/plain' });
					response.end();
				} else {
					response.writeHead(405, { 'Content-Type': 'text/plain' });
					response.end();
				}
			});
		}
		request.addListener("end", function () {
			const requrl = url.parse(request.url);
			if (requrl.pathname === "/config") {
				const parameterFile = pf.from(argv);
				const strategy = libstrg.from(argv, parameterFile);
				const defaultStrategy = libstrg.defaultStrategy;

				response.setHeader("Content-Type", "application/json;charset=UTF-8");
				response.end(JSON.stringify({
					input: argv.input,
					w: (typeof argv.w === 'string' ? argv.w : "如月更紗"),
					paramPath: argv.parameters,
					strategy: strategy,
					defaultStrategy: defaultStrategy
				}));
			} else if (requrl.pathname === '/chars') {
				const q = querystring.parse(requrl.query);
				const sample = q.w || "如月更紗";
				console.log("> Loading sample " + sample)
				acquireCharacters(argv.input, sample, function (matches) {
					response.setHeader("Content-Type", "application/json;charset=UTF-8");
					response.end(JSON.stringify(matches));
				});
			} else {
				fileServer.serve(request, response);
			}
		}).resume();
	}).listen(port);
	console.log("> Server listening at port " + port);
}

exports.handler = function (argv) {

	startServer(argv);

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
