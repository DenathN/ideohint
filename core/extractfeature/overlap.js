"use strict"

function edgetouch(s, t) {
	if (s.xmax - s.xmin < t.xmax - t.xmin) return edgetouch(t, s);
	return (s.xmin < t.xmin && t.xmin < s.xmax && s.xmax < t.xmax && (s.xmax - t.xmin) / (s.xmax - s.xmin) <= 0.2)
		|| (t.xmin < s.xmin && s.xmin < t.xmax && t.xmax < s.xmax && (t.xmax - s.xmin) / (s.xmax - s.xmin) <= 0.2)
};

exports.analyzeDirectOverlaps = function (glyph, strategy, loose) {
	var d = [];
	for (var j = 0; j < glyph.stemOverlaps.length; j++) {
		d[j] = [];
		for (var k = 0; k < j; k++) {
			d[j][k] = glyph.stemOverlaps[j][k] > strategy.COLLISION_MIN_OVERLAP_RATIO && !edgetouch(glyph.stems[j], glyph.stems[k])
			if (loose && glyph.collisionMatrices.collision[j][k] <= 0) d[j][k] = false;
			if (glyph.stems[j].rid && glyph.stems[j].rid === glyph.stems[k].rid) d[j][k] = false;
		}
	};
	for (var x = 0; x < d.length; x++) for (var y = 0; y < d.length; y++) for (var z = 0; z < d.length; z++) {
		if (d[x][y] && d[y][z]) d[x][z] = false;
	};
	return d;
}

exports.analyzeEdgeTouches = function (stems, stemOverlaps) {
	var d = [];
	for (var j = 0; j < stemOverlaps.length; j++) {
		d[j] = [];
		for (var k = 0; k < j; k++) {
			d[j][k] = edgetouch(stems[j], stems[k]);
		}
	};
	return d;
}

exports.transitionClosure = function (d) {
	var o = [];
	for (var j = 0; j < d.length; j++) { o[j] = d[j].slice(0) };
	for (var m = 0; m < o.length; m++)
		for (var j = 0; j < o.length; j++)
			for (var k = 0; k < o.length; k++) o[j][k] = o[j][k] || o[j][m] && o[m][k];
	return o;
}
