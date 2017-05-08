const PROGRESS_LENGTH = 32;

function pad(s, p, n) {
	s = "" + s;
	while (s.length < n) s = p + s;
	return s;
}

function progressbar(u, len) {
	var buf = "";
	for (var j = 1; j <= len; j++) {
		buf += (j > u * len) ? " " : "#";
	}
	return buf;
}

function showProgressBar(name, currentProgress, j, n) {
	var pb = progressbar(j / n, PROGRESS_LENGTH);
	if (pb !== currentProgress) {
		process.stderr.write("[" + pb + "](#" + pad(j, " ", 5) + "/" + pad(n, " ", 5) + ")" + " of " + name + "\n");
	}
	return pb;
}

exports.progress = function progressForEach(name, items, fn) {
	let currentProgress = progressbar(0, PROGRESS_LENGTH);
	for (let j = 0; j < items.length; j++) {
		fn(items[j], j);
		currentProgress = showProgressBar(name, currentProgress, j, items.length);
	}
	currentProgress = showProgressBar(name, currentProgress, items.length, items.length);
}
