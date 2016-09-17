"use strict"

var toml = require('toml');
var fs = require('fs');

var DefaultStrategy = function () {
	var g = [[0, 1, 1], [23, 2, 2], [36, 3, 2]]
	return {
		UPM: 1000,
		CANONICAL_STEM_WIDTH: 65,
		CANONICAL_STEM_WIDTH_SMALL: 65,
		CANONICAL_STEM_WIDTH_DENSE: 65,
		ABSORPTION_LIMIT: 65,
		STEM_SIDE_MIN_RISE: 40,
		STEM_SIDE_MIN_DESCENT: 60,
		STEM_CENTER_MIN_RISE: 40,
		STEM_CENTER_MIN_DESCENT: 60,
		STEM_SIDE_MIN_DIST_RISE: 40,
		STEM_SIDE_MIN_DIST_DESCENT: 60,
		PPEM_MIN: 10,
		PPEM_MAX: 36,
		PPEM_INCREASE_GLYPH_LIMIT: 18,
		POPULATION_LIMIT: 500,
		POPULATION_LIMIT_SMALL: 50,
		EVOLUTION_STAGES: 8,
		MUTANT_PROBABLITY: 0.1,
		ABLATION_IN_RADICAL: 1,
		ABLATION_RADICAL_EDGE: 2,
		ABLATION_GLYPH_EDGE: 30,
		ABLATION_GLYPH_HARD_EDGE: 50,
		COEFF_PORPORTION_DISTORTION: 8,
		BLUEZONE_BOTTOM_CENTER: -67,
		BLUEZONE_TOP_CENTER: 831,
		BLUEZONE_BOTTOM_LIMIT: -55,
		BLUEZONE_TOP_LIMIT: 793,
		BLUEZONE_BOTTOM_BAR: -55,
		BLUEZONE_TOP_BAR: 793,
		BLUEZONE_BOTTOM_DOTBAR: -55,
		BLUEZONE_TOP_DOTBAR: 793,
		BLUEZONE_WIDTH: 15,
		COEFF_A_MULTIPLIER: 10,
		COEFF_A_SAME_RADICAL: 4,
		COEFF_A_SHAPE_LOST: 25,
		COEFF_A_FEATURE_LOSS: 30,
		COEFF_A_RADICAL_MERGE: 1,
		COEFF_C_MULTIPLIER: 100,
		COEFF_C_FEATURE_LOSS: 12,
		COEFF_C_SAME_RADICAL: 6,
		COEFF_S: 99999999,
		COEFF_DISTORT: 5,
		REBALANCE_PASSES: 32,
		MIN_OVERLAP_RATIO: 0.2,
		COLLISION_MIN_OVERLAP_RATIO: 0.15,
		SIDETOUCH_LIMIT: 0.05,
		TBST_LIMIT: 0.25,
		DO_SHORT_ABSORPTION: true,
		DONT_ADJUST_STEM_WIDTH: false,
		SLOPE_FUZZ: 0.04,
		Y_FUZZ: 7,
		WIDTH_ALLOCATION_PASSES: 5,
		STACK_DEPTH: 200
	}
};
exports.defaultStrategy = DefaultStrategy();
exports.from = function (argv, parameterFile) {
	var strategy = DefaultStrategy();
	if (parameterFile && parameterFile.hinting) {
		for (var k in parameterFile.hinting) {
			strategy[k] = parameterFile.hinting[k];
		}
	} else {
		for (var prop in strategy) {
			if (argv[prop]) {
				strategy[prop] = isFinite(argv[prop] - 0) ? argv[prop] : strategy[prop];
			}
		};
	}
	return strategy;
}