"use strict"

var toposort = require('toposort');

function between(t, m, b) {
	return t.xmin < m.xmin && m.xmax < t.xmax && b.xmin < m.xmin && m.xmax < b.xmax
}

module.exports = function (glyph, blanks) {
	var edges = [], t = [], b = [];
	for (var j = 0; j < glyph.stems.length; j++) {
		t[j] = glyph.stems.length - 1;
		b[j] = 0;
	}
	for (var j = glyph.stems.length - 1; j >= 0; j--) {
		if (j > 0 && j < glyph.stems.length - 1) edges.push([0, j], [glyph.stems.length - 1, j]);
		for (var k = 0; k < j; k++) for (var w = glyph.stems.length - 1; w > j; w--) {
			if (blanks[j][k] >= 0 && blanks[w][j] >= 0 && between(glyph.stems[w], glyph.stems[j], glyph.stems[k])) {
				edges.push([w, j], [k, j]);
				t[j] = w; b[j] = k;
			}
		}
	};
	var order = toposort(edges);
	var flexes = []
	for (var j = 0; j < order.length; j++) {
		if (t[order[j]] >= 0 && b[order[j]] >= 0 && t[order[j]] !== order[j] && b[order[j]] !== order[j]) {
			flexes.push([t[order[j]], order[j], b[order[j]]]);
		}
	};
	return flexes;
}
