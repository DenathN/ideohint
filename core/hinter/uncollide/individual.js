"use strict";

const { xclamp } = require("../../../support/common");

const DIAG_BIAS_PIXELS = 1 / 6;
const DIAG_BIAS_PIXELS_NEG = 0.35;
const ABLATION_MARK = 1 / 8192;
class Individual {
	constructor(y, env, unbalanced) {
		if (y) {
			this.gene = y;
			this.unbalanced = unbalanced;
			this.collidePotential =
				this.getCollidePotential(env) + this.getSevereDistortionPotential(env);
			this.ablationPotential = this.getAblationPotential(env);
		}
	}
	clone() {
		let idv = new Individual();
		idv.gene = [...this.gene];
		idv.unbalanced = this.unbalanced;
		idv.collidePotential = this.collidePotential;
		idv.ablationPotential = this.ablationPotential;
		return idv;
	}
	getFitness() {
		return (
			1 / (1 + Math.max(0, this.collidePotential + this.ablationPotential * ABLATION_MARK))
		);
	}
	compare(that) {
		const f1 = this.getFitness();
		const f2 = that.getFitness();
		return f1 - f2;
		// if (this.collidePotential < that.collidePotential) return 1;
		// if (this.collidePotential > that.collidePotential) return -1;
		// if (this.ablationPotential < that.ablationPotential) return 1;
		// if (this.ablationPotential > that.ablationPotential) return -1;
		// return 0;
	}
	better(that) {
		return this.compare(that) > 0;
	}

	getCollidePotential(env) {
		const y = this.gene,
			A = env.A,
			C = env.C,
			F = env.F,
			n = y.length,
			avails = env.avails,
			ppem = env.ppem,
			sol = env.stemOverlapLengths,
			dov = env.directOverlaps;
		let nCol = 0;
		let pA = 0,
			pC = 0,
			pCompress = 0;
		for (let j = 0; j < n; j++) {
			for (let k = 0; k < j; k++) {
				if (dov[j][k] && F[j][k] > 4 && y[j] <= 1 + y[k] + avails[j].properWidth) {
					const d = 2 - (y[j] - avails[j].properWidth - y[k]);
					pC += C[j][k] * d * d; // Collide
					if (C[j][k]) nCol += sol[j][k] * ppem * ppem * 0.04;
				}
				if (y[j] === y[k]) {
					if (dov[j][k]) pA += A[j][k]; // Annexation
				} else if (y[j] <= y[k] + avails[j].properWidth) {
					const d = 1 - (y[j] - avails[j].properWidth - y[k]);
					pC += C[j][k] * d * d; // Collide
					if (C[j][k])
						nCol +=
							sol[j][k] *
							ppem *
							ppem *
							0.04 *
							((avails[j].diagLow && !avails[k].diagHigh) ||
							(!avails[j].diagLow && avails[k].diagHigh)
								? 3
								: 1);
				}
			}
		}
		return pA + pC * nCol * nCol + pCompress;
	}

