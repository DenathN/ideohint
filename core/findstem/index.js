"use strict";

var analyzeStems = require("./coupler");
var analyzeStemSpatialRelationships = require("./stem-relationship")
	.analyzeStemSpatialRelationships;
var analyzePointBetweenStems = require("./stem-relationship").analyzePointBetweenStems;
var analyzeEntireContorBetweenStems = require("./stem-relationship")
	.analyzeEntireContorBetweenStems;
var analyzeEntireContourAboveBelow = require("./stem-relationship").analyzeEntireContourAboveBelow;
var calculateCollisionMatrices = require("./collide-matrix");
var findRadicals = require("./radical");

var stemOverlapRatio = require("./overlap").stemOverlapRatio;
var stemOverlapLength = require("./overlap").stemOverlapLength;

const turns = require("./turns");

function OverlapMatrix(stems, fn) {
	var transitions = [];
	for (var j = 0; j < stems.length; j++) {
		transitions[j] = [];
		for (var k = 0; k < stems.length; k++) {
			transitions[j][k] = fn(stems[j], stems[k]);
		}
	}
	return transitions;
}

function findStems(glyph, strategy) {
	const radicals = findRadicals(glyph.contours);
	glyph.radicals = radicals;
	const stems = analyzeStems(radicals, strategy);

	// There are two overlapping matrices are being used: one "minimal" and one "canonical".
	// The minimal one is ued for collision matrices calclulation, and the canonical one is
	// used for spatial relationship detection
	glyph.stemOverlaps = OverlapMatrix(stems, function(p, q) {
		return stemOverlapRatio(p, q, Math.min, strategy);
	});
	glyph.stemOverlapLengths = OverlapMatrix(stems, function(p, q) {
		return stemOverlapLength(p, q, strategy);
	});
	analyzeStemSpatialRelationships(stems, radicals, glyph.stemOverlaps, strategy);
	const pointBetweenStems = analyzePointBetweenStems(stems, radicals, strategy);
	const ecbs = analyzeEntireContorBetweenStems(glyph, stems);
	analyzeEntireContourAboveBelow(glyph, stems, strategy);
	const tm = (glyph.turnsBetween = turns.analyzeTurns(glyph, strategy, stems));
	glyph.collisionMatrices = calculateCollisionMatrices(
		strategy,
		stems,
		glyph.stemOverlaps,
		glyph.stemOverlapLengths,
		pointBetweenStems,
		ecbs,
		tm
	);
	glyph.stems = stems;
	return glyph;
}

exports.findStems = findStems;
