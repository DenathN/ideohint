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
function interpolateByKeys(interpolations, strategy, pts, keys, inSameRadical, priority) {
	for (var k = 0; k < pts.length; k++) {
		var pt = pts[k];
		if (pt.touched || pt.donttouch) continue;
		out: for (var m = keys.length - 2; m >= 0; m--) if (keys[m].yori < pt.yori - strategy.BLUEZONE_WIDTH) {
			for (var n = m + 1; n < keys.length; n++) if (keys[n].yori - keys[m].yori > strategy.BLUEZONE_WIDTH && keys[n].yori > pt.yori + strategy.BLUEZONE_WIDTH) {
				interpolations.push([keys[m].id, keys[n].id, pt.id, priority + (pt.yExtrema ? 1 : 0)]);
				pt.touched = true;
				break out;
			}
		}
	}
}
function linkRadicalSolePointsToOneStem(shortAbsorptions, strategy, radical, radicalPoints, stem,priority) {
	var highpts = [].concat.apply([], stem.high);
	var lowpts = [].concat.apply([], stem.low);
	var pts = highpts.concat(lowpts)
	for (var j = 0; j < pts.length; j++) for (var k = 0; k < radicalPoints.length; k++) {
		var isHigh = j < highpts.length;
		var zkey = pts[j];
		var z = radicalPoints[k];
		if (z.touched || z.donttouch || zkey.id === z.id) continue;
		var SEGMENTS = 10;
		var segmentInRadical = true;
		for (var s = 1; s < SEGMENTS; s++) {
			var testz = {
				xori: zkey.xori + (z.xori - zkey.xori) * (s / SEGMENTS),
				yori: zkey.yori + (z.yori - zkey.yori) * (s / SEGMENTS)
			}
			if (!radical.includes(testz)) {
				segmentInRadical = false;
				break;
			}
		}
		if(segmentInRadical &&  Math.abs(zkey.yori + (z.xori - zkey.xori) * (zkey.slope || 0) - z.yori) <= strategy.BLUEZONE_WIDTH){
			var key = isHigh ? stem.highkey : stem.lowkey;
			shortAbsorptions.push([key.id, z.id, priority + (z.yExtrema ? 1 : 0)]);
			z.touched = true;
		}
	}
}
function linkRadicalSoleStemPoints(shortAbsorptions, strategy, radical, radicalStems,priority) {
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
		if (contours[j].points[k].touched && contours[j].points[k].keypoint) {
			glyphKeypoints.push(contours[j].points[k]);
		}
	};
	glyphKeypoints = glyphKeypoints.sort(BY_YORI);
	var records = [];

	for (var j = 0; j < contours.length; j++) {
		var contourpoints = contours[j].points.slice(0, -1);
		var contourKeypoints = contourpoints.filter(function (p) { return p.keypoint }).sort(BY_YORI);
		var contourAlignPoints = contourpoints.filter(function (p) { return p.touched }).sort(BY_YORI);
		var contourExtrema = contourpoints.filter(function (p) { return p.xExtrema || p.yExtrema }).sort(BY_YORI);

		if (contourExtrema.length > 1) {
			var topbot = [contourExtrema[0], contourExtrema[contourExtrema.length - 1]];
			var midex = contourExtrema.slice(1, -1).filter(function (p) { return p.xStrongExtrema || p.yStrongExtrema });
			var midexl = contourExtrema.slice(1, -1).filter(function (p) { return p.xExtrema || p.yExtrema });
			records.push({
				topbot: topbot,
				midex: midex,
				midexl: midexl,
				cka: contourAlignPoints,
				ck: contourKeypoints,
				ckx: contourKeypoints.concat(topbot).sort(BY_YORI),
				ckxx: contourKeypoints.concat(topbot).concat(midex).sort(BY_YORI),
				all: contourpoints
			})
		} else {
			records.push({
				topbot: [],
				midex: [],
				cka: contourAlignPoints,
				ck: contourKeypoints,
				ckx: contourKeypoints,
				ckxx: contourKeypoints,
				all: contourpoints
			})
		}
	};
	for (var j = 0; j < contours.length; j++) {
		if (records[j].ck.length > 1) {
			shortAbsorptionByKeys(shortAbsorptions, strategy, records[j].topbot, records[j].cka, true, 9, false);
			shortAbsorptionByKeys(shortAbsorptions, strategy, records[j].midexl, records[j].topbot, true, 1, false);
		}
	}
	linkSoleStemPoints(shortAbsorptions, strategy, glyph, 7);
	for (var j = 0; j < contours.length; j++) {
		if (records[j].ck.length > 1) {
			interpolateByKeys(interpolations, strategy, records[j].topbot, records[j].ck, true, 5, true)
		}
		interpolateByKeys(interpolations, strategy, records[j].topbot, glyphKeypoints, false, 5)
	};
	for (var j = 0; j < contours.length; j++) {
		if (records[j].ckx.length > 1) {
			interpolateByKeys(interpolations, strategy, records[j].midex, records[j].ckx, true, 3, true)
		}
		interpolateByKeys(interpolations, strategy, records[j].midex, glyphKeypoints, false, 3)
	};

	return {
		interpolations: interpolations,
		shortAbsorptions: shortAbsorptions
	}
};
