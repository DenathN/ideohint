const core = require("../core");
const { lerp, xlerp, xclamp } = require("../support/common");

onmessage = function(message) {
	const { input, ppemMin, ppemMax, strategy } = message.data;
	const glyphs = input.map(function(passage, j) {
		if (passage) {
			const glyph = core.parseOTD(passage);
			return {
				glyph: glyph,
				features: core.extractFeature(glyph, strategy),
				hints: []
			};
		}
	});
	console.log(glyphs);
	for (let g of glyphs) {
		let d = 0xffff;
		g.hints = core.decideHints(g.features, strategy).sd;
	}
	postMessage(glyphs);
};
