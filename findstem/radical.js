"use strict";

function Radical(outline) {
	this.outline = outline;
	this.holes = [];
	this.subs = [];
	this.segments = [];
}
Radical.prototype.includes = function (z) {
	if (!this.outline.includesPoint(z)) return false;
	for (var j = 0; j < this.holes.length; j++) {
		if (this.holes[j].includesPoint(z)) return false;
	}
	return true;
};
Radical.prototype.includesSegment = function (z1, z2) {
	var SEGMENTS = 64;
	for (var s = 1; s < SEGMENTS; s++) {
		var testz = {
			x: z2.x + (z1.x - z2.x) * (s / SEGMENTS),
			y: z2.y + (z1.y - z2.y) * (s / SEGMENTS)
		};
		if (!this.includes(testz)) {
			return false;
		}
	}
	return true;
};
Radical.prototype.includesSegmentEdge = function (z1, z2, um, delta) {
	if (this.includesSegment(z1, z2)) {
		return true;
	}
	for (var u1 = -um; u1 <= um; u1++) for (var u2 = -um; u2 <= um; u2++)
		for (var u3 = -um; u3 <= um; u3++) for (var u4 = -um; u4 <= um; u4++) {
			var z1a = { x: z1.x + u1 * delta, y: z1.y + u2 * delta };
			var z2a = { x: z2.x + u3 * delta, y: z2.y + u4 * delta };
			if (this.includesSegment(z1a, z2a)) {
				return true;
			}
		}
	return false;
};

function mixz(p, q, x) {
	return { x: p.x + (q.x - p.x) * x, y: p.y + (q.y - p.y) * x }
}

Radical.prototype.includesTetragon = function (s1, s2) {
	var steps = 32, val = 0, tot = 0;

	for (var u = 0; u < s1.length - 1; u++) {
		for (var v = 0; v < s2.length - 1; v++) {
			var p = s1[u], q = s1[u + 1];
			var r = s2[v], s = s2[v + 1];
			if (p.x > q.x) {
				var t = p;
				p = q; q = t;
			}
			if (r.x > s.x) {
				var t = r;
				r = s; s = t;
			}
			if (
				!this.includesSegmentEdge(mixz(p, q, 1 / 5), mixz(r, s, 1 / 5), 1, 1)
				|| !this.includesSegmentEdge(mixz(p, q, 1 / 2), mixz(r, s, 1 / 2), 1, 1)
				|| !this.includesSegmentEdge(mixz(p, q, 4 / 5), mixz(r, s, 4 / 5), 1, 1)
				|| !this.includesSegmentEdge(p, s, 2, 1)
				|| !this.includesSegmentEdge(q, r, 2, 1)
				|| !this.includesSegmentEdge(p, r, 2, 5)
				|| !this.includesSegmentEdge(q, s, 2, 5)
			) {
				return false;
			}
		}
	}
	return true;
};
function transitiveReduce(g) {
	// Floyd-warshall transitive reduction
	for (var x = 0; x < g.length; x++) for (var y = 0; y < g.length; y++) for (var z = 0; z < g.length; z++) {
		if (g[x][y] && g[y][z]) g[x][z] = false;
	}
}

function inclusionToRadicals(inclusions, contours, j, orient) {
	var radicals;
	if (orient) {
		// contours[j] is an inner contour
		// find out radicals inside it
		radicals = [];
		for (var k = 0; k < contours.length; k++) if (inclusions[j][k]) {
			if (contours[k].ccw !== orient) {
				radicals = radicals.concat(inclusionToRadicals(inclusions, contours, k, !orient));
			}
		}
		return radicals;
	} else {
		// contours[j] is an outer contour
		// find out its inner contours and radicals inside it
		var radical = new Radical(contours[j]);
		radicals = [radical];
		for (var k = 0; k < contours.length; k++) if (inclusions[j][k]) {
			if (contours[k].ccw !== orient) {
				radical.holes.push(contours[k]);
				var inner = inclusionToRadicals(inclusions, contours, k, !orient);
				radical.subs = inner;
				radicals = radicals.concat(inner);
			}
		}
		return radicals;
	}
}

module.exports = function findRadicals(contours) {
	var inclusions = [];
	var radicals = [];
	for (var j = 0; j < contours.length; j++) {
		inclusions[j] = [];
		contours[j].outline = true;
	}
	// Find out all inclusion relationships
	for (var j = 0; j < contours.length; j++) {
		for (var k = 0; k < contours.length; k++) {
			if (j !== k && contours[j].includes(contours[k])) {
				inclusions[j][k] = true;
				contours[k].outline = false;
			}
		}
	}
	// Transitive reduction
	transitiveReduce(inclusions);
	// Figure out radicals
	for (var j = 0; j < contours.length; j++) if (contours[j].outline) {
		radicals = radicals.concat(inclusionToRadicals(inclusions, contours, j, contours[j].ccw));
	}
	return radicals;
};
