"use strict"

function BY_YORI(p, q) { return p.yori - q.yori }
function shortAbsorptionPointByKeys(shortAbsorptions, strategy, pt, keys, inSameRadical, priority, saphase) {
	if (pt.touched || pt.donttouch || !pt.on || !strategy.DO_SHORT_ABSORPTION || !inSameRadical) return;
	if (saphase) {
		for (var m = 0; m < keys.length; m++) {
			var key = keys[m];
			if (pt.on && pt.id !== key.id && Math.abs(key.yori + (pt.xori - key.xori) * (key.slope || 0) - pt.yori) <= strategy.BLUEZONE_WIDTH && saphase) {
				shortAbsorptions.push([key.id, pt.id, priority + (pt.yExtrema ? 1 : 0)]);
				pt.touched = true;
				return;
			}
		}
	} else {
		for (var m = 0; m < keys.length; m++) {
			var key = keys[m];
			if (key.blued && key.yStrongExtrema && Math.hypot(pt.yori - key.yori, pt.xori - key.xori) <= strategy.ABSORPTION_LIMIT && pt.xStrongExtrema) {
				shortAbsorptions.push([key.id, pt.id, priority + (pt.yExtrema ? 1 : 0)]);
				pt.touched = true;
				return;
			}
		}
	}
}
function shortAbsorptionByKeys(shortAbsorptions, strategy, pts, keys, inSameRadical, priority, saphase) {
	for (var k = 0; k < pts.length; k++) {
		shortAbsorptionPointByKeys(shortAbsorptions, strategy, pts[k], keys, inSameRadical, priority, saphase)
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
			records.push({
				topbot: topbot,
				midex: midex,
				cka: contourAlignPoints,
				ck: contourKeypoints,
				ckx: contourKeypoints.concat(topbot).sort(BY_YORI),
				all: contourpoints
			})
		} else {
			records.push({
				topbot: [],
				midex: [],
				cka: contourAlignPoints,
				ck: contourKeypoints,
				ckx: contourKeypoints,
				all: contourpoints
			})
		}
	};
	for (var j = 0; j < contours.length; j++) {
		if (records[j].ck.length > 1) {
			shortAbsorptionByKeys(shortAbsorptions, strategy, records[j].topbot, records[j].cka, true, 3, false)
			shortAbsorptionByKeys(shortAbsorptions, strategy, records[j].all, records[j].cka, true, 3, true)
			interpolateByKeys(interpolations, strategy, records[j].topbot, records[j].ck, true, 3, true)
		}
		interpolateByKeys(interpolations, strategy, records[j].topbot, glyphKeypoints, false, 3)
	};
	for (var j = 0; j < contours.length; j++) {
		if (records[j].ckx.length > 1) {
			interpolateByKeys(interpolations, strategy, records[j].midex, records[j].ckx, true, 1, true)
		}
		interpolateByKeys(interpolations, strategy, records[j].midex, glyphKeypoints, false, 1)
	};

	return {
		interpolations: interpolations,
		shortAbsorptions: shortAbsorptions
	}
};
