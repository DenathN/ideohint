"use strict";

function collidePotential(y, env) {
	var A = env.A, C = env.C, S = env.S, P = env.P
	var avaliables = env.avaliables, sym = env.symmetry;
	var p = 0, n = y.length;
	for (var j = 0; j < n; j++) {
		for (var k = 0; k < j; k++) {
			if (y[j] === y[k]) { p += A[j][k]; } // Alignment
			else if (y[j] <= y[k] + env.avaliables[j].properWidth) { p += C[j][k]; } // Collide
			if (j !== k && sym[j][k]) {
				if (y[j] !== y[k]) { p += S[j][k]; } // Symmetry break
			} else {
				if (y[j] < y[k]) { p += S[j][k]; } // Swap
			}
		}
	}
	return p;
}
function ablationPotential(y, env) {
	var avaliables = env.avaliables, triplets = env.triplets, dovs = env.directOverlaps;
	var blueFuzz = env.strategy.BLUEZONE_WIDTH;
	var p = 0;
	var n = y.length;
	for (var j = 0; j < y.length; j++) {
		p += avaliables[j].ablationCoeff * env.uppx * Math.abs(y[j] - avaliables[j].center);
		if (y[j] > avaliables[j].softHigh) {
			p += env.strategy.COEFF_PORPORTION_DISTORTION * env.uppx * Math.min(1, y[j] - avaliables[j].softHigh)
		}
	}

	const dlimit = env.uppx / 2;
	for (var t = 0; t < triplets.length; t++) {
		var j = triplets[t][0], k = triplets[t][1], w = triplets[t][2], d = triplets[t][3];
		if (!(y[j] > y[k] && y[k] > y[w])) continue;
		var spacejk = y[j] - y[k] - avaliables[j].properWidth;
		var spacekw = y[k] - y[w] - avaliables[k].properWidth;
		if (d >= dlimit && spacejk < spacekw
			|| d <= -dlimit && spacejk > spacekw
			|| d < dlimit && d > -dlimit && (spacejk - spacekw > 1 || spacejk - spacekw < -1)) {
			p += (env.C[j][k] + env.C[k][w]) * env.strategy.COEFF_DISTORT;
		}
	}
	return p;
}

function Individual(y, env, unbalanced) {
	this.gene = y;
	this.collidePotential = collidePotential(y, env);
	this.ablationPotential = env.noAblation ? 0 : ablationPotential(y, env);
	this.fitness = 1 / (1 + Math.max(0, this.collidePotential * 8 + this.ablationPotential / 16));
	this.unbalanced = unbalanced;
}

module.exports = Individual;
