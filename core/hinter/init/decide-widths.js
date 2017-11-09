"use strict";

// decide the proper width of given stem locally
function calculateWidthOfStem(s, w) {
	if (this.WIDTH_GEAR_PROPER <= 1) return 1;
	return Math.max(
		1,
		!s.hasGlyphStemAbove || !s.hasGlyphStemBelow ? Math.min(2, this.WIDTH_GEAR_PROPER) : 0,
		Math.round(w / this.uppx)
	);
}

// Decide proper widths of stems globally
function decideWidths(stems) {
	let tws = [];
	for (let j = 0; j < stems.length; j++) {
		tws[j] = calculateWidthOfStem.call(this, stems[j], stems[j].width);
	}
	return tws;
}

module.exports = decideWidths;
