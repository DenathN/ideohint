"use strict";
const { xclamp } = require("../../../support/common");

function gammaCorrect(pixels) {
	let intpxs = Math.floor(pixels);
	return intpxs + Math.pow(pixels - intpxs, 2);
}

// decide the proper width of given stem locally
function calculateWidthOfStem(w, doCoordinate) {
	if (!doCoordinate) return Math.max(1, Math.round(gammaCorrect(w / this.uppx)));

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
function decideWidths(stems, priorityMap) {
	const { strategy, upm, ppem, uppx } = this;
	const doCoordinate =
		!strategy.DONT_COORDINATE_WIDTHS &&
		this.CANONICAL_STEM_WIDTH / upm < 0.004 * ppem &&
		this.CANONICAL_STEM_WIDTH / upm > 0.0015 * ppem &&
		this.WIDTH_GEAR_PROPER === 2;
	let tws = [];

	let totalWidth = 0;
	for (let j = 0; j < stems.length; j++) {
		tws[j] = calculateWidthOfStem.call(this, stems[j].width, doCoordinate);
		totalWidth += tws[j];
	}
	const coordinateWidth = calculateWidthOfStem.call(this, totalWidth / stems.length, true);

	if (doCoordinate) {
		let areaLost = 0;
		for (let j = 0; j < stems.length; j++) {
			const coordinatedOriginalWidth = doCoordinate
				? stems[j].width / this.CANONICAL_STEM_WIDTH * this.WIDTH_GEAR_PROPER
				: stems[j].width / uppx;
			areaLost += (coordinatedOriginalWidth - tws[j]) * (stems[j].xmax - stems[j].xmin);
		}
		// Coordinate widths
		if (areaLost > 0) {
			let areaLostDecreased = true;
			let passes = 0;
			while (areaLost >= 0 && areaLostDecreased && passes < 100) {
				// We will try to increase stroke width if we detected that some pixels are lost.
				areaLostDecreased = false;
				passes += 1;
				for (let m = 0; m < priorityMap.length; m++) {
					let j = priorityMap[m];
					let len = stems[j].xmax - stems[j].xmin;
					if (tws[j] < this.WIDTH_GEAR_PROPER && areaLost > len / 2) {
						tws[j] += 1;
						areaLost -= len;
						areaLostDecreased = true;
						break;
					}
				}
			}
		} else {
			let areaLostDecreased = true;
			let passes = 0;
			while (areaLost <= 0 && areaLostDecreased && passes < 100) {
				// We will try to increase stroke width if we detected that some pixels are lost.
				areaLostDecreased = false;
				passes += 1;
				for (let m = priorityMap.length - 1; m >= 0; m--) {
					let j = priorityMap[m];
					let len = stems[j].xmax - stems[j].xmin;
					if (tws[j] > coordinateWidth && areaLost < -len) {
						areaLost += len;
						tws[j] -= 1;
						areaLostDecreased = true;
						break;
					}
				}
			}
		}
	}
	for (let j = 0; j < stems.length; j++) {
		if (tws[j] < 1) {
			tws[j] = 1;
		}
	}
	return tws;
}

module.exports = decideWidths;
