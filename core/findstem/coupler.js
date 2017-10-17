"use strict";

const { overlapInfo, overlapRatio } = require("./overlap");
const slopeOf = require("../types/").slopeOf;
const splitDiagonalStems = require("./splitting").splitDiagonalStems;
const hlkey = require("./hlkey");
const { leftmostZ_SS: leftmostZ, rightmostZ_SS: rightmostZ, expandZ } = require("./seg");
const { xclamp, mix, mixz } = require("../../support/common");

const monoip = require("../../support/monotonic-interpolate");
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

const PROPORTION = 1.5;
const PROBES = 8;

function testExpandRho(rho, p, q, coP, coQ, slope1, slope2, radical, upm) {
	const left = expandZ(radical, mixz(p, q, rho), -1, -mix(slope1, slope2, rho), upm);
	const right = expandZ(radical, mixz(coP, coQ, rho), 1, mix(slope1, slope2, rho), upm);
	return right.x - left.x < Math.abs(p.y - q.y) * PROPORTION;
}

function isVertical(radical, strategy, u, v, mh) {
	const p = leftmostZ(u);
	const q = leftmostZ(v);
	const coP = rightmostZ(u);
	const coQ = rightmostZ(v);
	const upm = strategy.UPM;
	const sprop = xclamp(0, (Math.max(coP.x, coQ.x) - Math.min(p.x, q.x)) / strategy.UPM * 2, 1);

	const slope1 = slopeOf(u),
		slope2 = slopeOf(v),
		slope = (slope1 + slope2) / 2;
	if (slope >= 0 ? slope > strategy.SLOPE_FUZZ * sprop : slope < -strategy.SLOPE_FUZZ_NEG * sprop)
		return true;
	if (Math.abs(p.y - q.y) > mh) return true;

	if (
		coP.x - p.x >= Math.abs(p.y - q.y) * PROPORTION &&
		coQ.x - q.x >= Math.abs(p.y - q.y) * PROPORTION
	)
		return false;
	// do some expansion
	if (testExpandRho(0, p, q, coP, coQ, slope1, slope2, radical, upm)) return true;
	if (testExpandRho(1, p, q, coP, coQ, slope1, slope2, radical, upm)) return true;
	for (let rho = 1; rho < PROBES; rho++) {
		if (testExpandRho(rho / PROBES, p, q, coP, coQ, slope1, slope2, radical, upm)) return true;
	}
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
	return (
		Math.abs(z2.x - z1.x) >= strategy.Y_FUZZ * 2 &&
		(slope >= 0 ? slope <= strategy.SLOPE_FUZZ : slope >= -strategy.SLOPE_FUZZ_NEG)
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
	if (!radical.includesTetragon(sj, sk, strategy.X_FUZZ)) return false;
	const slopeJ = slopeOf([sj]);
	const slopeK = slopeOf([sk]);
	if (!!slopeJ !== !!slopeK && Math.abs(slopeJ - slopeK) >= strategy.SLOPE_FUZZ / 2) return false;
	return true;
}

const MATCH_OPPOSITE = 1;
const MATCH_SAME_SIDE = 2;

function identifyStem(radical, used, segs, candidates, graph, ove, up, j, strategy) {
	let candidate = { high: [], low: [] };
	const maxh =
		toVQ(strategy.CANONICAL_STEM_WIDTH, strategy.PPEM_MAX) *
		strategy.CANONICAL_STEM_WIDTH_LIMIT_X;
	if (up[j]) {
		candidate.high.push(j);
	} else {
		candidate.low.push(j);
	}
	used[j] = true;
	let rejected = [];
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
			let possibleStems = [];
			for (let k = 0; k < segs.length; k++) {
				if (used[k] || (up[k] !== up[j]) !== !!(pass % 2)) continue;
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
					if (graph[k][hj] === MATCH_SAME_SIDE || graph[hj][k] === MATCH_SAME_SIDE)
						matchU = true;
				}
				for (let s = 0; s < otherSide.length; s++) {
					let hj = otherSide[s];
					if (graph[k][hj] !== MATCH_OPPOSITE && graph[hj][k] !== MATCH_OPPOSITE)
						matchD = false;
				}
				if (matchU && matchD) {
					let oveK = 0;
					for (let j of otherSide) oveK = Math.max(oveK, ove[j][k]);
					possibleStems.push({ sid: k, ove: oveK, sameSide, otherSide });
				}
			}
			possibleStems = possibleStems.sort((a, b) => b.ove - a.ove);
			for (let sk of possibleStems) {
				sk.sameSide.push(sk.sid);
				if (pass % 2) {
					expandingD = true;
				} else {
					expandingU = true;
				}
				used[sk.sid] = true;
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
			let segOverlap = overlapInfo(highEdge, lowEdge, radical);
			let hasEnoughOverlap =
				segOverlap.len / segOverlap.la >= strategy.COLLISION_MIN_OVERLAP_RATIO ||
				segOverlap.len / segOverlap.lb >= strategy.COLLISION_MIN_OVERLAP_RATIO;
			if (hasEnoughOverlap && !isVertical(radical, strategy, highEdge, lowEdge, maxh)) {
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
	return a[0].y - b[0].y;
}
function by_xori(a, b) {
	return a[0].x - b[0].x;
}
function pairSegmentsForRadical(radical, r, strategy) {
	let graph = [],
		ove = [],
		up = [];
	let segs = radical.segments.sort(by_yori);
	for (let j = 0; j < segs.length; j++) {
		graph[j] = [];
		ove[j] = [];
		for (let k = 0; k < segs.length; k++) {
			graph[j][k] = 0;
			ove[j][k] = 0;
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
				graph[j][k] = uuCouplable(sj, sk, radical, strategy) ? MATCH_SAME_SIDE : 0;
			} else {
				graph[j][k] = udMatchable(sj, sk, radical, strategy) ? MATCH_OPPOSITE : 0;
			}
			ove[j][k] = overlapRatio([sj], [sk], Math.min);
		}
	}
	let candidates = [];
	let used = [];
	for (let j = 0; j < segs.length; j++)
		if (!used[j]) {
			identifyStem(radical, used, segs, candidates, graph, ove, up, j, strategy);
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
