"use strict";

const DIAG_BIAS_PIXELS = 1 / 6;
const DIAG_BIAS_PIXELS_NEG = 1 / 3;
class Individual {
	constructor(y, env, unbalanced) {
		if (y) {
			this.gene = y;
			this.unbalanced = unbalanced;
			this.collidePotential =
				this.getCollidePotential(env) + this.getSevereDistortionPotential(env);
			this.ablationPotential = this.getAblationPotential(env);
			this.fitness = this.getFitness();
		}
	}
	clone() {
		let idv = new Individual();
		idv.gene = [...this.gene];
		idv.unbalanced = this.unbalanced;
		idv.collidePotential = this.collidePotential;
		idv.ablationPotential = this.ablationPotential;
		idv.fitness = this.fitness;
		return idv;
	}
	getFitness() {
		return 1 / (1 + Math.max(0, this.collidePotential * 8 + this.ablationPotential / 16));
	}
	getCollidePotential(env) {
		const y = this.gene,
			A = env.A,
			C = env.C,
			n = y.length,
			avails = env.avails,
			ppem = env.ppem,
			sol = env.stemOverlapLengths,
			dov = env.directOverlaps;
		let nCol = 0;
		let pA = 0,
			pC = 0;
		for (let j = 0; j < n; j++) {
			for (let k = 0; k < j; k++) {
				if (y[j] === y[k]) {
					if (dov[j][k]) pA += A[j][k]; // Annexation
				} else if (y[j] <= y[k] + avails[j].properWidth) {
					pC += C[j][k] * (1 + avails[j].properWidth - (y[j] - y[k])); // Collide
					if (C[j][k]) nCol += sol[j][k] * ppem * ppem * 0.04;
				}
			}
		}
		return pA + pC * nCol * nCol;
	}

	getSevereDistortionPotential(env) {
		return this._getDiagonalBreakP(env) + this._getSwapAndSymBreakP(env);
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

	getAblationPotential(env) {
		return (
			this._getOverseparationP(env) * env.COEFF_OVERSEP +
			this._getTripletBreakP(env) +
			this._getShiftP(env)
		);
	}

	_getTripletBreakP(env) {
		if (env.noAblation) return 0;

		const y = this.gene,
			avails = env.avails,
			triplets = env.triplets,
			uppx = env.uppx;

		let p = 0;
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
