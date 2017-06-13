"use strict";

const overlapInfo = require("./overlap").overlapInfo;
const by_start = function(p, q) {
	return p[0].x - q[0].x;
};
const minmaxOfSeg = require("./seg").minmaxOfSeg;
const slopeOf = require("../types").slopeOf;
const splitDiagonalStems = require("./splitting").splitDiagonalStems;
const hlkey = require("./hlkey");
const { leftmostZ_SS: leftmostZ, rightmostZ_SS: rightmostZ } = require("../support/common");

const monoip = require("../support/monotonic-interpolate");
function toVQ(v, ppem) {
	if (v && v instanceof Array) {
		return monoip(v)(ppem);
	} else {
		return v;
	}
}

function segmentJoinable(pivot, segment, radical) {
	for (var k = 0; k < pivot.length; k++) {
		for (var j = 0; j < segment.length; j++) {
			if (radical.includesSegmentEdge(segment[j], pivot[k], 2, 2, 1, 1)) {
				return true;
			}
		}
	}
	return false;
}

function isStrictlyHorizontal(u) {
	return u[0][0].y === u[u.length - 1][u[u.length - 1].length - 1].y;
}
function isVertical(radical, u, v, mh) {
	var d1 = minmaxOfSeg(u);
	var d2 = minmaxOfSeg(v);
	let p = leftmostZ(u);
	let q = leftmostZ(v);
	return (
		Math.abs(p.y - q.y) > mh ||
		Math.max(d1.max, d2.max) - Math.min(d1.min, d2.min) < Math.abs(p.y - q.y) * 0.9
	);
}

function approSlope(z1, z2, strategy) {
	const slope = (z1.y - z2.y) / (z1.x - z2.x);
	return slope >= 0 ? slope <= strategy.SLOPE_FUZZ_POS : slope >= -strategy.SLOPE_FUZZ_NEG;
}

function approSlopeT(z1, z2, strategy) {
	const slope = (z1.y - z2.y) / (z1.x - z2.x);
	return (
		Math.abs(z2.x - z1.x) >= strategy.Y_FUZZ * 2 &&
		(slope >= 0 ? slope <= strategy.SLOPE_FUZZ : slope >= -strategy.SLOPE_FUZZ_NEG)
	);
}

function tryPushSegment(s, ss, strategy) {
	while (s.length > 1) {
		if (approSlopeT(s[0], s[s.length - 1], strategy)) {
			ss.push(s);
			return;
		} else {
			s = s.shift();
		}
	}
}

// Stemfinding
function findHorizontalSegments(radicals, strategy) {
	var segments = [];
	for (var r = 0; r < radicals.length; r++) {
		radicals[r].mergedSegments = [];
		var radicalParts = [radicals[r].outline].concat(radicals[r].holes);
		for (var j = 0; j < radicalParts.length; j++) {
			var contour = radicalParts[j];
			var lastPoint = contour.points[0];
			var segment = [lastPoint];
			segment.radical = r;
			for (var k = 1; k < contour.points.length - 1; k++)
				if (!contour.points[k].interpolated) {
					if (approSlope(contour.points[k], lastPoint, strategy)) {
						segment.push(contour.points[k]);
						lastPoint = contour.points[k];
					} else {
						tryPushSegment(segment, segments, strategy);
						lastPoint = contour.points[k];
						segment = [lastPoint];
						segment.radical = r;
					}
				}
			if (approSlope(contour.points[0], lastPoint, strategy)) {
				if (segments[0] && segments[0][0] === contour.points[0]) {
					const firstSeg = segment.concat(segments.shift());
					firstSeg.radical = r;
					tryPushSegment(firstSeg, segments, strategy);
					segment = [contour.points[0]];
					segment.radical = r;
				} else {
					segment.push(contour.points[0]);
				}
			}
			tryPushSegment(segment, segments, strategy);
		}
	}

	segments = segments.sort(function(p, q) {
		return p[0].x - q[0].x;
	});
	// Join segments
	for (var j = 0; j < segments.length; j++)
		if (segments[j]) {
			var pivotRadical = segments[j].radical;
			radicals[pivotRadical].segments.push(segments[j]);
		}
}

