"use strict";

const DIAG_BIAS_PIXELS = 1 / 6;
const DIAG_BIAS_PIXELS_NEG = 1 / 3;
class Individual {
	constructor(y, env, unbalanced) {
		this.gene = y;
		this.unbalanced = unbalanced;
		this.collidePotential =
			this.getCollidePotential(env) + this.getSevereDistortionPotential(env);
		this.ablationPotential = this.getAblationPotential(env);
		this.fitness = this.getFitness();
	}
	getFitness() {
		return 1 / (1 + Math.max(0, this.collidePotential * 8 + this.ablationPotential / 16));
	}
	getCollidePotential(env) {
		const y = this.gene,
			A = env.A,
			C = env.C,
			n = y.length,
			avails = env.avails;
		let nCol = 0;
		let pA = 0,
			pC = 0;
		for (let j = 0; j < n; j++) {
			for (let k = 0; k < j; k++) {
				if (y[j] === y[k]) {
					pA += A[j][k]; // Alignment
				} else if (y[j] <= y[k] + avails[j].properWidth) {
					pC += C[j][k] * (1 + avails[j].properWidth - (y[j] - y[k])); // Collide
					if (C[j][k]) nCol += avails[j].plength + avails[k].plength;
				}
			}
		}
		return pA + pC * nCol * nCol;
	}
	_getOverseparationP(env) {
		const y = this.gene,
			avails = env.avails,
			n = y.length,
			dov = env.directOverlaps,
			OVERSEP = env.COEFF_OVERSEP;
		let p = 0;
		// top oversep
		for (let j = 0; j < n; j++) {
			if (avails[j].hasGlyphStemAbove) continue;
			const overSeparation =
				(env.glyphTopPixels - y[j]) / (env.glyphTopPixels - avails[j].y0px) - 1;
			p += overSeparation * overSeparation * OVERSEP;
		}
		// bottom oversep
		for (let j = 0; j < n; j++) {
			if (avails[j].hasGlyphStemBelow) continue;
			if (avails[j].hasGlyphFoldBelow) continue;
			const overSeparation =
				(y[j] - avails[j].properWidth - env.glyphBottomPixels) /
					(avails[j].y0px - avails[j].w0px - env.glyphBottomPixels) -
				1;
			p += overSeparation * overSeparation * OVERSEP;
		}
		// between-stem oversep
		for (let j = 0; j < n; j++) {
			for (let k = 0; k < j; k++) {
				if (!dov[j][k]) continue;
				const d = y[j] - avails[j].properWidth / 2 - y[k] + avails[k].properWidth / 2;
				const d0 =
					avails[j].y0px - avails[j].w0px / 2 - avails[k].y0px + avails[k].w0px / 2;
				const overSeparation = (d - d0) / d0;
				if (y[j] - avails[j].properWidth - y[k] <= 0) continue;
				p += overSeparation * overSeparation * OVERSEP;
			}
		}
		return p;
	}
	_getDiagonalBreakP(env) {
		const y = this.gene,
			avails = env.avails,
			n = y.length,
			S = env.S;
		let p = 0;
		// Diagonal break
		for (let j = 0; j < n; j++) {
			for (let k = 0; k < j; k++) {
				if (!(avails[j].rid && avails[j].rid === avails[k].rid)) continue;
				if (
					y[j] - y[k] > Math.ceil(avails[j].y0px - avails[k].y0px + DIAG_BIAS_PIXELS) ||
					y[j] - y[k] < Math.ceil(avails[j].y0px - avails[k].y0px - DIAG_BIAS_PIXELS_NEG)
				) {
					p += S[j][k]; // diagonal break
				}
			}
		}
		return p;
	}
	_getSwapAndSymBreakP(env) {
		const y = this.gene,
			avails = env.avails,
			n = y.length,
			S = env.S,
			sym = env.symmetry;
		let p = 0;
		for (let j = 0; j < n; j++) {
			for (let k = 0; k < j; k++) {
				if (j !== k && sym[j][k]) {
					if (y[j] !== y[k]) {
						p += S[j][k]; // Symmetry break
					}
				} else {
					if (y[j] < y[k]) {
						p += S[j][k]; // Swap
					} else if (
						avails[j].y0 - avails[j].w0 < avails[k].y0 &&
						!(avails[j].rid && avails[j].rid === avails[k].rid) &&
						(avails[j].properWidth > 1
							? y[j] - avails[j].properWidth >= y[k]
							: y[j] - avails[j].properWidth > y[k])
					) {
						// Swap
						// higher stroke being too high for original outline designed like this ↓
						// ------.
						//       |   ,-------
						// ------'   |
						//           `-------
						p += S[j][k];
					}
				}
			}
		}
		return p;
	}
	getSevereDistortionPotential(env) {
		return (
			this._getOverseparationP(env) +
			this._getDiagonalBreakP(env) +
			this._getSwapAndSymBreakP(env)
		);
	}
	getAblationPotential(env) {
		if (env.noAblation) return 0;
		const y = this.gene,
			avails = env.avails,
			triplets = env.triplets,
			uppx = env.uppx,
			n = y.length;

		let p = 0;
		// Prop distortion
		for (let j = 0; j < n; j++) {
			p += avails[j].ablationCoeff * uppx * Math.abs(y[j] - avails[j].center);
			if (y[j] > avails[j].softHigh) {
				p +=
					env.strategy.COEFF_PORPORTION_DISTORTION *
					uppx *
					Math.min(1, y[j] - avails[j].softHigh);
			}
			if (y[j] < avails[j].softLow) {
				p +=
					env.strategy.COEFF_PORPORTION_DISTORTION *
					uppx *
					Math.min(1, avails[j].softHigh - y[j]);
			}
		}

		// Triplet distortion
		const finelimit = uppx / 8;
		const dlimit = uppx / 3;
		const dlimitx = 2 * uppx / 3;
		const compressLimit = 3 * uppx / 4;
		for (let [j, k, w, d1, d2] of triplets) {
			const d = d1 - d2;
			if (!(y[j] > y[k] && y[k] > y[w])) continue;
			const spacejk = y[j] - y[k] - avails[j].properWidth;
			const spacekw = y[k] - y[w] - avails[k].properWidth;
			const expanded =
				spacejk * uppx > d1 + compressLimit && spacekw * uppx > d2 + compressLimit;
			const compressed =
				spacejk * uppx < d1 - compressLimit && spacekw * uppx < d2 - compressLimit;
			if (
				(d >= dlimitx && spacejk <= spacekw) ||
				(d >= dlimit && spacejk < spacekw) ||
				(d <= -dlimitx && spacejk >= spacekw) ||
				(d <= -dlimit && spacejk > spacekw) ||
				(d < dlimit && d > -dlimit && (spacejk - spacekw > 1 || spacejk - spacekw < -1)) ||
				(d < dlimit && d > -dlimit && (compressed || expanded))
			) {
				p += (env.C[j][k] + env.C[k][w]) * env.strategy.COEFF_DISTORT;
			}
			if (d < finelimit && d > -finelimit && spacejk !== spacekw) {
				p += (env.C[j][k] + env.C[k][w]) * env.strategy.COEFF_DISTORT / 3;
			}
		}
		return p;
	}
}

module.exports = Individual;
