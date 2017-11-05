"use strict";

const { adjacent, adjacentZ } = require("../types/point");

function BY_YORI(p, q) {
	return p.y - q.y;
}
let STEPS = 10;
function shortAbsorptionPointByKeys(shortAbsorptions, strategy, pt, keys, inSameRadical, priority) {
	if (pt.touched || pt.donttouch || !pt.on || !strategy.DO_SHORT_ABSORPTION || !inSameRadical)
		return;
	for (let m = 0; m < keys.length; m++) {
		let key = keys[m];
		if (
			key.blued &&
			key.yStrongExtrema &&
			(Math.hypot(pt.y - key.y, pt.x - key.x) <= strategy.ABSORPTION_LIMIT &&
				pt.xStrongExtrema) &&
			key.id !== pt.id
		) {
			while (key.linkedKey) key = key.linkedKey;
			shortAbsorptions.push([key.id, pt.id, priority + (pt.yExtrema ? 1 : 0)]);
			pt.touched = true;
			return;
		}
	}
}
function shortAbsorptionByKeys(shortAbsorptions, strategy, pts, keys, inSameRadical, priority) {
	for (let k = 0; k < pts.length; k++) {
		shortAbsorptionPointByKeys(
			shortAbsorptions,
			strategy,
			pts[k],
			keys,
			inSameRadical,
			priority
		);
	}
}
class IpSpan {
	constructor(y, xmin, xmax, link) {
		this.y = y;
		this.xmin = xmin;
		this.xmax = xmax;
		this.z = link;
	}
}

function linkRadicalSoleStemPoints(shortAbsorptions, strategy, radical, radicalStems, priority) {
	let radicalParts = [radical.outline].concat(radical.holes);
	let radicalPoints = [].concat.apply(
		[],
		radicalParts.map(function(c) {
			return c.points.slice(0, -1);
		})
	);
	for (let k = 0; k < radicalPoints.length; k++) {
		const z = radicalPoints[k];
		if (z.keypoint || z.touched || z.donttouch) continue;
		if (!z.xExtrema && !z.yExtrema) continue;
		let candidate = null;
		for (const stem of radicalStems) {
			let reject = false;
			let sc = null;
			const highpts = [].concat.apply([], stem.high);
			const lowpts = [].concat.apply([], stem.low);
			const keyPoints = highpts.concat(lowpts);
			for (let j = 0; j < keyPoints.length; j++) {
				let zkey = keyPoints[j];
				if (zkey.id === z.id || !(zkey.id >= 0) || zkey.donttouch) continue;
				if (adjacent(zkey, z) || adjacentZ(zkey, z)) {
					reject = true;
					continue;
				}
				if (
					Math.abs(z.y - zkey.y) <= strategy.Y_FUZZ &&
					Math.abs(z.x - zkey.x) <= strategy.Y_FUZZ
				) {
					continue;
				}
				if (stem.atLeft && z.x > zkey.x) continue;
				if (stem.atRight && z.x < zkey.x) continue;

				// detect whether this sole point is attached to the stem edge.
				// in most cases, absorbing a lower point should be stricter due to the topology of ideographs
				// so we use asymmetric condition for "above" and "below" cases.
				let yDifference = z.y - (zkey.y + (z.x - zkey.x) * (zkey.slope || 0));
				if (
					!(yDifference > 0
						? yDifference < strategy.Y_FUZZ * 2
						: -yDifference < strategy.Y_FUZZ)
				)
					continue;
				if (
					sc &&
					Math.hypot(z.y - sc.y, z.x - sc.x) <= Math.hypot(z.y - zkey.y, z.x - zkey.x)
				)
					continue;
				if (!radical.includesSegmentEdge(z, zkey, 1, strategy.SLOPE_FUZZ_K, 1, 1)) continue;
				sc = zkey;
			}
			if (
				!reject &&
				sc &&
				(!candidate ||
					Math.hypot(z.y - candidate.y, z.x - candidate.x) >=
						Math.hypot(z.y - sc.y, z.x - sc.x))
			) {
				candidate = sc;
			}
		}
		// And it should have at least one segment in the glyph's outline.'
		if (candidate) {
			let key = candidate;
			while (key.linkedKey) key = key.linkedKey;
			shortAbsorptions.push([key.id, z.id, priority + (z.yExtrema ? 1 : 0)]);
			z.touched = true;
		}
	}
}
function linkSoleStemPoints(shortAbsorptions, strategy, glyph, priority) {
	for (let j = 0; j < glyph.radicals.length; j++) {
		let radical = glyph.radicals[j];
		let radicalStems = glyph.stems.filter(function(s) {
			return s.belongRadical === j;
		});
		linkRadicalSoleStemPoints(shortAbsorptions, strategy, radical, radicalStems, priority);
	}
}

function interpolateBySpans(interpolations, knots, spans, priority) {
	for (let knot of knots) {
		if (knot.keypoint || knot.touched || knot.donttouch) continue;
		out: for (let j = 0; j < spans.length; j++) {
			for (let k = j - 1; k >= 0; k--) {
				if (!(spans[j].y > knot.y && spans[k].y < knot.y)) continue;
				if (!(spans[j].xmin <= knot.x && spans[j].xmax >= knot.x)) continue;
				if (!(spans[k].xmin <= knot.x && spans[k].xmax >= knot.x)) continue;
				interpolations.push([spans[j].z, spans[k].z, knot.id, priority]);
				knot.touched = true;
				break out;
			}
		}
	}
}