function uuCouplable(sj, sk, radical, strategy) {
	let slope = (slopeOf([sj]) + slopeOf([sk])) / 2;
	let ref = leftmostZ([sj]);
	let focus = leftmostZ([sk]);
	let desired = ref.y + (focus.x - ref.x) * slope;
	let delta = Math.abs(focus.x - ref.x) * strategy.SLOPE_FUZZ_P + strategy.Y_FUZZ;
	//console.log("UU", sj.map(z => z.id), sk.map(z => z.id),
	//	focus.x, focus.y, desired, segmentJoinable(sj, sk, radical));
	return Math.abs(focus.y - desired) <= delta && segmentJoinable(sj, sk, radical);
}
function udMatchable(sj, sk, radical, strategy) {
	//console.log("UD", sj.map(z => z.id), sk.map(z => z.id), radical.includesTetragon(sj, sk));
	return (
		radical.includesTetragon(sj, sk) &&
		!(!!slopeOf([sj]) !== !!slopeOf([sk]) &&
			Math.abs(slopeOf([sj]) - slopeOf([sk])) >= strategy.SLOPE_FUZZ / 2)
	);
}

function identifyStem(radical, used, segs, candidates, graph, up, j, strategy) {
	var candidate = { high: [], low: [] };
	const maxh =
		toVQ(strategy.CANONICAL_STEM_WIDTH, strategy.PPEM_MAX) *
		strategy.CANONICAL_STEM_WIDTH_LIMIT_X;
	var strat, end, delta;
	if (up[j]) {
		candidate.high.push(j);
	} else {
		candidate.low.push(j);
	}
	var rejected = [];
	used[j] = true;
	var succeed = false;
	var foundMatch = false;
	var rounds = 0;
	while (!foundMatch && rounds < 3) {
		rounds += 1;
		var expandingU = false;
		var expandingD = true;
		var pass = 0;
		while (expandingU || expandingD) {
			pass += 1;
			if (pass % 2) {
				expandingD = false;
			} else {
				expandingU = false;
			}
			for (var k = 0; k < segs.length; k++)
				if (!used[k] && up[k] !== up[j] === !!(pass % 2)) {
					var sameSide, otherSide;
					if (up[k]) {
						sameSide = candidate.high;
						otherSide = candidate.low;
					} else {
						sameSide = candidate.low;
						otherSide = candidate.high;
					}
					var matchD = true;
					var matchU = !sameSide.length;
					for (var s = 0; s < sameSide.length; s++) {
						var hj = sameSide[s];
						if (graph[k][hj] === 1 || graph[hj][k] === 1) matchU = true;
					}
					for (var s = 0; s < otherSide.length; s++) {
						var hj = otherSide[s];
						if (graph[k][hj] !== 2 && graph[hj][k] !== 2) matchD = false;
					}
					if (matchU && matchD) {
						sameSide.push(k);
						if (pass % 2) {
							expandingD = true;
						} else {
							expandingU = true;
						}
						used[k] = true;
					}
				}
		}
		if (candidate.high.length && candidate.low.length) {
			foundMatch = true;
			var highEdge = [];
			var lowEdge = [];
			for (var m = 0; m < candidate.high.length; m++) {
				highEdge[m] = segs[candidate.high[m]];
			}
			for (var m = 0; m < candidate.low.length; m++) {
				lowEdge[m] = segs[candidate.low[m]];
			}
			highEdge = highEdge.sort(by_xori);
			lowEdge = lowEdge.sort(by_xori).reverse();
			var segOverlap = overlapInfo(highEdge, lowEdge, strategy);
			var hasEnoughOverlap =
				segOverlap.len / segOverlap.la >= strategy.COLLISION_MIN_OVERLAP_RATIO ||
				segOverlap.len / segOverlap.lb >= strategy.COLLISION_MIN_OVERLAP_RATIO;
			if (hasEnoughOverlap && !isVertical(radical, highEdge, lowEdge, maxh)) {
				succeed = true;
				candidates.push({
					high: highEdge,
					low: lowEdge
				});
			}
		}

		if (foundMatch && !succeed) {
			// We found a stem match, but it is not good enough.
			// We will "reject" the corresponded edge for now, and release them in the future
			if (up[j]) {
				for (var k = 0; k < candidate.low.length; k++) {
					rejected[candidate.low[k]] = true;
				}
				candidate.low = [];
			} else {
				for (var k = 0; k < candidate.high.length; k++) {
					rejected[candidate.high[k]] = true;
				}
				candidate.high = [];
			}
			foundMatch = false;
		}
	}
	for (var k = 0; k < segs.length; k++) {
		if (rejected[k]) {
			used[k] = false;
		}
	}
}

