"use strict";

var evolve = require("./evolve");
var Individual = require("./individual");
var balance = require("./balance");

function xclamp(low, x, high) { return x < low ? low : x > high ? high : x; }
function byFitness(a, b) { return b.fitness - a.fitness };

function uncollide(yInit, env, terminalStrictness, scale, allowUnbalanced) {
	if (!yInit.length) return yInit;
	var n = yInit.length;
	var avails = env.avails;
	var y0 = [];
	for (var j = 0; j < n; j++) {
		y0[j] = xclamp(avails[j].low, Math.round(yInit[j]), avails[j].high);
	}
	var initIdv = new Individual(balance(y0, env), env);
	var unbalIdv = new Individual(y0, env, true);
	var population = [initIdv];
	if (initIdv.collidePotential <= 0) {
		if (allowUnbalanced && unbalIdv.collidePotential <= 0
			&& unbalIdv.ablationPotential < initIdv.ablationPotential) {
			return balance(y0, env)
		} else {
			return initIdv.gene;
		}
	}
	if (allowUnbalanced && unbalIdv.collidePotential < initIdv.collidePotential) {
		population.push(unbalIdv);
	}

	// Generate initial population
	// Extereme
	for (var j = 0; j < n; j++) {
		for (var k = avails[j].low; k <= avails[j].high; k++) if (k !== y0[j]) {
			const y1 = y0.slice(0);
			y1[j] = k;
			const idvBal = new Individual(balance(y1, env), env);
			const idvUnbal = new Individual(y1, env, true);
			population.push(idvBal);
			if (allowUnbalanced && idvUnbal.collidePotential < idvBal.collidePotential) {
				population.push(idvUnbal)
			}
		}
	}
	// Y-mutant
	population.push(new Individual(balance(y0.map(function (y, j) {
		return xclamp(avails[j].low, y - 1, avails[j].high);
	}), env), env));
	population.push(new Individual(balance(y0.map(function (y, j) {
		return xclamp(avails[j].low, y + 1, avails[j].high);
	}), env), env));
	// Random
	for (let c = population.length; c < scale; c++) {
		// fill population with random individuals
		const ry = new Array(n);
		for (let j = 0; j < n; j++) {
			ry[j] = xclamp(avails[j].low, Math.floor(avails[j].low + Math.random() * (avails[j].high - avails[j].low + 1)), avails[j].high);
		}
		const idvBal = new Individual(balance(ry, env), env);
		const idvUnbal = new Individual(ry, env, true);
		population.push(idvBal);
		if (allowUnbalanced && idvUnbal.collidePotential < idvBal.collidePotential) {
			population.push(idvUnbal);
			c++
		}
	}
	// Hall of fame
	var best = population[0];
	for (var j = 1; j < population.length; j++) if (population[j].fitness > best.fitness) {
		best = population[j];
	}
	// "no-improvement" generations
	var steadyStages = 0;
	// Build a swapchain
	var p = population, q = new Array(population.length);

	// Start evolution
	for (var s = 0; s < env.strategy.EVOLUTION_STAGES; s++) {
		population = evolve(p, q, !(s % 2), env, allowUnbalanced);
		var elite = population[0];
		for (var j = 1; j < population.length; j++) if (population[j].fitness > elite.fitness) {
			elite = population[j];
		}
		if (elite.fitness <= best.fitness) {
			steadyStages += 1;
		} else {
			steadyStages = 0;
			best = elite;
		}
		if (steadyStages > terminalStrictness) break;
	}

	if (best.unbalanced) {
		return balance(best.gene, env);
	} else {
		return best.gene;
	}
}

module.exports = uncollide;