module.exports = function(glyph, blue, strategy) {
	let interpolations = [];
	let shortAbsorptions = [];
	let diagAligns = [];

	const upm = strategy.UPM;
	const contours = glyph.contours;

	for (let s of glyph.stems) {
		if (s.linkedIPsHigh) {
			diagAligns.push({
				l: s.linkedIPsHigh.l.id,
				r: s.linkedIPsHigh.r.id,
				zs: s.linkedIPsHigh.zs.map(z => z.id)
			});
		}
		if (s.linkedIPsLow) {
			diagAligns.push({
				l: s.linkedIPsLow.l.id,
				r: s.linkedIPsLow.r.id,
				zs: s.linkedIPsLow.zs.map(z => z.id)
			});
		}
	}

	let records = [];

	for (let j = 0; j < contours.length; j++) {
		const contourpoints = contours[j].points.slice(0, -1);
		const contourAlignPoints = contourpoints.filter(p => p.touched).sort(BY_YORI);
		const contourExtrema = contourpoints.filter(p => p.xExtrema || p.yExtrema).sort(BY_YORI);
		const blues = contourpoints.filter(p => p.blued);

		const pmin = contourExtrema[0],
			pmax = contourExtrema[contourExtrema.length - 1];

		if (contourExtrema.length > 1) {
			const innerExtrema = contourExtrema.slice(1, -1);
			let extrema = innerExtrema.filter(
				z => !z.touched && !z.donttouch && (z.yExtrema || (z.xStrongExtrema && z.turn))
			);
			let midex = [];
			for (let m = 0; m < extrema.length; m++) {
				if (extrema[m].y === pmin.y && extrema[m].id !== pmin.id) {
					if (!adjacent(pmin, extrema[m])) {
						shortAbsorptions.push([pmin.id, extrema[m].id, 1]);
					}
					extrema[m].touched = true;
					extrema[m].donttouch = true;
				} else if (extrema[m].y === pmax.y && extrema[m].id !== pmax.id) {
					if (!adjacent(pmax, extrema[m])) {
						shortAbsorptions.push([pmax.id, extrema[m].id, 1]);
					}
					extrema[m].touched = true;
					extrema[m].donttouch = true;
				} else if (extrema[m].id !== pmin.id && extrema[m].id !== pmax.id) {
					midex.push(extrema[m]);
				}
			}
			records.push({
				topbot: [pmin, pmax],
				midex: midex,
				midexl: innerExtrema.filter(p => p.xExtrema || p.yExtrema),
				blues: blues,
				cka: contourAlignPoints
			});
		} else {
			// Contour being a singleton
			records.push({
				topbot: [pmin],
				midex: [],
				midexl: [],
				blues: [],
				cka: contourAlignPoints
			});
		}
	}
	for (let j = 0; j < contours.length; j++) {
		shortAbsorptionByKeys(
			shortAbsorptions,
			strategy,
			records[j].topbot,
			records[j].cka,
			true,
			9,
			false
		);
		shortAbsorptionByKeys(
			shortAbsorptions,
			strategy,
			records[j].midexl,
			records[j].blues,
			true,
			1,
			false
		);
	}
	linkSoleStemPoints(shortAbsorptions, strategy, glyph, 7);

	const spans = [];

	for (let z of blue.bottomZs) {
		spans.push(new IpSpan(z.y, -upm, upm * 2, z.id));
	}
	for (let z of blue.topZs) {
		spans.push(new IpSpan(z.y, -upm, upm * 2, z.id));
	}
	for (let s of glyph.stems) {
		const highkey = s.posKeyAtTop ? s.posKey : s.advKey;
		const lowkey = s.posKeyAtTop ? s.advKey : s.posKey;
		spans.push(new IpSpan(s.y, s.xmin, s.xmax, highkey.id));
		spans.push(new IpSpan(s.y - s.width, s.xmin, s.xmax, lowkey.id));
	}
	spans.sort((a, b) => a.y - b.y);
	for (let j = 0; j < contours.length; j++) {
		interpolateBySpans(interpolations, records[j].topbot, spans, 5);
	}
	for (let j = 0; j < contours.length; j++) {
		for (let z of records[j].topbot) {
			if (z.touched) spans.push(new IpSpan(z.y, contours[j].xmin, contours[j].xmax, z.id));
		}
	}
	for (let j = 0; j < contours.length; j++) {
		interpolateBySpans(interpolations, records[j].midex, spans, 3);
	}
	interpolations = interpolations.sort(function(u, v) {
		return glyph.indexedPoints[u[2]].x - glyph.indexedPoints[v[2]].x;
	});
	// cleanup
	for (let j = 0; j < interpolations.length; j++) {
		if (!interpolations[j]) continue;
		for (let k = j + 1; k < interpolations.length; k++) {
			if (
				interpolations[k] &&
				interpolations[j][0] === interpolations[k][0] &&
				interpolations[j][1] === interpolations[k][1] &&
				interpolations[j][3] === interpolations[k][3] &&
				interpolations[j][3] !== 9 &&
				Math.abs(
					glyph.indexedPoints[interpolations[j][2]].y -
						glyph.indexedPoints[interpolations[k][2]].y
				) <= strategy.Y_FUZZ
			) {
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
		interpolations: interpolations.filter(x => x),
		shortAbsorptions: shortAbsorptions.filter(a => a[0] !== a[1]),
		diagAligns: diagAligns
	};
};
