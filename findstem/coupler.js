"use strict";

var overlapInfo = require("./overlap").overlapInfo;
var by_start = function (p, q) { return p[0].xori - q[0].xori; };
var minmaxOfSeg = require("./seg").minmaxOfSeg;
var slopeOf = require("../types").slopeOf;

function segmentJoinable(pivot, segment, radical) {
	for (var k = 0; k < pivot.length; k++) {
		for (var j = 0; j < segment.length; j++) {
			if (radical.includesSegment(segment[j], pivot[k])) {
				return true;
			}
		}
	}
	return false;
}

function isStrictlyHorizontal(u) {
	return u[0][0].yori === u[u.length - 1][u[u.length - 1].length - 1].yori;
}
function isVertical(radical, u, v) {
	var d1 = minmaxOfSeg(u);
	var d2 = minmaxOfSeg(v);
	return Math.max(d1.max, d2.max) - Math.min(d1.min, d2.min) < Math.abs(u[0][0].yori - v[0][0].yori) * 0.9;
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
			for (var k = 1; k < contour.points.length - 1; k++) if (!contour.points[k].interpolated) {
				if (Math.abs((contour.points[k].yori - lastPoint.yori) / (contour.points[k].xori - lastPoint.xori)) <= strategy.SLOPE_FUZZ) {
					segment.push(contour.points[k]);
					lastPoint = contour.points[k];
				} else {
					if (segment.length > 1) segments.push(segment);
					lastPoint = contour.points[k];
					segment = [lastPoint];
					segment.radical = r;
				}
			}
			if (Math.abs((contour.points[0].yori - lastPoint.yori) / (contour.points[0].xori - lastPoint.xori)) <= strategy.SLOPE_FUZZ) {
				segment.push(contour.points[0]);
				segment.push(contour.points[contour.points.length - 1]);
			}
			if (segment.length > 1) segments.push(segment);
		}
	}

	segments = segments.sort(function (p, q) { return p[0].xori - q[0].xori; });

	// Join segments
	for (var j = 0; j < segments.length; j++) if (segments[j]) {
		var pivotRadical = segments[j].radical;
		radicals[pivotRadical].segments.push(segments[j]);
	}
}

function uuCouplable(sj, sk, radical, strategy) {
	let slope = (slopeOf([sj]) + slopeOf([sk])) / 2;
	let desired = sj[0].yori + (sk[0].xori - sj[0].xori) * slope;
	let delta = Math.abs(sk[0].xori - sj[0].xori) * strategy.SLOPE_FUZZ_P + strategy.Y_FUZZ;
	return Math.abs(sk[0].yori - desired) <= delta && segmentJoinable(sj, sk, radical);
}
function udMatchable(sj, sk, radical, strategy) {
	return radical.includesTetragon(sj, sk);
}

function identifyStem(radical, used, segs, candidates, graph, up, j, strategy) {
	var candidate = {
		high: [],
		low: []
	};
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
			for (var k = 0; k < segs.length; k++) if (!used[k] && (up[k] !== up[j]) === (!!(pass % 2))) {
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
			for (var m = 0; m < candidate.high.length; m++) { highEdge[m] = segs[candidate.high[m]]; }
			for (var m = 0; m < candidate.low.length; m++) { lowEdge[m] = segs[candidate.low[m]]; }
			highEdge = highEdge.sort(by_xori);
			lowEdge = lowEdge.sort(by_xori).reverse();
			var segOverlap = overlapInfo(highEdge, lowEdge, strategy);
			var hasEnoughOverlap = (segOverlap.len / segOverlap.la >= strategy.COLLISION_MIN_OVERLAP_RATIO
				|| segOverlap.len / segOverlap.lb >= strategy.COLLISION_MIN_OVERLAP_RATIO);
			if (hasEnoughOverlap && !isVertical(radical, highEdge, lowEdge)) {
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
		if (rejected[k]) { used[k] = false; }
	}
}

function by_yori(a, b) { return b[0].yori - a[0].yori; }
function by_xori(a, b) { return b[0].yori - a[0].yori; }
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
		var upperEdgeJ = radical.outline.ccw !== (sj[0].xori < sj[sj.length - 1].xori);
		up[j] = upperEdgeJ;
		for (var k = 0; k < j; k++) {
			var sk = segs[k];
			var upperEdgeK = radical.outline.ccw !== (sk[0].xori < sk[sk.length - 1].xori);
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
	for (var j = 0; j < segs.length; j++)if (!used[j]) {
		identifyStem(radical, used, segs, candidates, graph, up, j, strategy);
	}
	return candidates.map(function (s) {
		return {
			high: s.high,
			low: s.low,
			yori: s.high[0][0].yori,
			width: Math.abs(s.high[0][0].yori - s.low[0][0].yori),
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
	return stems.sort(function (a, b) { return a.yori - b.yori; });
}

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
				stems[k] = null;
			}
		}
	}
	for (var j = 0; j < stems.length; j++) if (stems[j]) {
		res.push(stems[j]);
	}
	return res;
}

