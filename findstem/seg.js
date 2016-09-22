exports.minmaxOfSeg = function (u) {
	var min = 0xFFFF, max = -0xFFFF;
	for (var s = 0; s < u.length; s++)for (var k = 0; k < u[s].length; k++) {
		if (u[s][k].xori < min) min = u[s][k].xori
		if (u[s][k].xori > max) max = u[s][k].xori
	}
	return { min: min, max: max }
}
