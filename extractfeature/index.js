"use strict"

var analyzeStemKeyPoints = require('./stem-keypoints');
var analyzeInterpolations = require('./absorptions-interpolations');
var analyzeBlueZonePoints = require('./bluezone');
var analyzeDirectOverlaps = require('./overlap').analyzeDirectOverlaps;
var analyzeEdgeTouches = require('./overlap').analyzeEdgeTouches;
var transitionClosure = require('./overlap').transitionClosure;
var analyzeTriplets = require('./triplet').analyzeTriplets;
var analyzeBlanks = require('./triplet').analyzeBlanks;
var analyzeFlex = require('./flex');
var getStemKeyInfo = require('./stem-keyinfo');

	function byyori(a, b) {		return a.yori - b.yori	}

exports.extractFeature = function (glyph, strategy) {
	analyzeStemKeyPoints(glyph, strategy);
	var blueZonePoints = analyzeBlueZonePoints(glyph, strategy);
	var iss = analyzeInterpolations(glyph, strategy);
	var directOverlaps = analyzeDirectOverlaps(glyph, strategy);
	var edgeTouches = analyzeEdgeTouches(glyph.stems, glyph.stemOverlaps);
	var overlaps = transitionClosure(directOverlaps);
	var blanks = analyzeBlanks(glyph.stems, directOverlaps);
	var triplets = analyzeTriplets(glyph.stems, directOverlaps, blanks);
	var flexes = analyzeFlex(glyph, blanks);
	return {
		stats: glyph.stats,
		stems: glyph.stems.map(getStemKeyInfo).sort(byyori),
		stemOverlaps: glyph.stemOverlaps,
		directOverlaps: directOverlaps,
		edgeTouches: edgeTouches,
		overlaps: overlaps,
		triplets: triplets,
		flexes: flexes,
		collisionMatrices: glyph.collisionMatrices,
		topBluePoints: blueZonePoints.top,
		bottomBluePoints: blueZonePoints.bottom,
		interpolations: iss.interpolations,
		shortAbsorptions: iss.shortAbsorptions
	}
}