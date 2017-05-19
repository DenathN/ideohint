"use strict"

const { adjacent: adjacent } = require('../types/point');

exports.minmaxOfSeg = function (u) {
	var min = 0xFFFF, max = -0xFFFF;
	for (var s = 0; s < u.length; s++)for (var k = 0; k < u[s].length; k++) {
		if (u[s][k].x < min) min = u[s][k].x
		if (u[s][k].x > max) max = u[s][k].x
	}
	return { min: min, max: max }
}

exports.segmentsPromixity = function (s1, s2) {
	var count = 0;
	for (var j = 0; j < s1.length; j++) for (var k = 0; k < s2.length; k++) {
		if (adjacent(s1[j][0], s2[k][0])) count += 1;
		if (adjacent(s1[j][0], s2[k][1])) count += 1;
		if (adjacent(s1[j][1], s2[k][0])) count += 1;
		if (adjacent(s1[j][1], s2[k][1])) count += 1;
	}
	return 2 * count / (s1.length + s2.length);
}
