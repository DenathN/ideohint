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
			xori: z2.xori + (z1.xori - z2.xori) * (s / SEGMENTS),
			yori: z2.yori + (z1.yori - z2.yori) * (s / SEGMENTS)
		};
		if (!this.includes(testz)) {
			return false;
		}
	}
	return true;
};
Radical.prototype.includesSegmentEdge = function (z1, z2, delta) {
	for (let u1 = -1; u1 <= 1; u1++)
		for (let u2 = -1; u2 <= 1; u2++)
			for (let u3 = -1; u3 <= 1; u3++)
				for (let u4 = -1; u4 <= 1; u4++) {
					let z1a = {xori: z1.xori + u1 * delta, yori: z1.yori + u2 * delta};
					let z2a = {xori: z2.xori + u3 * delta, yori: z2.yori + u4 * delta};
					if (this.includesSegment(z1a, z2a))return true;
	}
	return false;
};
Radical.prototype.includesTetragon = function (s1, s2) {
	var steps = 32;
	for (var j = 1; j < steps; j++) {
		var m1 = {
			xori: s1[0].xori + (s1[s1.length - 1].xori - s1[0].xori) * (j / steps),
			yori: s1[0].yori + (s1[s1.length - 1].yori - s1[0].yori) * (j / steps)
		};
		var m2 = {
			xori: s2[0].xori + (s2[s2.length - 1].xori - s2[0].xori) * (j / steps),
			yori: s2[0].yori + (s2[s2.length - 1].yori - s2[0].yori) * (j / steps)
		};
		if (!this.includesSegment(m1, m2)) return false;
		var m1 = {
			xori: s1[0].xori + (s1[s1.length - 1].xori - s1[0].xori) * (j / steps),
			yori: s1[0].yori + (s1[s1.length - 1].yori - s1[0].yori) * (j / steps)
		};
		var m2 = {
			xori: s2[0].xori + (s2[s2.length - 1].xori - s2[0].xori) * (1 - j / steps),
			yori: s2[0].yori + (s2[s2.length - 1].yori - s2[0].yori) * (1 - j / steps)
		};
		if (!this.includesSegment(m1, m2)) return false;
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
