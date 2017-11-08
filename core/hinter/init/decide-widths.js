"use strict";

// decide the proper width of given stem locally
function calculateWidthOfStem(w, doCoordinate) {
	if (this.WIDTH_GEAR_PROPER <= 1) return 1;
	if (!doCoordinate) return Math.max(1, Math.round(w / this.uppx));

	const pixels0 = w / this.uppx;
	let pixels = w / this.CANONICAL_STEM_WIDTH * this.WIDTH_GEAR_PROPER;
	if (pixels < this.WIDTH_GEAR_MIN) {
		if (this.WIDTH_GEAR_MIN < 3) {
			pixels = this.WIDTH_GEAR_MIN;
		} else if (
			pixels < this.WIDTH_GEAR_MIN - 0.8 &&
			this.WIDTH_GEAR_MIN === this.WIDTH_GEAR_PROPER
		) {
			pixels = this.WIDTH_GEAR_MIN - 1;
		} else {
			pixels = this.WIDTH_GEAR_MIN;
		}
	}
	if (pixels > this.WIDTH_GEAR_PROPER) {
		return Math.floor(pixels);
	}

	let rpx = Math.round(pixels);
	if (rpx > 0 && rpx - pixels0 > this.SHRINK_THERSHOLD) {
		rpx -= 1;
	}
	return rpx;
}

// Decide proper widths of stems globally
function decideWidths(stems) {
	const { strategy } = this;
	const doCoordinate = !strategy.DONT_COORDINATE_WIDTHS;
	let tws = [];
	for (let j = 0; j < stems.length; j++) {
		tws[j] = calculateWidthOfStem.call(this, stems[j].width, doCoordinate);
	}
	return tws;
}

module.exports = decideWidths;
