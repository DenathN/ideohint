"use strict";

// decide the proper width of given stem locally
function calculateWidthOfStem(w, coordinate) {
	let pixels0 = w / this.uppx;
	let pixels = pixels0;
	if (coordinate) {
		pixels = w / this.CANONICAL_STEM_WIDTH * this.WIDTH_GEAR_PROPER;
	} else {
		pixels = w / this.uppx;
	}

	if (pixels > this.WIDTH_GEAR_PROPER) pixels = this.WIDTH_GEAR_PROPER;
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
	let rpx = Math.round(pixels);
	if (rpx > this.WIDTH_GEAR_MIN && rpx - pixels0 > this.SHRINK_THERSHOLD) {
		rpx -= 1;
	}
	return rpx;
}

// Decide proper widths of stems globally
function decideWidths(stems, priorityMap) {
	const { ppem, uppx, strategy } = this;
	let tws = [];
	let areaLost = 0;
	let totalWidth = 0;
	for (let j = 0; j < stems.length; j++) {
		tws[j] = calculateWidthOfStem.call(this, stems[j].width, true);
		totalWidth += stems[j].width;
		areaLost += (stems[j].width / uppx - tws[j]) * (stems[j].xmax - stems[j].xmin);
	}
	// Coordinate widths
	let averageWidth = totalWidth / stems.length;
	let coordinateWidth = calculateWidthOfStem.call(this, averageWidth, true);
	if (areaLost > 0) {
		let areaLostDecreased = true;
		let passes = 0;
		while (areaLostDecreased && areaLost > 0 && passes < 100) {
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
		while (areaLostDecreased && areaLost < 0 && passes < 100) {
			// We will try to increase stroke width if we detected that some pixels are lost.
			areaLostDecreased = false;
			passes += 1;
			for (let m = priorityMap.length - 1; m >= 0; m--) {
				let j = priorityMap[m];
				let len = stems[j].xmax - stems[j].xmin;
				if (tws[j] > coordinateWidth && areaLost < -len / 2) {
					areaLost += len;
					tws[j] -= 1;
					areaLostDecreased = true;
					break;
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
