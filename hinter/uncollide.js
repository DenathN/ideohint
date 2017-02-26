"use strict";

var evolve = require("./evolve");
var Individual = require("./individual");
var balance = require("./balance");

function xclamp(low, x, high) { return x < low ? low : x > high ? high : x; }

function uncollide(yInit, env, terminalStrictness, scale) {
	if (!yInit.length) return yInit;
	var n = yInit.length;
	var avaliables = env.avaliables;
	var y0 = [];
	for (var j = 0; j < n; j++) {
		y0[j] = xclamp(avaliables[j].low, Math.round(yInit[j]), avaliables[j].high);
	}
	var initIdv = new Individual(balance(y0, env), env);
	var unbalIdv = new Individual(y0, env, true);
	var population = [initIdv];
	if (unbalIdv.collidePotential < initIdv.collidePotential) { population.push(unbalIdv); }
	// Generate initial population
	// Extereme
	for (var j = 0; j < n; j++) {
		for (var k = avaliables[j].low; k <= avaliables[j].high; k++) if (k !== y0[j]) {
			var y1 = y0.slice(0);
			y1[j] = k;
			let idvBal = new Individual(balance(y1, env), env);
			let idvUnbal = new Individual(y1, env, true);
			population.push(idvBal);
			if (idvUnbal.collidePotential < idvBal.collidePotential) { population.push(idvUnbal) }
		}
	}
	// Y-mutant
	population.push(new Individual(balance(y0.map(function (y, j) {
		return xclamp(avaliables[j].low, y - 1, avaliables[j].high);
	}), env), env));
	population.push(new Individual(balance(y0.map(function (y, j) {
		return xclamp(avaliables[j].low, y + 1, avaliables[j].high);
	}), env), env));
	// Random
	for (var c = population.length; c < scale; c++) {
		// fill population with random individuals
		var ry = new Array(n);
		for (var j = 0; j < n; j++) {
			ry[j] = xclamp(avaliables[j].low, Math.floor(avaliables[j].low + Math.random() * (avaliables[j].high - avaliables[j].low + 1)), avaliables[j].high);
		}
		let idvBal = new Individual(balance(ry, env), env);
		let idvUnbal = new Individual(ry, env, true);
		population.push(idvBal);
		if (idvUnbal.collidePotential < idvBal.collidePotential) { population.push(idvUnbal) }
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
		population = evolve(p, q, !(s % 2), env);
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
