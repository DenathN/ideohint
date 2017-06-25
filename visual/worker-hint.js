const parseOTD = require('../otdParser').parseOTD;
const findStems = require('../findstem').findStems;
const extractFeature = require('../extractfeature').extractFeature;
const hint = require('../hinter').hint;
const { lerp, xlerp, xclamp } = require('../support/common');

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
	console.log(glyphs);
	for (let g of glyphs) {
		let d = 0xffff;
		for (let j = 0; j < g.features.stems.length; j++) for (let k = 0; k < j; k++) {
			if (g.features.directOverlaps[j][k]) {
				let d1 = g.features.stems[j].y - g.features.stems[j].width - g.features.stems[k].y;
				if (d1 < d) d = d1;
			}
		}
		if (d < 1) d = 1;
		const cutoff = xclamp(strategy.PPEM_MIT,
			Math.round(strategy.UPM * strategy.SPARE_PIXLS / d),
			strategy.PPEM_MAX);
		for (let ppem = strategy.PPEM_MIN; ppem <= strategy.PPEM_MAX; ppem++) {
			g.hints[ppem] = hint(g.features, ppem, strategy, ppem > cutoff);
		}
	}
	postMessage(glyphs);
}