function by_yori(a, b) {
	return b[0].y - a[0].y;
}
function by_xori(a, b) {
	return b[0].y - a[0].y;
}
function pairSegmentsForRadical(radical, r, strategy) {
	var graph = [], up = [];
	var segs = radical.segments.sort(by_yori);
	for (var j = 0; j < segs.length; j++) {
		graph[j] = [];
		for (var k = 0; k < segs.length; k++) {
			graph[j][k] = 0;
		}
	}
	for (var j = 0; j < segs.length; j++) {
		var sj = segs[j];
		var upperEdgeJ = radical.outline.ccw !== sj[0].x < sj[sj.length - 1].x;
		up[j] = upperEdgeJ;
		for (var k = 0; k < j; k++) {
			var sk = segs[k];
			var upperEdgeK = radical.outline.ccw !== sk[0].x < sk[sk.length - 1].x;
			if (upperEdgeJ === upperEdgeK) {
				// Both upper
				graph[j][k] = uuCouplable(sj, sk, radical, strategy) ? 1 : 0;
			} else {
				graph[j][k] = udMatchable(sj, sk, radical, strategy) ? 2 : 0;
			}
		}
	}
	var candidates = [];
	var used = [];
	for (var j = 0; j < segs.length; j++)
		if (!used[j]) {
			identifyStem(radical, used, segs, candidates, graph, up, j, strategy);
		}
	return candidates.map(function(s) {
		return {
			high: s.high,
			low: s.low,
			y: s.high[0][0].y,
			width: Math.abs(s.high[0][0].y - s.low[0][0].y),
			belongRadical: r
		};
	});
}

function pairSegments(radicals, strategy) {
	var stems = [];
	for (var r = 0; r < radicals.length; r++) {
		var radicalStems = pairSegmentsForRadical(radicals[r], r, strategy);
		stems = stems.concat(radicalStems);
		radicals[r].stems = radicalStems;
	}
	return stems.sort(function(a, b) {
		return a.y - b.y;
	});
}

// Symmetric stem pairing
function pairSymmetricStems(stems, strategy) {
	var res = [];
	for (var j = 0; j < stems.length; j++) {
		for (var k = j + 1; k < stems.length; k++)
			if (stems[j] && stems[k]) {
				var delta1 = stems[j].belongRadical === stems[k].belongRadical ? 0.002 : 0.005;
				var delta2 = stems[j].belongRadical === stems[k].belongRadical ? 0.001 : 0.003;
				if (
					Math.abs(stems[j].y - stems[j].width / 2 - stems[k].y + stems[k].width / 2) <=
						strategy.UPM * delta1 &&
					Math.abs(stems[j].width - stems[k].width) <= strategy.UPM * delta1
				) {
					stems[j].high = stems[j].high.concat(stems[k].high);
					stems[j].low = stems[j].low.concat(stems[k].low);
					stems[k] = null;
				}
			}
	}
	for (var j = 0; j < stems.length; j++)
		if (stems[j]) {
			res.push(stems[j]);
		}
	return res;
}

module.exports = function(radicals, strategy) {
	findHorizontalSegments(radicals, strategy);
	let ss = pairSegments(radicals, strategy);
	ss = pairSymmetricStems(ss, strategy);
	ss = splitDiagonalStems(ss, strategy);
	ss = hlkey.correctYW(ss, strategy);
	return ss;
};
