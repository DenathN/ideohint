"use strict"

function BY_YORI(p, q) { return p.yori - q.yori }
function adjacent(z1, z2) { return z1.prev === z2 || z2.prev === z1; }
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
		shortAbsorptionPointByKeys(shortAbsorptions, strategy, pts[k], keys, inSameRadical, priority)
	}
}
var COEFF_EXT = 2;
function interpolateByKeys(interpolations, strategy, pts, keys, inSameRadical, priority) {
	for (var k = 0; k < pts.length; k++) {
		var pt = pts[k];
		if (pt.touched || pt.donttouch) continue;
		var upperK = null, upperdist = 0xFFFF;
		var lowerK = null, lowerdist = 0xFFFF;
		for (var m = keys.length - 1; m >= 0; m--) if (keys[m].yori < pt.yori - strategy.Y_FUZZ) {
			if (!lowerK || Math.hypot(keys[m].xori - pt.xori, COEFF_EXT * (keys[m].yori - pt.yori)) < lowerdist) {
				lowerK = keys[m];
				lowerdist = Math.hypot(keys[m].xori - pt.xori, COEFF_EXT * (keys[m].yori - pt.yori))
			}
		}
		for (var m = keys.length - 1; m >= 0; m--) if (keys[m].yori > pt.yori + strategy.Y_FUZZ) {
			if (!upperK || Math.hypot(keys[m].xori - pt.xori, COEFF_EXT * (keys[m].yori - pt.yori)) < upperdist) {
				upperK = keys[m];
				upperdist = Math.hypot(keys[m].xori - pt.xori, COEFF_EXT * (keys[m].yori - pt.yori))
			}
		}
		if (lowerK && upperK) {
			if (upperK.linkedKey) upperK = upperK.linkedKey
			if (lowerK.linkedKey) lowerK = lowerK.linkedKey
			interpolations.push([upperK.id, lowerK.id, pt.id, priority]);
			pt.touched = true;
		}
	}
}
function linkRadicalSolePointsToOneStem(shortAbsorptions, strategy, radical, radicalPoints, stem, priority) {
	var highpts = [].concat.apply([], stem.high);
	var lowpts = [].concat.apply([], stem.low);
	var keyPoints = highpts.concat(lowpts)
	for (var j = 0; j < keyPoints.length; j++) for (var k = 0; k < radicalPoints.length; k++) {
		var isHigh = j < highpts.length;
		var zkey = keyPoints[j];
		var z = radicalPoints[k];
		if (z.touched || z.donttouch || zkey.id === z.id) continue;

		// detect whether this sole point is attached to the stem edge.
		// in most cases, absorbing a lower point should be stricter due to the topology of ideographs
		// so we use asymmetric condition for "above" and "below" cases.
		var yDifference = z.yori - (zkey.yori + (z.xori - zkey.xori) * (zkey.slope || 0));
		if(!(yDifference > 0 ? yDifference < strategy.Y_FUZZ * 2 : -yDifference < strategy.Y_FUZZ)) continue;
		
		// And it should have at least one segment in the glyph's outline.'
		if (radical.includesSegment(z, zkey)) {
			var key = isHigh ? stem.highkey : stem.lowkey;
			shortAbsorptions.push([key.id, z.id, priority + (z.yExtrema ? 1 : 0)]);
			z.touched = true;
		}
	}
}
function linkRadicalSoleStemPoints(shortAbsorptions, strategy, radical, radicalStems, priority) {
	var radicalParts = [radical.outline].concat(radical.holes);
	var radicalPoints = [].concat.apply([], radicalParts.map(function (c) { return c.points.slice(0, -1) }));
	for (var s = 0; s < radicalStems.length; s++) {
		linkRadicalSolePointsToOneStem(shortAbsorptions, strategy, radical, radicalPoints, radicalStems[s], priority);
	}
}
function linkSoleStemPoints(shortAbsorptions, strategy, glyph, priority) {
	for (var j = 0; j < glyph.radicals.length; j++) {
		var radical = glyph.radicals[j];
		var radicalStems = glyph.stems.filter(function (s) { return s.belongRadical === j });
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
	};
	glyphKeypoints = glyphKeypoints.sort(BY_YORI);
	var records = [];

	for (var j = 0; j < contours.length; j++) {
		var contourpoints = contours[j].points.slice(0, -1);
		var contourAlignPoints = contourpoints.filter(function (p) { return p.touched }).sort(BY_YORI);
		var contourExtrema = contourpoints.filter(function (p) { return p.xExtrema || p.yExtrema }).sort(BY_YORI);

		if (contourExtrema.length > 1) {
			var topbot = [contourExtrema[0], contourExtrema[contourExtrema.length - 1]];
			var midex = contourExtrema.slice(1, -1).filter(function (p) { return p.xStrongExtrema || p.yExtrema });
			var blues = contourpoints.filter(function (p) { return p.blued });
			var midexl = contourExtrema.slice(1, -1).filter(function (p) { return p.xExtrema || p.yExtrema });
			records.push({
				topbot: topbot,
				midex: midex,
				midexl: midexl,
				blues: blues,
				cka: contourAlignPoints,
			})
		} else {
			records.push({
				topbot: [],
				midex: [],
				midexl: [],
				blues: [],
				cka: contourAlignPoints,
			})
		}
	};
	for (var j = 0; j < contours.length; j++) {
		shortAbsorptionByKeys(shortAbsorptions, strategy, records[j].topbot, records[j].cka, true, 9, false);
		shortAbsorptionByKeys(shortAbsorptions, strategy, records[j].midexl, records[j].blues, true, 1, false);
	}
	linkSoleStemPoints(shortAbsorptions, strategy, glyph, 7);

	for (var j = 0; j < contours.length; j++) {
		interpolateByKeys(interpolations, strategy, records[j].topbot, glyphKeypoints, false, 5);
	};
	for (var j = 0; j < contours.length; j++) {
		interpolateByKeys(interpolations, strategy, records[j].midex, glyphKeypoints, false, 3);
	};

	return {
		interpolations: interpolations,
		shortAbsorptions: shortAbsorptions
	}
};
