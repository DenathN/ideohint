"use strict"

var analyzeStems = require('./coupler');
var analyzeStemSpatialRelationships = require('./stem-relationship').analyzeStemSpatialRelationships;
var analyzePointBetweenStems = require('./stem-relationship').analyzePointBetweenStems;
var calculateCollisionMatrices = require('./collide-matrix');
var findRadicals = require('./radical');

var overlapInfo = require('./overlap').overlapInfo;
var overlapRatio = require('./overlap').overlapRatio;
var stemOverlapRatio = require('./overlap').stemOverlapRatio;
var stemOverlapLength = require('./overlap').stemOverlapLength;

function OverlapMatrix(stems, fn) {
	var transitions = [];
	for (var j = 0; j < stems.length; j++) {
		transitions[j] = []
		for (var k = 0; k < stems.length; k++) {
			transitions[j][k] = fn(stems[j], stems[k])
		}
	};
	return transitions
}

function findStems(glyph, strategy) {
	var radicals = findRadicals(glyph.contours);
	var stems = analyzeStems(radicals, strategy);

	var overlaps = glyph.stemMinOverlaps = OverlapMatrix(stems, function (p, q) {
		return stemOverlapRatio(p, q, Math.min, strategy);
	});
	glyph.stemOverlaps = OverlapMatrix(stems, function (p, q) {
		return stemOverlapRatio(p, q, Math.max, strategy);
	});
	var overlapLengths = glyph.stemOverlapLengths = OverlapMatrix(stems, function (p, q) {
		return stemOverlapLength(p, q, strategy);
	});
	analyzeStemSpatialRelationships(stems, radicals, overlaps, strategy);
	var pointBetweenStems = analyzePointBetweenStems(stems, radicals, strategy);
	glyph.collisionMatrices = calculateCollisionMatrices(strategy, stems, overlaps, overlapLengths, pointBetweenStems);
	glyph.stems = stems;
	return glyph;
}

exports.findStems = findStems;