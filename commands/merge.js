"use strict";

var fs = require("fs");

exports.command = "merge <parts..>";
exports.describe = "Merge HGF or HGI files.";
exports.builder = function(yargs) {
	return yargs.alias("o", "output-into");
};

exports.handler = function(argv) {
	var outStream = argv.o ? fs.createWriteStream(argv.o, { encoding: "utf-8" }) : process.stdout;
	var buf = {};
	var nRead = 0;
	var nTotal = 0;
	argv.parts.forEach(function(file) {
		var d = fs
			.readFileSync(file, "utf-8")
			.trim()
			.split("\n");
		for (var j = 0; j < d.length; j++) {
			const dataStr = d[j].trim();
			if (!dataStr) continue;
			const data = JSON.parse(dataStr);
			nRead += 1;
			if (buf[data.hash]) continue;
			buf[data.hash] = true;
			outStream.write(dataStr + "\n");
			nTotal += 1;
		}
	});
	process.stderr.write(nRead + " records found; " + nTotal + " records after merging.\n");
};
