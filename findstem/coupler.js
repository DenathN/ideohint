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
const { xclamp } = require("../support/common");

const monoip = require("../support/monotonic-interpolate");
function toVQ(v, ppem) {
	if (v && v instanceof Array) {
		return monoip(v)(ppem);
	} else {
		return v;
	}
}

function segmentJoinable(pivot, segment, radical) {
	for (let k = 0; k < pivot.length; k++) {
		for (let j = 0; j < segment.length; j++) {
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
function isVertical(radical, u, v, mh, ov) {
	let d1 = minmaxOfSeg(u);
	let d2 = minmaxOfSeg(v);
	let p = leftmostZ(u);
	let q = leftmostZ(v);

	return (
		Math.abs(p.y - q.y) > mh ||
		(Math.max(d1.max, d2.max) - Math.min(d1.min, d2.min)) * ov < Math.abs(p.y - q.y) * 0.9
	);
}

function approSlope(z1, z2, strategy) {
	const slope = (z1.y - z2.y) / (z1.x - z2.x);
	return slope >= 0 ? slope <= strategy.SLOPE_FUZZ_POS : slope >= -strategy.SLOPE_FUZZ_NEG;
}

function eqSlopeA(z1, z2) {
	return z1.y === z2.y && ((z1.on && z2.on) || (!z1.on && !z2.on));
}

function approSlopeA(z1, z2, strategy) {
	const slope = (z1.y - z2.y) / (z1.x - z2.x);
	const sprop = xclamp(0, Math.abs(z1.x - z2.x) / strategy.UPM * 2, 1);
	return (
		Math.abs(z2.x - z1.x) >= strategy.Y_FUZZ * 2 &&
		(slope >= 0
			? slope <= strategy.SLOPE_FUZZ * sprop
			: slope >= -strategy.SLOPE_FUZZ_NEG * sprop)
	);
}

function approSlopeT(z1, z2, strategy) {
	const slope = (z1.y - z2.y) / (z1.x - z2.x);
	return slope >= 0 ? slope <= strategy.SLOPE_FUZZ_POST : slope >= -strategy.SLOPE_FUZZ_NEG;
}

function tryPushSegment(s, ss, approSlopeA, coupled, strategy) {
	while (s.length > 1) {
		if (approSlopeA(s[0], s[s.length - 1], strategy)) {
			for (let z of s) {
				coupled[z.id] = true;
			}
			ss.push(s);
			return;
		} else {
			s = s.shift();
		}
	}
}

function findHSegInContour(r, segments, contour, strategy) {
	function restart(z) {
		lastPoint = z;
		segment = [lastPoint];
		segment.radical = r;
	}
	let coupled = {};
	let z0 = contour.points[0];
	let lastPoint = z0;
	let segment = [lastPoint];
	for (let [as1, as1t, as2] of [
		[eqSlopeA, eqSlopeA, eqSlopeA],
		[approSlope, approSlopeT, approSlopeA]
	]) {
		restart(z0);
		let tores = false;
		for (let k = 1; k < contour.points.length - 1; k++) {
			const z = contour.points[k];
			if (tores || z.interpolated || coupled[lastPoint.id]) {
				restart(z);
				tores = false;
			} else if (!coupled[z.id] && as1t(z, lastPoint, strategy)) {
				segment.push(z);
				if (segment.length > 2 && !as1(z, lastPoint, strategy)) {
					tryPushSegment(segment, segments, as2, coupled, strategy);
					tores = true;
				} else {
					lastPoint = z;
					tores = false;
				}
			} else {
				tryPushSegment(segment, segments, as2, coupled, strategy);
				restart(z);
				tores = false;
			}
		}
		if (!coupled[z0.id] && as1(z0, lastPoint, strategy)) {
			if (segments[0] && segments[0][0] === z0) {
				const firstSeg = segment.concat(segments.shift());
				firstSeg.radical = r;
				tryPushSegment(firstSeg, segments, as2, coupled, strategy);
				segment = [z0];
				segment.radical = r;
			} else {
				segment.push(z0);
			}
		}
		tryPushSegment(segment, segments, as2, coupled, strategy);
	}
}

// Stemfinding
function findHorizontalSegments(radicals, strategy) {
	let segments = [];
	for (let r = 0; r < radicals.length; r++) {
		let radicalParts = [radicals[r].outline].concat(radicals[r].holes);
		for (let j = 0; j < radicalParts.length; j++) {
			findHSegInContour(r, segments, radicalParts[j], strategy);
		}
	}

	segments = segments.sort(function(p, q) {
		return p[0].x - q[0].x;
	});
	// Join segments
	for (let j = 0; j < segments.length; j++) {
		if (!segments[j]) continue;
		let pivotRadical = segments[j].radical;
		radicals[pivotRadical].segments.push(segments[j]);
	}
}

function uuCouplable(sj, sk, radical, strategy) {
	let slope = (slopeOf([sj]) + slopeOf([sk])) / 2;
	let ref = leftmostZ([sj]);
	let focus = leftmostZ([sk]);
	let desired = ref.y + (focus.x - ref.x) * slope;
	let delta = Math.abs(focus.x - ref.x) * strategy.SLOPE_FUZZ_P + strategy.Y_FUZZ;
	return Math.abs(focus.y - desired) <= delta && segmentJoinable(sj, sk, radical);
}
function udMatchable(sj, sk, radical, strategy) {
	return (
		radical.includesTetragon(sj, sk) &&
		!(
			!!slopeOf([sj]) !== !!slopeOf([sk]) &&
			Math.abs(slopeOf([sj]) - slopeOf([sk])) >= strategy.SLOPE_FUZZ / 2
		)
	);
}

function identifyStem(radical, used, segs, candidates, graph, up, j, strategy) {
	let candidate = { high: [], low: [] };
	const maxh =
		toVQ(strategy.CANONICAL_STEM_WIDTH, strategy.PPEM_MAX) *
		strategy.CANONICAL_STEM_WIDTH_LIMIT_X;
	let strat, end, delta;
	if (up[j]) {
		candidate.high.push(j);
	} else {
		candidate.low.push(j);
	}
	let rejected = [];
	used[j] = true;
	let succeed = false;
	let foundMatch = false;
	let rounds = 0;
	while (!foundMatch && rounds < 3) {
		rounds += 1;
		let expandingU = false;
		let expandingD = true;
		let pass = 0;
		while (expandingU || expandingD) {
			pass += 1;
			if (pass % 2) {
				expandingD = false;
			} else {
				expandingU = false;
			}
			for (let k = 0; k < segs.length; k++)
				if (!used[k] && up[k] !== up[j] === !!(pass % 2)) {
					let sameSide, otherSide;
					if (up[k]) {
						sameSide = candidate.high;
						otherSide = candidate.low;
					} else {
						sameSide = candidate.low;
						otherSide = candidate.high;
					}
					let matchD = true;
					let matchU = !sameSide.length;
					for (let s = 0; s < sameSide.length; s++) {
						let hj = sameSide[s];
						if (graph[k][hj] === 1 || graph[hj][k] === 1) matchU = true;
					}
					for (let s = 0; s < otherSide.length; s++) {
						let hj = otherSide[s];
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
			let highEdge = [];
			let lowEdge = [];
			for (let m = 0; m < candidate.high.length; m++) {
				highEdge[m] = segs[candidate.high[m]];
			}
			for (let m = 0; m < candidate.low.length; m++) {
				lowEdge[m] = segs[candidate.low[m]];
			}
			highEdge = highEdge.sort(by_xori);
			lowEdge = lowEdge.sort(by_xori).reverse();
			let segOverlap = overlapInfo(highEdge, lowEdge, strategy);
			let hasEnoughOverlap =
				segOverlap.len / segOverlap.la >= strategy.COLLISION_MIN_OVERLAP_RATIO ||
				segOverlap.len / segOverlap.lb >= strategy.COLLISION_MIN_OVERLAP_RATIO;
			if (
				hasEnoughOverlap &&
				!isVertical(
					radical,
					highEdge,
					lowEdge,
					maxh,
					Math.max(segOverlap.len / segOverlap.la, segOverlap.len / segOverlap.lb)
				)
			) {
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
				for (let k = 0; k < candidate.low.length; k++) {
					rejected[candidate.low[k]] = true;
				}
				candidate.low = [];
			} else {
				for (let k = 0; k < candidate.high.length; k++) {
					rejected[candidate.high[k]] = true;
				}
				candidate.high = [];
			}
			foundMatch = false;
		}
	}
	for (let k = 0; k < segs.length; k++) {
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
	let graph = [],
		up = [];
	let segs = radical.segments.sort(by_yori);
	for (let j = 0; j < segs.length; j++) {
		graph[j] = [];
		for (let k = 0; k < segs.length; k++) {
			graph[j][k] = 0;
		}
	}
	for (let j = 0; j < segs.length; j++) {
		let sj = segs[j];
		let upperEdgeJ = radical.outline.ccw !== sj[0].x < sj[sj.length - 1].x;
		up[j] = upperEdgeJ;
		for (let k = 0; k < j; k++) {
			let sk = segs[k];
			let upperEdgeK = radical.outline.ccw !== sk[0].x < sk[sk.length - 1].x;
			if (upperEdgeJ === upperEdgeK) {
				// Both upper
				graph[j][k] = uuCouplable(sj, sk, radical, strategy) ? 1 : 0;
			} else {
				graph[j][k] = udMatchable(sj, sk, radical, strategy) ? 2 : 0;
			}
		}
	}
	let candidates = [];
	let used = [];
	for (let j = 0; j < segs.length; j++)
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
	let stems = [];
	for (let r = 0; r < radicals.length; r++) {
		let radicalStems = pairSegmentsForRadical(radicals[r], r, strategy);
		stems = stems.concat(radicalStems);
		radicals[r].stems = radicalStems;
	}
	return stems.sort(function(a, b) {
		return a.y - b.y;
	});
}

// Symmetric stem pairing
function pairSymmetricStems(stems, strategy) {
	let res = [];
	for (let j = 0; j < stems.length; j++) {
		for (let k = j + 1; k < stems.length; k++)
			if (stems[j] && stems[k]) {
				let delta1 = stems[j].belongRadical === stems[k].belongRadical ? 0.002 : 0.005;
				let delta2 = stems[j].belongRadical === stems[k].belongRadical ? 0.001 : 0.003;
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
	for (let j = 0; j < stems.length; j++)
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