	getSevereDistortionPotential(env) {
		return (
			this._getDiagonalBreakP(env) + this._getSwapAndSymBreakP(env) + this._getSoftBreakP(env)
		);
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
	_getSoftBreakP(env) {
		const y = this.gene,
			avails = env.avails,
			n = y.length;
		let p = 0;
		for (let j = 0; j < n; j++) {
			if (y[j] < avails[j].softLow) {
				p += env.strategy.COEFF_C_MULTIPLIER * env.strategy.COEFF_C_FEATURE_LOSS;
			}
		}
		return p;
	}

	getAblationPotential(env) {
		return (
			this._getOverseparationP(env) * env.COEFF_OVERSEP +
			this._getTripletBreakP(env) +
			this._getShiftP(env)
		);
	}

	_measureTripletDistort(d1, d2, spacejk, spacekw, adjust, sym) {
		let p = 0;
		const finelimit = 1 / 8;
		const dlimit = 1 / 3;
		const dlimitx = 2 / 3;
		const compressLimit = 3 / 4;

		const d = d1 - d2;
		const expanded = spacejk > d1 + compressLimit && spacekw > d2 + compressLimit;
		const compressed = spacejk < d1 - compressLimit && spacekw < d2 - compressLimit;
		if (
			(d >= dlimitx && spacejk <= spacekw) ||
			(d >= dlimit && spacejk < spacekw) ||
			(d <= -dlimitx && spacejk >= spacekw) ||
			(d <= -dlimit && spacejk > spacekw) ||
			(d < dlimit && d > -dlimit && (spacejk - spacekw > 1 || spacejk - spacekw < -1)) ||
			(d < dlimit && d > -dlimit && (compressed || expanded))
		) {
			p += adjust;
		}
		if (d < finelimit && d > -finelimit && spacejk !== spacekw) {
			p += adjust / 3;
			if (sym) p += adjust * 32;
		}
		return p;
	}

	_getTripletBreakP(env) {
		if (env.noAblation) return 0;

		const y = this.gene,
			avails = env.avails,
			triplets = env.triplets,
			uppx = env.uppx,
			n = y.length,
			dov = env.directOverlaps;

		let p = 0;

		// Triplet distortion
		for (let _t = 0; _t < triplets.length; _t++) {
			const [j, k, w] = triplets[_t];
			if (!(y[j] > y[k] && y[k] > y[w])) continue;
			p += this._measureTripletDistort(
				avails[j].y0px - avails[j].w0px - avails[k].y0px,
				avails[k].y0px - avails[k].w0px - avails[w].y0px,
				y[j] - y[k] - avails[j].properWidth,
				y[k] - y[w] - avails[k].properWidth,
				(env.C[j][k] + env.C[k][w]) * env.strategy.COEFF_DISTORT,
				avails[j].xmin === avails[k].xmin &&
					avails[k].xmin === avails[w].xmin &&
					avails[j].xmax === avails[k].xmax &&
					avails[k].xmax === avails[w].xmax
			);
		}
		// Top and bot dispace
		// for (let j = 0; j < n; j++) {
		// 	for (let k = 0; k < j; k++) {
		// 		if (!dov[j][k]) continue;
		// 		if (y[j] <= y[k]) continue;
		// 		if (!avails[j].hasGlyphStemAbove) {
		// 			p += this._measureTripletDistort(
		// 				env.glyphTopPixels - avails[j].y0px,
		// 				avails[j].y0px - avails[j].w0px - avails[k].y0px,
		// 				env.glyphTopPixels - y[j],
		// 				y[j] - y[k] - avails[j].properWidth,
		// 				env.C[j][k] * env.strategy.COEFF_DISTORT
		// 			);
		// 		}
		// 		if (!avails[k].hasGlyphStemBelow) {
		// 			p += this._measureTripletDistort(
		// 				avails[j].y0px - avails[j].w0px - avails[k].y0px,
		// 				avails[k].y0px - avails[k].w0px - env.glyphBottomPixels,
		// 				y[j] - avails[j].properWidth - y[k],
		// 				y[k] - avails[k].properWidth - env.glyphBottomPixels,
		// 				env.C[j][k] * env.strategy.COEFF_DISTORT
		// 			);
		// 		}
		// 	}
		// }
		return p;
	}
	_measureDistort(d, d0, pCompress, pSeparation) {
		if (d0 <= 0 || d < 0) return 0;
		if (d < d0) {
			const overCompression = d0 / (d + 1) - d / (d + 1);
			return overCompression * overCompression * pCompress;
		} else {
			const overSeparation = d / (d0 + 1) - d0 / (d0 + 1);
			return overSeparation * overSeparation * pSeparation;
		}
	}
	_getOverseparationP(env) {
		const y = this.gene,
			avails = env.avails,
			n = y.length,
			P = env.P;
		let p = 0;
		for (let j = 0; j < n; j++) {
			for (let k = 0; k < j; k++) {
				const d = y[j] - avails[j].properWidth - y[k];
				const d0 = avails[j].y0px - avails[j].w0px - avails[k].y0px;
				p += this._measureDistort(d, d0, P[j][k] + 1, 1);
			}
		}
		return p;
	}
	_getShiftP(env) {
		let p = 0;
		const avails = env.avails,
			y = this.gene,
			n = y.length;
		for (let j = 0; j < n; j++) {
			p += (y[j] - avails[j].center) * (y[j] - avails[j].center);
		}
		return p;
	}
}

module.exports = Individual;
