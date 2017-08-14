"use strict"

var toposort = require('toposort');

function priof(s) {
	if (!s.hasGlyphStemAbove) return 2;
	if (!s.hasGlyphStemBelow) return 1;
	return 0;
}
function dominate(sj, sk) {
	var pj = priof(sj);
	var pk = priof(sk);
	if (pj === pk) return sj.xmin < sk.xmin && sj.xmax > sk.xmax;
	if (pj > pk) return true;
	return false;
}

module.exports = function (stems) {
	var dominance = [];
	for (var j = 0; j < stems.length; j++) for (var k = 0; k < stems.length; k++) {
		if (dominate(stems[j], stems[k])) {
			dominance.push([j, k]);
		}
	}
	return toposort(dominance);
}