"use strict"

function analyzeBlanks(stems, directOverlaps) {
	var blanks = [];
	for (var j = 0; j < directOverlaps.length; j++) {
		blanks[j] = [];
		for (var k = 0; k < directOverlaps.length; k++) {
			blanks[j][k] = stems[j].yori - stems[j].width - stems[k].yori;
		}
	};
	return blanks;
}
exports.analyzeBlanks = analyzeBlanks;
exports.analyzeTriplets = function (stems, directOverlaps, blanks) {
	var triplets = [];
	for (var j = 0; j < stems.length; j++) {
		for (var k = 0; k < j; k++) {
			for (var w = 0; w < k; w++) if (directOverlaps[j][k] && blanks[j][k] >= 0 && blanks[k][w] >= 0) {
				triplets.push([j, k, w, blanks[j][k] - blanks[k][w]]);
			}
		}
	}
	return triplets;
}
