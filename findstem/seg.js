exports.minmaxOfSeg = function (u) {
	var min = 0xFFFF, max = -0xFFFF;
	for (var s = 0; s < u.length; s++)for (var k = 0; k < u[s].length; k++) {
		if (u[s][k].xori < min) min = u[s][k].xori
		if (u[s][k].xori > max) max = u[s][k].xori
	}
	return { min: min, max: max }
}

function adjacent(z1, z2) {
	return z1.prev === z2 || z2.prev === z1;
}

exports.segmentsPromixity = function(s1, s2){
	var count = 0;
	for (var j = 0; j < s1.length; j++) for (var k = 0; k < s2.length; k++) {
		if (adjacent(s1[j][0], s2[k][0])) count += 1;
		if (adjacent(s1[j][0], s2[k][1])) count += 1;
		if (adjacent(s1[j][1], s2[k][0])) count += 1;
		if (adjacent(s1[j][1], s2[k][1])) count += 1;
	}
	return 2 * count / (s1.length + s2.length);
}