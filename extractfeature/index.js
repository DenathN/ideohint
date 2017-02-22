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
var analyzeDominance = require('./dominance');

function byyori(a, b) { return a.yori - b.yori }

exports.extractFeature = function (glyph, strategy) {
	var directOverlaps = analyzeDirectOverlaps(glyph, strategy, true);
	var strictOverlaps = analyzeDirectOverlaps(glyph, strategy, false);
	analyzeStemKeyPoints(glyph, strategy, directOverlaps, glyph.collisionMatrices.promixity);
	var blueZonePoints = analyzeBlueZonePoints(glyph, strategy);
	var iss = analyzeInterpolations(glyph, strategy);
	var edgeTouches = analyzeEdgeTouches(glyph.stems, glyph.stemOverlaps);
	var overlaps = transitionClosure(directOverlaps);
	var blanks = analyzeBlanks(glyph.stems, directOverlaps);
	var strictBlanks = analyzeBlanks(glyph.stems, strictOverlaps);
	var triplets = analyzeTriplets(glyph.stems, directOverlaps, blanks);
	var strictTriplets = analyzeTriplets(glyph.stems, strictOverlaps, strictBlanks);
	var flexes = analyzeFlex(glyph, blanks);
	var dominancePriority = analyzeDominance(glyph.stems);
	return {
		stats: glyph.stats,
		stems: glyph.stems.map(getStemKeyInfo).sort(byyori),
		stemOverlaps: glyph.stemOverlaps,
		directOverlaps: directOverlaps,
		strictOverlaps: strictOverlaps,
		edgeTouches: edgeTouches,
		overlaps: overlaps,
		triplets: triplets,
		strictTriplets: strictTriplets,
		flexes: flexes,
		collisionMatrices: glyph.collisionMatrices,
		topBluePoints: blueZonePoints.top,
		bottomBluePoints: blueZonePoints.bottom,
		interpolations: iss.interpolations,
		shortAbsorptions: iss.shortAbsorptions,
		dominancePriority: dominancePriority
	}
}