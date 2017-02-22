"use strict";

function BY_YORI(p, q) { return p.yori - q.yori; }
function adjacent(z1, z2) { return z1.prev === z2 || z2.prev === z1; }
var STEPS = 10;
function shortAbsorptionPointByKeys(shortAbsorptions, strategy, pt, keys, inSameRadical, priority) {
	if (pt.touched || pt.donttouch || !pt.on || !strategy.DO_SHORT_ABSORPTION || !inSameRadical) return;
	for (var m = 0; m < keys.length; m++) {
		var key = keys[m];
		if (key.blued && key.yStrongExtrema && (Math.hypot(pt.yori - key.yori, pt.xori - key.xori) <= strategy.ABSORPTION_LIMIT && pt.xStrongExtrema)) {
			shortAbsorptions.push([key.id, pt.id, priority + (pt.yExtrema ? 1 : 0)]);
			pt.touched = true;
			return;
		}
	}
}
function shortAbsorptionByKeys(shortAbsorptions, strategy, pts, keys, inSameRadical, priority) {
	for (var k = 0; k < pts.length; k++) {
		shortAbsorptionPointByKeys(shortAbsorptions, strategy, pts[k], keys, inSameRadical, priority);
	}
}
var COEFF_EXT = 1 / 2;
function interpolateByKeys(interpolations, strategy, pts, keys, inSameRadical, priority) {
	for (var k = 0; k < pts.length; k++) {
		var pt = pts[k];
		if (pt.touched || pt.donttouch) continue;
		var upperK = null, upperdist = 0xFFFF;
		var lowerK = null, lowerdist = 0xFFFF;
		for (var m = keys.length - 1; m >= 0; m--) if (keys[m].yori < pt.yori - strategy.Y_FUZZ) {
			if (!lowerK || Math.hypot(keys[m].xori - pt.xori, COEFF_EXT * (keys[m].yori - pt.yori)) < lowerdist) {
				lowerK = keys[m];
				lowerdist = Math.hypot(keys[m].xori - pt.xori, COEFF_EXT * (keys[m].yori - pt.yori));
			}
		}
		for (var m = keys.length - 1; m >= 0; m--) if (keys[m].yori > pt.yori + strategy.Y_FUZZ) {
			if (!upperK || Math.hypot(keys[m].xori - pt.xori, COEFF_EXT * (keys[m].yori - pt.yori)) < upperdist) {
				upperK = keys[m];
				upperdist = Math.hypot(keys[m].xori - pt.xori, COEFF_EXT * (keys[m].yori - pt.yori));
			}
		}
		if (lowerK && upperK) {
			if (upperK.linkedKey) upperK = upperK.linkedKey;
			if (lowerK.linkedKey) lowerK = lowerK.linkedKey;
			if (!upperK.phantom && !lowerK.phantom) interpolations.push([upperK.id, lowerK.id, pt.id, priority]);
			pt.touched = true;
		}
	}
}
function linkRadicalSolePointsToOneStem(shortAbsorptions, strategy, radical, radicalPoints, stem, priority) {
	var highpts = [].concat.apply([], stem.high);
	var lowpts = [].concat.apply([], stem.low);
	var keyPoints = highpts.concat(lowpts);
	for (var j = 0; j < keyPoints.length; j++) for (var k = 0; k < radicalPoints.length; k++) {
		var isHigh = j < highpts.length;
		var zkey = keyPoints[j];
		var z = radicalPoints[k];
		if (z.touched || z.donttouch || zkey.id === z.id) continue;
		// detect whether this sole point is attached to the stem edge.
		// in most cases, absorbing a lower point should be stricter due to the topology of ideographs
		// so we use asymmetric condition for "above" and "below" cases.
		var yDifference = z.yori - (zkey.yori + (z.xori - zkey.xori) * (zkey.slope || 0));
		if (!(yDifference > 0 ? yDifference < strategy.Y_FUZZ * 2 : -yDifference < strategy.Y_FUZZ)) continue;

		// And it should have at least one segment in the glyph's outline.'
		if (radical.includesSegmentEdge(z, zkey, 1, strategy.Y_FUZZ * 0.752)) {
			var key = isHigh ? stem.highkey : stem.lowkey;
			shortAbsorptions.push([key.id, z.id, priority + (z.yExtrema ? 1 : 0)]);
			z.touched = true;
		}
	}
}
function linkRadicalSoleStemPoints(shortAbsorptions, strategy, radical, radicalStems, priority) {
	var radicalParts = [radical.outline].concat(radical.holes);
	var radicalPoints = [].concat.apply([], radicalParts.map(function (c) { return c.points.slice(0, -1); }));
	for (var s = 0; s < radicalStems.length; s++) {
		linkRadicalSolePointsToOneStem(shortAbsorptions, strategy, radical, radicalPoints, radicalStems[s], priority);
	}
}
function linkSoleStemPoints(shortAbsorptions, strategy, glyph, priority) {
	for (var j = 0; j < glyph.radicals.length; j++) {
		var radical = glyph.radicals[j];
		var radicalStems = glyph.stems.filter(function (s) { return s.belongRadical === j; });
		linkRadicalSoleStemPoints(shortAbsorptions, strategy, radical, radicalStems, priority);
	}
}
module.exports = function (glyph, strategy) {
	var interpolations = [];
	var shortAbsorptions = [];

	var contours = glyph.contours;
	var glyphKeypoints = [];
	for (var j = 0; j < contours.length; j++) for (var k = 0; k < contours[j].points.length; k++) {
		var z = contours[j].points[k];
		if (z.touched && z.keypoint || z.linkedKey) { glyphKeypoints.push(z); }
	}
	// phantom points
	for (var s = 0; s < glyph.stems.length; s++) {
		var stem = glyph.stems[s];
		for (var j = 0; j < stem.high.length; j++) {
			var l = stem.high[j][0];
			var r = stem.high[j][stem.high[j].length - 1];
			for (var step = 1; step < STEPS; step++) {
				glyphKeypoints.push({
					xori: l.xori + (step / STEPS) * (r.xori - l.xori),
					yori: l.yori + (step / STEPS) * (r.yori - l.yori),
					linkedKey: l.linkedKey || r.linkedKey,
					phantom: true
				});
			}
		}
		for (var j = 0; j < stem.low.length; j++) {
			var l = stem.low[j][0];
			var r = stem.low[j][stem.low[j].length - 1];
			for (var step = 1; step < STEPS; step++) {
				glyphKeypoints.push({
					xori: l.xori + (step / STEPS) * (r.xori - l.xori),
					yori: l.yori + (step / STEPS) * (r.yori - l.yori),
					linkedKey: l.linkedKey || r.linkedKey,
					phantom: true
				});
			}
		}
	}
	glyphKeypoints = glyphKeypoints.sort(BY_YORI);
	var records = [];

	for (var j = 0; j < contours.length; j++) {
		var contourpoints = contours[j].points.slice(0, -1);
		var contourAlignPoints = contourpoints.filter(function (p) { return p.touched; }).sort(BY_YORI);
		var contourExtrema = contourpoints.filter(function (p) { return p.xExtrema || p.yExtrema; }).sort(BY_YORI);

		if (contourExtrema.length > 1) {
			var topbot = [contourExtrema[0], contourExtrema[contourExtrema.length - 1]];
			var extrema = contourExtrema.slice(1, -1).filter(function (z) {
				return !z.touched && !z.donttouch && z.yExtrema;
			});
			var midex = [];
			for (var m = 0; m < extrema.length; m++) {
				if (extrema[m].yori === topbot[0].yori) {
					if (!adjacent(topbot[0], extrema[m])) {
						shortAbsorptions.push([topbot[0].id, extrema[m].id, 1]);
					}
					extrema[m].touched = true;
					extrema[m].donttouch = true;
				} else if (extrema[m].yori === topbot[1].yori) {
					if (!adjacent(topbot[1], extrema[m])) {
						shortAbsorptions.push([topbot[1].id, extrema[m].id, 1]);
					}
					extrema[m].touched = true;
					extrema[m].donttouch = true;
				} else {
					midex.push(extrema[m]);
				}
			}
			var blues = contourpoints.filter(function (p) { return p.blued; });
			var midexl = contourExtrema.slice(1, -1).filter(function (p) { return p.xExtrema || p.yExtrema; });
			records.push({
				topbot: topbot,
				midex: midex,
				midexl: midexl,
				blues: blues,
				cka: contourAlignPoints,
			});
		} else {
			records.push({
				topbot: [],
				midex: [],
				midexl: [],
				blues: [],
				cka: contourAlignPoints,
			});
		}
	}
	for (var j = 0; j < contours.length; j++) {
		shortAbsorptionByKeys(shortAbsorptions, strategy, records[j].topbot, records[j].cka, true, 9, false);
		shortAbsorptionByKeys(shortAbsorptions, strategy, records[j].midexl, records[j].blues, true, 1, false);
	}
	linkSoleStemPoints(shortAbsorptions, strategy, glyph, 7);
	var b = [];
	for (var j = 0; j < contours.length; j++) {
		interpolateByKeys(interpolations, strategy, records[j].topbot, glyphKeypoints, false, 5);
		b = b.concat(records[j].topbot.filter(function () { return z.touched; }));
	}
	glyphKeypoints = glyphKeypoints.concat(b).sort(BY_YORI);
	for (var j = 0; j < contours.length; j++) {
		interpolateByKeys(interpolations, strategy, records[j].midex, glyphKeypoints, false, 3);
	}
	interpolations = interpolations.sort(function (u, v) { return glyph.indexedPoints[u[2]].xori - glyph.indexedPoints[v[2]].xori; });
	for (var j = 0; j < interpolations.length; j++) {
		if (!interpolations[j]) continue;
		for (var k = j + 1; k < interpolations.length; k++) {
			if (interpolations[k]
				&& interpolations[j][0] === interpolations[k][0]
				&& interpolations[j][1] === interpolations[k][1]
				&& interpolations[j][3] === interpolations[k][3]
				&& Math.abs(glyph.indexedPoints[interpolations[j][2]].yori - glyph.indexedPoints[interpolations[k][2]].yori) <= strategy.Y_FUZZ) {
				shortAbsorptions.push([
					interpolations[j][2],
					interpolations[k][2],
					interpolations[j][3] - 1
				]);
				interpolations[k] = null;
			}
		}
	}
	return {
		interpolations: interpolations.filter(function (x) { return x; }),
		shortAbsorptions: shortAbsorptions
	};
};
