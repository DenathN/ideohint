"use strict";

function inGlyph(glyph, z) {
	for (let r of glyph.radicals) if (r.includes(z)) return true;
	return false;
}

class Bitmap {
	constructor(strategy, array) {
		let scale = strategy.UPM / 256;
		let ymin = Math.floor(strategy.BLUEZONE_BOTTOM_CENTER / scale);
		let ymax = Math.ceil(strategy.BLUEZONE_TOP_CENTER / scale);
		this.scale = scale;
		this.ymin = ymin;
		this.ymax = ymax;
		this.array = array;
	}
	transform(x, y) {
		return {
			x: Math.round(x / this.scale),
			y: Math.round(y / this.scale) - this.ymin
		};
	}
	access(x, y) {
		if (x < 0 || x > 256 * this.scale) return false;
		if (y < this.ymin * this.scale || y > this.ymax * this.scale) return false;
		return this.array[Math.round(x / this.scale)][Math.round(y / this.scale) - this.ymin];
	}
}

function createImageBitmap(g, strategy) {
	let bitmap = [];
	let scale = strategy.UPM / 256;
	let ymin = Math.floor(strategy.BLUEZONE_BOTTOM_CENTER / scale);
	let ymax = Math.ceil(strategy.BLUEZONE_TOP_CENTER / scale);
	for (let x = 0; x <= 256; x++) {
		bitmap[x] = [];
		for (let y = ymin; y <= ymax; y++) {
			bitmap[x][y - ymin] = inGlyph(g, {
				x: x * scale,
				y: y * scale
			});
		}
	}
	return new Bitmap(strategy, bitmap);
}

function getTurns(a) {
	if (!a.length) return 0;
	let v0 = a[0],
		turns = 0;
	for (let v of a)
		if (v !== v0) {
			turns += 1;
			v0 = v;
		}
	return turns;
}

function analyzeTurns(g, strategy, stems) {
	const bitmap = createImageBitmap(g, strategy);
	for (let s of stems) {
		let x1 = bitmap.transform(s.xmin, 0).x;
		let x2 = bitmap.transform(s.xmax, 0).x;
		let yBot = bitmap.transform(0, s.y - s.width).y - 1;
		let yTop = bitmap.transform(0, s.y).y + 1;
		if (!bitmap.array[x1] || !bitmap.array[x2]) continue;
		if (yBot > 0) {
			let stemTurns = 0;
			for (let x = x1; x <= x2; x++) {
				const turns = getTurns(bitmap.array[x].slice(0, yBot));
				if (turns > stemTurns) stemTurns = turns;
			}
			s.turnsBelow = stemTurns;
		}
		if (yTop > 0) {
			let stemTurns = 0;
			for (let x = x1; x <= x2; x++) {
				const turns = getTurns(bitmap.array[x].slice(yTop));
				if (turns > stemTurns) stemTurns = turns;
			}
			s.turnsAbove = stemTurns;
		}
	}
}

exports.createImageBitmap = createImageBitmap;
exports.analyzeTurns = analyzeTurns;
