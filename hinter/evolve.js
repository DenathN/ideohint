"use strict"

var Individual = require('./individual');
var balance = require("./balance");
function xclamp(low, x, high) { return x < low ? low : x > high ? high : x }

function crossover(p, q, r, env, background, c) {
	var avaliables = env.avaliables;
	var n = p.gene.length;
	var newgene = new Array(n);
	for (var j = 0; j < p.gene.length; j++) {
		var rn = Math.random();
		if (rn < env.strategy.MUTANT_PROBABLITY) {
			newgene[j] = xclamp(
				avaliables[j].low,
				Math.round(avaliables[j].low - 0.5 + Math.random() * (avaliables[j].high - avaliables[j].low + 1)),
				avaliables[j].high);
		} else if (rn * 2 < 1 || rn * n < 1) {
			newgene[j] = xclamp(avaliables[j].low, p.gene[j] + (q.gene[j] - r.gene[j]), avaliables[j].high)
		} else {
			newgene[j] = p.gene[j];
		}
	}
	const idBal = new Individual(balance(newgene, env), env);
	const idUnbal = new Individual(newgene, env, true);
	if (!background[c]) background[c] = p;
	if (idBal.fitness > p.fitness) {
		if (idUnbal.fitness > idBal.fitness) {
			background[c] = idUnbal
		} else {
			background[c] = idBal
		}
	} else {
		if (idUnbal.fitness > p.fitness) {
			background[c] = idUnbal
		}
	}
};
// Use a swapchain to avoid re-allochain
function evolve(p, q, odd, env) {
	var population = odd ? p : q;
	var background = odd ? q : p;
	// Crossover
	for (var c = 0; c < population.length; c++) {
		var original = population[c];
		var m1 = population[0 | Math.random() * population.length];
		var m2 = population[0 | Math.random() * population.length];
		crossover(original, m1, m2, env, background, c);
	};
	return background;
};

module.exports = evolve;
