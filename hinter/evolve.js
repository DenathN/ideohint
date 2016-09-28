"use strict"

var Individual = require('./individual');
var balance = require("./balance");
function xclamp(low, x, high) { return x < low ? low : x > high ? high : x }

function crossover(p, q, r, env) {
	var avaliables = env.avaliables;
	var n = p.gene.length;
	var newgene = new Array(n);
	for (var j = 0; j < p.gene.length; j++) {
		var rn = Math.random();
		if (rn * 2 < 1 || rn * n < 1) {
			newgene[j] = xclamp(avaliables[j].low, p.gene[j] + (q.gene[j] - r.gene[j]), avaliables[j].high)
		} else {
			newgene[j] = p.gene[j];
		}
	}
	return new Individual(balance(newgene, env), env);
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
		var candidate = crossover(original, m1, m2, env);
		background[c] = candidate.fitness > original.fitness ? candidate : original;
	};
	return background;
};

module.exports = evolve;
