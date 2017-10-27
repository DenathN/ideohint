"use strict";

var evolve = require("./evolve");
var Individual = require("./individual");
var balance = require("./balance");

function xclamp(low, x, high) {
	return x < low ? low : x > high ? high : x;
}

function uncollide(yInit, env, terminalStrictness, scale, allowUnbalanced) {
	if (!yInit.length) return yInit;
	const n = yInit.length;
	const avails = env.avails;
	let y0 = [];
	for (let j = 0; j < n; j++) {
		y0[j] = xclamp(avails[j].low, Math.round(yInit[j]), avails[j].high);
	}
	let initIdv = env.createIndividual(env.balance(y0));
	let unbalIdv = env.createIndividual(y0, true);
	let population = [initIdv];

	if (allowUnbalanced && unbalIdv.fitness > initIdv.fitness) {
		population.push(unbalIdv);
	}

	// Generate initial population
	// Extereme
	for (let j = 0; j < n; j++) {
		for (let k = avails[j].low; k <= avails[j].high; k++)
			if (k !== y0[j]) {
				const y1 = y0.slice(0);
				y1[j] = k;
				const idvBal = env.createIndividual(env.balance(y1));
				const idvUnbal = env.createIndividual(y1, true);
				population.push(idvBal);
				if (allowUnbalanced && idvUnbal.fitness > idvBal.fitness) {
					population.push(idvUnbal);
				}
			}
	}
	// Y-mutant
	population.push(
		env.createIndividual(
			env.balance(
				y0.map(function(y, j) {
					return xclamp(avails[j].low, y - 1, avails[j].high);
				})
			)
		)
	);
	population.push(
		env.createIndividual(
			env.balance(
				y0.map(function(y, j) {
					return xclamp(avails[j].low, y + 1, avails[j].high);
				})
			)
		)
	);
	// Random
	for (let c = population.length; c < scale; c++) {
		// fill population with random individuals
		const ry = new Array(n);
		for (let j = 0; j < n; j++) {
			ry[j] = xclamp(
				avails[j].low,
				Math.floor(avails[j].low + Math.random() * (avails[j].high - avails[j].low + 1)),
				avails[j].high
			);
		}
		const idvBal = env.createIndividual(env.balance(ry));
		const idvUnbal = env.createIndividual(ry, true);
		population.push(idvBal);
		if (allowUnbalanced && idvUnbal.fitness > idvBal.fitness) {
			population.push(idvUnbal);
			c++;
		}
	}
	// Hall of fame
	let best = population[0];
	for (let j = 1; j < population.length; j++) {
		if (population[j].fitness > best.fitness) best = population[j];
	}
	// "no-improvement" generations
	let steadyStages = 0;
	// Build a swapchain
	let p = population,
		q = new Array(population.length);

	// Start evolution
	for (let s = 0; s < env.strategy.EVOLUTION_STAGES; s++) {
		population = evolve(p, q, !(s % 2), env, allowUnbalanced);
		let elite = population[0];
		for (let j = 1; j < population.length; j++)
			if (population[j].fitness > elite.fitness) {
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
		return env.balance(best.gene);
	} else {
		return best.gene;
	}
}

module.exports = uncollide;