// diagonal split
function leftmostZ(segs) {
	let m = segs[0][0];
	for (let seg of segs) for (let z of seg) if (!m || z && z.xori < m.xori) m = z;
	return m;
}
function rightmostZ(segs) {
	let m = segs[0][0];
	for (let seg of segs) for (let z of seg) if (!m || z && z.xori > m.xori) m = z;
	return m;
}
function isDiagonal(hl, ll, hr, lr, strategy) {
	if (hl === hr || ll === lr) return false;
	if (hl.yori === hr.yori || ll.yori === lr.yori) return false;
	return Math.abs(hr.yori - hl.yori) >= Math.abs(hr.xori - hl.xori) * strategy.SLOPE_FUZZ_R
		&& Math.abs(lr.yori - ll.yori) >= Math.abs(lr.xori - ll.xori) * strategy.SLOPE_FUZZ_R
		&& Math.abs(hl.xori - ll.xori) * 6 <= Math.max(Math.abs(hl.xori - hr.xori), Math.abs(ll.xori - lr.xori))
		&& Math.abs(hr.xori - lr.xori) * 6 <= Math.max(Math.abs(hl.xori - hr.xori), Math.abs(ll.xori - lr.xori));
}
function linkIP(segs, hl, hr) {
	let ans = [];
	let unrel = [];
	for (let seg of segs) {
		let z = seg[0];
		if (z !== hl && z !== hr) { ans.push(z); }
		if (seg.length > 1 && seg[seg.length - 1] !== z) {
			let z = seg[seg.length - 1];
			if (z !== hl && z !== hr) { ans.push(z); }
		}
		for (let z of seg) if (z !== hl && z !== hr) unrel.push(z);
	}
	let res = { l: hl, r: hr, zs: ans, unrel: unrel }
	return res;
}
function splitDiagonalStem(s, strategy, rid, results) {
	let hl = leftmostZ(s.high);
	let ll = leftmostZ(s.low);
	let hr = rightmostZ(s.high);
	let lr = rightmostZ(s.low);
	if (isDiagonal(hl, ll, hr, lr, strategy)) {
		let hmx = (hl.xori + hr.xori) / 2;
		let lmx = (ll.xori + lr.xori) / 2;
		let hmy = (hl.yori + hr.yori) / 2;
		let lmy = (ll.yori + lr.yori) / 2;
		let sleft = {
			high: [[hl, { xori: hmx - 1, yori: hmy, on: true, id: -1 }]],
			low: [[ll, { xori: lmx - 1, yori: lmy, on: true, id: -1 }]],
			yori: hl.yori,
			width: hl.yori - ll.yori,
			belongRadical: s.belongRadical,
			rid: rid
		}
		let sright = {
			high: [[{ xori: hmx + 1, yori: hmy, on: true, id: -1 }, hr]],
			low: [[{ xori: lmx + 1, yori: lmy, on: true, id: -1 }, lr]],
			yori: hr.yori,
			width: hr.yori - lr.yori,
			belongRadical: s.belongRadical,
			atRight: true,
			linkedIPsHigh: linkIP(s.high, hl, hr),
			linkedIPsLow: linkIP(s.low, ll, lr),
			rid: rid
		}
		if (hl.yori > hr.yori) {
			sleft.diagHigh = true
			sright.diagLow = true
		} else {
			sright.diagHigh = true
			sleft.diagLow = true
		}
		results.push(sleft, sright);
	} else {
		results.push(s);
	}
}
function splitDiagonalStems(ss, strategy) {
	var ans = [];
	let rid = 1;
	for (let s of ss) {
		splitDiagonalStem(s, strategy, rid, ans);
		rid += 1;
	}
	return ans;
}

module.exports = function (radicals, strategy) {
	findHorizontalSegments(radicals, strategy);
	var ss = splitDiagonalStems(pairSymmetricStems(pairSegments(radicals, strategy), strategy), strategy);
	return ss;
};