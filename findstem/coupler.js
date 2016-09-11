"use strict"

var overlapInfo = require('./overlap').overlapInfo;
var by_start = function (p, q) { return p[0].xori - q[0].xori };

// Stemfinding
function findHorizontalSegments(radicals, strategy) {
	var segments = []
	for (var r = 0; r < radicals.length; r++) {
		radicals[r].mergedSegments = [];
		var radicalParts = [radicals[r].outline].concat(radicals[r].holes);
		for (var j = 0; j < radicalParts.length; j++) {
			var contour = radicalParts[j];
			var lastPoint = contour.points[0]
			var segment = [lastPoint];
			segment.radical = r;
			for (var k = 1; k < contour.points.length - 1; k++) if (!contour.points[k].interpolated) {
				if (Math.abs((contour.points[k].yori - lastPoint.yori) / (contour.points[k].xori - lastPoint.xori)) <= strategy.SLOPE_FUZZ) {
					segment.push(contour.points[k])
					lastPoint = contour.points[k];
				} else {
					if (segment.length > 1) segments.push(segment)
					lastPoint = contour.points[k];
					segment = [lastPoint]
					segment.radical = r;
				}
			};
			if (Math.abs((contour.points[0].yori - lastPoint.yori) / (contour.points[0].xori - lastPoint.xori)) <= strategy.SLOPE_FUZZ) {
				segment.push(contour.points[0])
				segment.push(contour.points[contour.points.length - 1])
			}
			if (segment.length > 1) segments.push(segment)
		}
	}

	segments = segments.sort(function (p, q) { return p[0].xori - q[0].xori })

	for (var j = 0; j < segments.length; j++) if (segments[j]) {
		var pivot = [segments[j]];
		var pivotRadical = segments[j].radical;
		var orientation = pivot[0][1].xori > pivot[0][0].xori
		segments[j] = null;
		for (var k = j + 1; k < segments.length; k++) if (segments[k] && segments[k].radical === pivotRadical) {
			var pendingSegmentLength = Math.abs(segments[k][1].xori - segments[k][0].xori);
			var distanceBetween = orientation ? Math.abs(segments[k][0].xori - pivot[pivot.length - 1][1].xori)
				: Math.abs(segments[k][1].xori - pivot[pivot.length - 1][0].xori);
			if (Math.abs(segments[k][0].yori - pivot[0][0].yori) <= strategy.Y_FUZZ
				&& orientation === (segments[k][1].xori > segments[k][0].xori)
				&& (pendingSegmentLength < strategy.MAX_STEM_WIDTH
					|| distanceBetween <= pendingSegmentLength && distanceBetween <= strategy.MAX_SEGMERGE_DISTANCE)) {
				var r = pivot.radical;
				pivot.push(segments[k])
				segments[k] = null;
			}
		}
		radicals[pivotRadical].mergedSegments.push(pivot.sort(function (s1, s2) {
			return orientation ? s1[0].xori - s2[0].xori : s2[0].xori - s1[0].xori
		}))
	}
}

function connectHangingSegments(segs, stem, strategy) {
	for (var m = 0; m < segs.length; m++) if (segs[m] && segs[m][0]) {
		var seg = segs[m];
		var stemOverlap = overlapInfo(stem.low, stem.high, strategy);
		if ((stem.low[0][1].xori >= stem.low[0][0].xori) === (seg[0][1].xori >= seg[0][0].xori)
			&& Math.abs(seg[0][0].yori - stem.low[0][0].yori) <= strategy.Y_FUZZ) {
			var amendedOverlap = overlapInfo(stem.low.concat(seg).sort(by_start), stem.high, strategy);
			if (amendedOverlap.len / amendedOverlap.lb > stemOverlap.len / stemOverlap.lb) {
				stem.low = stem.low.concat(seg).sort(by_start);
				segs[m] = null;
			}
		} else if (
			(stem.high[0][1].xori >= stem.high[0][0].xori) === (seg[0][1].xori >= seg[0][0].xori)
			&& Math.abs(seg[0][0].yori - stem.high[0][0].yori) <= strategy.Y_FUZZ) {
			var amendedOverlap = overlapInfo(stem.low, stem.high.concat(seg).sort(by_start), strategy);
			if (amendedOverlap.len / amendedOverlap.la > stemOverlap.len / stemOverlap.la) {
				stem.high = stem.high.concat(seg).sort(by_start);
				segs[m] = null;
			}
		}
	}
}

function pairSegmentsForRadical(radical, r, strategy) {
	var radicalStems = [];
	var segs = radical.mergedSegments.sort(function (a, b) { return a[0][0].yori - b[0][0].yori });
	var ori = radical.outline.ccw;
	// We stem segments upward-down.
	for (var j = segs.length - 1; j >= 0; j--) if (segs[j] && ori !== (segs[j][0][0].xori < segs[j][0][segs[j][0].length - 1].xori)) {
		var stem = { high: segs[j] };
		for (var k = j - 1; k >= 0; k--) if (segs[k]) {
			var segOverlap = overlapInfo(segs[j], segs[k], strategy);
			if (segOverlap.len / segOverlap.la >= strategy.COLLISION_MIN_OVERLAP_RATIO || segOverlap.len / segOverlap.lb >= strategy.COLLISION_MIN_OVERLAP_RATIO) {
				if (ori === (segs[k][0][0].xori < segs[k][0][segs[k][0].length - 1].xori)
					&& segs[j][0][0].yori - segs[k][0][0].yori <= strategy.MAX_STEM_WIDTH
					&& segs[j][0][0].yori - segs[k][0][0].yori >= strategy.MIN_STEM_WIDTH) {
					// A stem is found
					stem.low = segs[k];
					stem.yori = stem.high[0][0].yori;
					stem.width = Math.abs(stem.high[0][0].yori - stem.low[0][0].yori);
					stem.belongRadical = r;
					segs[j] = segs[k] = null;
					radicalStems.push(stem);
					connectHangingSegments(segs, stem, strategy);
				}
				break;
			}
		}
	};
	return radicalStems;
}

function pairSegments(radicals, strategy) {
	var stems = [];
	for (var r = 0; r < radicals.length; r++) {
		var radicalStems = pairSegmentsForRadical(radicals[r], r, strategy);
		stems = stems.concat(radicalStems)
		radicals[r].stems = radicalStems;
	};
	return stems.sort(function (a, b) { return a.yori - b.yori });
};

// Symmetric stem pairing
function pairSymmetricStems(stems, strategy) {
	var res = [];
	for (var j = 0; j < stems.length; j++) {
		for (var k = j + 1; k < stems.length; k++) if (stems[j] && stems[k]) {
			var delta1 = stems[j].belongRadical === stems[k].belongRadical ? 0.002 : 0.005;
			var delta2 = stems[j].belongRadical === stems[k].belongRadical ? 0.001 : 0.003;
			if (
				Math.abs(stems[j].yori - stems[j].width / 2 - stems[k].yori + stems[k].width / 2) <= strategy.UPM * delta1 && Math.abs(stems[j].width - stems[k].width) <= strategy.UPM * delta1
			) {
				stems[j].high = stems[j].high.concat(stems[k].high);
				stems[j].low = stems[j].low.concat(stems[k].low);
				stems[k] = null
			}
		}
	};
	for (var j = 0; j < stems.length; j++) if (stems[j]) {
		res.push(stems[j])
	};
	return res;
};

module.exports = function (radicals, strategy) {
	findHorizontalSegments(radicals, strategy);
	return pairSymmetricStems(pairSegments(radicals, strategy), strategy);
}