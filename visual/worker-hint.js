var parseOTD = require('../otdParser').parseOTD;
var findStems = require('../findstem').findStems;
var extractFeature = require('../extractfeature').extractFeature;
var hint = require('../hinter').hint;

onmessage = function (message) {
	const { input, ppemMin, ppemMax, strategy } = message.data;
	const glyphs = input.map(function (passage, j) {
		if (passage) {
			var glyph = parseOTD(passage);
			return {
				glyph: glyph,
				features: extractFeature(findStems(glyph, strategy), strategy),
				hints: []
			}
		}
	});
	for (let ppem = strategy.PPEM_MIN; ppem <= strategy.PPEM_MAX; ppem++) {
		for (let glyph of glyphs) {
			glyph.hints[ppem] = hint(glyph.features, ppem, strategy);
		}
	}
	postMessage(glyphs);
}