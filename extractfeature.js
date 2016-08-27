toposort = require('toposort');

function slopeOf(segs) {
	var sy = 0, sx = 0, n = 0;
	for (var j = 0; j < segs.length; j++) for (var k = 0; k < segs[j].length; k++) {
		sy += segs[j][k].yori;
		sx += segs[j][k].xori;
		n += 1;
	};
	var ax = sx / n, ay = sy / n;
	var b1num = 0, b1den = 0;
	for (var j = 0; j < segs.length; j++) for (var k = 0; k < segs[j].length; k++) {
		b1num += (segs[j][k].xori - ax) * (segs[j][k].yori - ay);
		b1den += (segs[j][k].xori - ax) * (segs[j][k].xori - ax);
	};
	return b1num / b1den
}
function intercept(point, slope) {
	return point.yori - point.xori * slope;
}
function TransitionClosure(d) {
	var o = [];
	for (var j = 0; j < d.length; j++) { o[j] = d[j].slice(0) };
	for (var m = 0; m < o.length; m++)
		for (var j = 0; j < o.length; j++)
			for (var k = 0; k < o.length; k++) o[j][k] = o[j][k] || o[j][m] && o[m][k];
	return o;
}
exports.extractFeature = function (glyph, strategy) {
	var STEM_SIDE_MIN_RISE = strategy.STEM_SIDE_MIN_RISE || strategy.MIN_STEM_WIDTH;
	var STEM_CENTER_MIN_RISE = strategy.STEM_CENTER_MIN_RISE || STEM_SIDE_MIN_RISE;
	var STEM_SIDE_MIN_DESCENT = strategy.STEM_SIDE_MIN_DESCENT || strategy.MIN_STEM_WIDTH;
	var STEM_CENTER_MIN_DESCENT = strategy.STEM_CENTER_MIN_DESCENT || STEM_SIDE_MIN_DESCENT;
	function atRadicalTop(stem) {
		return !stem.hasSameRadicalStemAbove
			&& !(stem.hasRadicalPointAbove && stem.radicalCenterRise > STEM_CENTER_MIN_RISE)
			&& !(stem.hasRadicalLeftAdjacentPointAbove && stem.radicalLeftAdjacentRise > STEM_SIDE_MIN_RISE)
			&& !(stem.hasRadicalRightAdjacentPointAbove && stem.radicalRightAdjacentRise > STEM_SIDE_MIN_RISE)
			&& !(stem.hasRadicalLeftDistancedPointAbove && stem.radicalLeftDistancedRise > STEM_SIDE_MIN_RISE)
			&& !(stem.hasRadicalRightDistancedPointAbove && stem.radicalRightDistancedRise > STEM_SIDE_MIN_RISE)
	}
	function atGlyphTop(stem) {
		return atRadicalTop(stem) && !stem.hasGlyphStemAbove
			&& !(stem.hasGlyphPointAbove && stem.glyphCenterRise > STEM_CENTER_MIN_RISE)
			&& !(stem.hasGlyphLeftAdjacentPointAbove && stem.glyphLeftAdjacentRise > STEM_SIDE_MIN_RISE)
			&& !(stem.hasGlyphRightAdjacentPointAbove && stem.glyphRightAdjacentRise > STEM_SIDE_MIN_RISE)
	}
	function atRadicalBottom(stem) {
		return !stem.hasSameRadicalStemBelow
			&& !(stem.hasRadicalPointBelow && stem.radicalCenterDescent > STEM_CENTER_MIN_DESCENT)
			&& !(stem.hasRadicalLeftAdjacentPointBelow && stem.radicalLeftAdjacentDescent > STEM_SIDE_MIN_DESCENT)
			&& !(stem.hasRadicalRightAdjacentPointBelow && stem.radicalRightAdjacentDescent > STEM_SIDE_MIN_DESCENT)
			&& !(stem.hasRadicalLeftDistancedPointBelow && stem.radicalLeftDistancedDescent > STEM_SIDE_MIN_DESCENT)
			&& !(stem.hasRadicalRightDistancedPointBelow && stem.radicalRightDistancedDescent > STEM_SIDE_MIN_DESCENT)
	};
	function atGlyphBottom(stem) {
		return atRadicalBottom(stem) && !stem.hasGlyphStemBelow
			&& !(stem.hasGlyphPointBelow && stem.glyphCenterDescent > STEM_CENTER_MIN_DESCENT)
			&& !(stem.hasGlyphLeftAdjacentPointBelow && stem.glyphLeftAdjacentDescent > STEM_SIDE_MIN_DESCENT)
			&& !(stem.hasGlyphRightAdjacentPointBelow && stem.glyphRightAdjacentDescent > STEM_SIDE_MIN_DESCENT)
	};
	// Stem Keypoints
	for (var js = 0; js < glyph.stems.length; js++) {
		var s = glyph.stems[js];
		var b = !s.hasSameRadicalStemBelow
			&& !(s.hasRadicalPointBelow && s.radicalCenterDescent > strategy.STEM_CENTER_MIN_DESCENT)
			&& !(s.hasRadicalLeftAdjacentPointBelow && s.radicalLeftAdjacentDescent > strategy.STEM_SIDE_MIN_DESCENT)
			&& !(s.hasRadicalRightAdjacentPointBelow && s.radicalRightAdjacentDescent > strategy.STEM_SIDE_MIN_DESCENT)
			&& !s.hasGlyphStemBelow
		var slope = (slopeOf(s.high) + slopeOf(s.low)) / 2
		// get highkey and lowkey
		var highkey = s.high[0][0], lowkey = s.low[0][0], highnonkey = [], lownonkey = [];
		var jHigh = 0, jLow = 0;
		for (var j = 0; j < s.high.length; j++) for (var k = 0; k < s.high[j].length; k++) if (s.high[j][k].id >= 0 && s.high[j][k].xori < highkey.xori) {
			highkey = s.high[j][k];
			jHigh = j;
		}
		for (var j = 0; j < s.low.length; j++) for (var k = 0; k < s.low[j].length; k++) if (s.low[j][k].id >= 0 && s.low[j][k].xori < lowkey.xori) {
			lowkey = s.low[j][k];
			jLow = j;
		}
		highkey.touched = lowkey.touched = true;
		for (var j = 0; j < s.high.length; j++) for (var k = 0; k < s.high[j].length; k++) {
			if (j !== jHigh) {
				if (k === 0) {
					highnonkey.push(s.high[j][k])
					s.high[j][k].touched = true;
				} else {
					s.high[j][k].donttouch = true;
				}
			} else if (s.high[j][k] !== highkey) {
				s.high[j][k].donttouch = true;
			}
		}
		for (var j = 0; j < s.low.length; j++) for (var k = 0; k < s.low[j].length; k++) {
			if (j !== jLow) {
				if (k === s.low[j].length - 1) {
					lownonkey.push(s.low[j][k])
					s.low[j][k].touched = true
				} else {
					s.low[j][k].donttouch = true
				}
			} else if (s.low[j][k] !== lowkey) {
				s.low[j][k].donttouch = true
			}
		};
		s.yori = highkey.yori;
		s.width = highkey.yori - lowkey.yori;
		s.posKey = b ? lowkey : highkey;
		s.advKey = b ? highkey : lowkey;
		s.posAlign = b ? lownonkey : highnonkey;
		s.advAlign = b ? highnonkey : lownonkey;
		s.posKeyAtTop = !b;
		s.posKey.keypoint = true;
	}

	// Blue zone points
	var topBluePoints = [];
	var bottomBluePoints = [];
	for (var j = 0; j < glyph.contours.length; j++) {
		for (var k = 0; k < glyph.contours[j].points.length - 1; k++) {
			var point = glyph.contours[j].points[k];
			if (point.ytouch >= strategy.BLUEZONE_TOP_LIMIT && point.yExtrema && !point.touched && !point.donttouch) {
				point.touched = true;
				point.keypoint = true;
				point.blued = true;
				topBluePoints.push(point);
			}
			if (point.ytouch <= strategy.BLUEZONE_BOTTOM_LIMIT && point.yExtrema && !point.touched && !point.donttouch) {
				point.touched = true;
				point.keypoint = true;
				point.blued = true;
				bottomBluePoints.push(point);
			}

		}
	}

	// Interpolations
	var interpolations = [];
	var shortAbsorptions = [];
	function BY_YORI(p, q) { return p.yori - q.yori }

	function interpolateByKeys(pts, keys, inSameRadical, priority) {
		for (var k = 0; k < pts.length; k++) {
			if (!pts[k].touched && !pts[k].donttouch && pts[k].on && strategy.DO_SHORT_ABSORPTION && inSameRadical && pts[k].xStrongExtrema) {
				for (var m = 0; m < keys.length; m++) {
					if (keys[m].blued && keys[m].yStrongExtrema && Math.hypot(pts[k].yori - keys[m].yori, pts[k].xori - keys[m].xori) <= strategy.ABSORPTION_LIMIT) {
						shortAbsorptions.push([keys[m].id, pts[k].id, priority + (pts[k].yExtrema ? 1 : 0)]);
						pts[k].touched = true;
						break;
					}
				}
			};
			if (!pts[k].touched && !pts[k].donttouch) {
				out: for (var m = 0; m < keys.length - 1; m++) if (keys[m].yori < pts[k].yori - strategy.BLUEZONE_WIDTH) {
					for (var n = m + 1; n < keys.length; n++) if (keys[n].yori > pts[k].yori + strategy.BLUEZONE_WIDTH) {
						interpolations.push([keys[m].id, keys[n].id, pts[k].id, priority + (pts[k].yExtrema ? 1 : 0)]);
						pts[k].touched = true;
						break out;
					}
				}
			}
		}
	}
	function findInterpolates(contours) {
		var glyphKeypoints = [];
		for (var j = 0; j < contours.length; j++) for (var k = 0; k < contours[j].points.length; k++) {
			if (contours[j].points[k].touched && contours[j].points[k].keypoint) {
				glyphKeypoints.push(contours[j].points[k]);
			}
		};
		glyphKeypoints = glyphKeypoints.sort(BY_YORI);
		var records = [];

		for (var j = 0; j < contours.length; j++) {
			var contourpoints = contours[j].points
			var contourKeypoints = contourpoints.filter(function (p) { return p.touched }).sort(BY_YORI);
			var contourExtrema = contourpoints.filter(function (p) { return p.xExtrema || p.yExtrema }).sort(BY_YORI);

			if (contourExtrema.length > 1) {
				var topbot = [contourExtrema[0], contourExtrema[contourExtrema.length - 1]];
				var midex = contourExtrema.slice(1, -1);
				records.push({
					topbot: topbot,
					midex: midex,
					ck: contourKeypoints,
					ckx: contourKeypoints.concat(topbot).sort(BY_YORI)
				})
			} else {
				records.push({
					topbot: [],
					midex: midex,
					ck: contourKeypoints,
					ckx: contourKeypoints
				})
			}
		};
		for (var j = 0; j < contours.length; j++) {
			if (records[j].ck.length > 1) {
				interpolateByKeys(records[j].topbot, records[j].ck, true, 3)
			}
			interpolateByKeys(records[j].topbot, glyphKeypoints, false, 3)
		};
		for (var j = 0; j < contours.length; j++) {
			if (records[j].ckx.length > 1) {
				interpolateByKeys(records[j].midex, records[j].ckx, true, 1)
			}
			interpolateByKeys(records[j].midex, glyphKeypoints, false, 1)
		};
	};
	findInterpolates(glyph.contours);
	function edgetouch(s, t) {
		if (s.xmax - s.xmin < t.xmax - t.xmin) return edgetouch(t, s);
		return (s.xmin < t.xmin && t.xmin < s.xmax && s.xmax < t.xmax && (s.xmax - t.xmin) / (s.xmax - s.xmin) <= 0.2)
			|| (t.xmin < s.xmin && s.xmin < t.xmax && t.xmax < s.xmax && (t.xmax - s.xmin) / (s.xmax - s.xmin) <= 0.2)
	};
	function between(t, m, b) {
		return t.xmin < m.xmin && m.xmax < t.xmax && b.xmin < m.xmin && m.xmax < b.xmax
	}
	var directOverlaps = (function () {
		var d = [];
		for (var j = 0; j < glyph.stemOverlaps.length; j++) {
			d[j] = [];
			for (var k = 0; k < j; k++) {
				d[j][k] = glyph.stemOverlaps[j][k] > strategy.COLLISION_MIN_OVERLAP_RATIO && !edgetouch(glyph.stems[j], glyph.stems[k])
			}
		};
		for (var x = 0; x < d.length; x++) for (var y = 0; y < d.length; y++) for (var z = 0; z < d.length; z++) {
			if (d[x][y] && d[y][z]) d[x][z] = false;
		};
		return d;
	})();
	var edgeTouches = (function () {
		var d = [];
		for (var j = 0; j < glyph.stemOverlaps.length; j++) {
			d[j] = [];
			for (var k = 0; k < j; k++) {
				d[j][k] = edgetouch(glyph.stems[j], glyph.stems[k]);
			}
		};
		return d;
	})();
	var overlaps = TransitionClosure(directOverlaps);
	var blanks = function () {
		var blanks = [];
		for (var j = 0; j < directOverlaps.length; j++) {
			blanks[j] = [];
			for (var k = 0; k < directOverlaps.length; k++) {
				blanks[j][k] = glyph.stems[j].yori - glyph.stems[j].width - glyph.stems[k].yori;
			}
		};
		return blanks;
	} ();
	var triplets = function () {
		var triplets = [];
		for (var j = 0; j < glyph.stems.length; j++) for (var k = 0; k < j; k++) for (var w = 0; w < k; w++) if (directOverlaps[j][k] && blanks[j][k] >= 0 && blanks[k][w] >= 0) {
			triplets.push([j, k, w, blanks[j][k] - blanks[k][w]]);
		};
		return triplets;
	} ();
	var flexes = function () {
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
	} ();
	return {
		stats: glyph.stats,
		stems: glyph.stems.map(function (s) {
			return {
				xmin: s.xmin,
				xmax: s.xmax,
				yori: s.yori,
				width: s.width,
				atGlyphTop: s.atGlyphTop,
				atGlyphBottom: s.atGlyphBottom,
				belongRadical: s.belongRadical,

				hasGlyphStemAbove: s.hasGlyphStemAbove,
				hasSameRadicalStemAbove: s.hasSameRadicalStemAbove,
				hasRadicalPointAbove: s.hasRadicalPointAbove,
				radicalCenterRise: s.radicalCenterRise,
				hasGlyphPointAbove: s.hasGlyphPointAbove,
				glyphCenterRise: s.glyphCenterRise,
				hasRadicalLeftAdjacentPointAbove: s.hasRadicalLeftAdjacentPointAbove,
				hasRadicalRightAdjacentPointAbove: s.hasRadicalRightAdjacentPointAbove,
				radicalRightAdjacentRise: s.radicalRightAdjacentRise,
				radicalLeftAdjacentRise: s.radicalLeftAdjacentRise,
				hasGlyphLeftAdjacentPointAbove: s.hasGlyphLeftAdjacentPointAbove,
				hasGlyphRightAdjacentPointAbove: s.hasGlyphRightAdjacentPointAbove,
				glyphRightAdjacentRise: s.glyphRightAdjacentRise,
				glyphLeftAdjacentRise: s.glyphLeftAdjacentRise,
				hasRadicalLeftDistancedPointAbove: s.hasRadicalLeftDistancedPointAbove,
				hasRadicalRightDistancedPointAbove: s.hasRadicalRightDistancedPointAbove,
				radicalRightDistancedRise: s.radicalRightDistancedRise,
				radicalLeftDistancedRise: s.radicalLeftDistancedRise,
				hasGlyphLeftDistancedPointAbove: s.hasGlyphLeftDistancedPointAbove,
				hasGlyphRightDistancedPointAbove: s.hasGlyphRightDistancedPointAbove,
				glyphRightDistancedRise: s.glyphRightDistancedRise,
				glyphLeftDistancedRise: s.glyphLeftDistancedRise,

				hasGlyphStemBelow: s.hasGlyphStemBelow,
				hasSameRadicalStemBelow: s.hasSameRadicalStemBelow,
				hasRadicalPointBelow: s.hasRadicalPointBelow,
				radicalCenterDescent: s.radicalCenterDescent,
				hasGlyphPointBelow: s.hasGlyphPointBelow,
				glyphCenterDescent: s.glyphCenterDescent,
				hasRadicalLeftAdjacentPointBelow: s.hasRadicalLeftAdjacentPointBelow,
				hasRadicalRightAdjacentPointBelow: s.hasRadicalRightAdjacentPointBelow,
				radicalLeftAdjacentDescent: s.radicalLeftAdjacentDescent,
				radicalRightAdjacentDescent: s.radicalRightAdjacentDescent,
				hasGlyphLeftAdjacentPointBelow: s.hasGlyphLeftAdjacentPointBelow,
				hasGlyphRightAdjacentPointBelow: s.hasGlyphRightAdjacentPointBelow,
				glyphLeftAdjacentDescent: s.glyphLeftAdjacentDescent,
				glyphRightAdjacentDescent: s.glyphRightAdjacentDescent,
				hasRadicalLeftDistancedPointBelow: s.hasRadicalLeftDistancedPointBelow,
				hasRadicalRightDistancedPointBelow: s.hasRadicalRightDistancedPointBelow,
				radicalLeftDistancedDescent: s.radicalLeftDistancedDescent,
				radicalRightDistancedDescent: s.radicalRightDistancedDescent,
				hasGlyphLeftDistancedPointBelow: s.hasGlyphLeftDistancedPointBelow,
				hasGlyphRightDistancedPointBelow: s.hasGlyphRightDistancedPointBelow,
				glyphLeftDistancedDescent: s.glyphLeftDistancedDescent,
				glyphRightDistancedDescent: s.glyphRightDistancedDescent,

				hasGlyphFoldBelow: s.hasGlyphFoldBelow,
				hasRadicalFoldBelow: s.hasRadicalFoldBelow,
				hasGlyphSideFoldBelow: s.hasGlyphSideFoldBelow,
				hasRadicalSideFoldBelow: s.hasRadicalSideFoldBelow,
				hasGlyphVFoldBelow: s.hasGlyphVFoldBelow,
				hasRadicalVFoldBelow: s.hasRadicalVFoldBelow,

				posKey: { id: s.posKey.id, yori: s.posKey.yori },
				advKey: { id: s.advKey.id, yori: s.advKey.yori },
				posAlign: s.posAlign.map(function (x) { return x.id }),
				advAlign: s.advAlign.map(function (x) { return x.id }),
				posKeyAtTop: s.posKeyAtTop
			}
		}),
		stemOverlaps: glyph.stemOverlaps,
		directOverlaps: directOverlaps,
		edgeTouches: edgeTouches,
		overlaps: overlaps,
		triplets: triplets,
		flexes: flexes,
		collisionMatrices: glyph.collisionMatrices,
		topBluePoints: topBluePoints.map(function (x) { return x.id }),
		bottomBluePoints: bottomBluePoints.map(function (x) { return x.id }),
		interpolations: interpolations,
		shortAbsorptions: shortAbsorptions
	}
}