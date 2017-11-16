const roundings = require("../support/roundings");
const { toVQ, xclamp } = require("../support/common");
const { decideDeltaShift, getSWCFG } = require("../instructor/delta");
const BG_COLOR = "white";

function interpolate(a, b, c) {
	if (c.y <= a.y) c.ytouch = c.y - a.y + a.ytouch;
	else if (c.y >= b.y) c.ytouch = c.y - b.y + b.ytouch;
	else c.ytouch = (c.y - a.y) / (b.y - a.y) * (b.ytouch - a.ytouch) + a.ytouch;
}
function interpolateIP(a, b, c) {
	c.touched = true;
	if (a.y === b.y) {
		c.ytouch = c.y - a.y + a.ytouch;
	} else {
		c.ytouch = (c.y - a.y) / (b.y - a.y) * (b.ytouch - a.ytouch) + a.ytouch;
	}
}
function IUPy(contours) {
	for (var j = 0; j < contours.length; j++) {
		var contour = contours[j];
		var k = 0;
		while (k < contour.points.length && !contour.points[k].touched) k++;
		if (contour.points[k]) {
			// Found a touched point in contour
			// Copy coordinates for first/last point
			if (contour.points[0].touched && !contour.points[contour.points.length - 1].touched) {
				contour.points[contour.points.length - 1].touched = true;
				contour.points[contour.points.length - 1].ytouch = contour.points[0].ytouch;
			} else if (
				!contour.points[0].touched &&
				contour.points[contour.points.length - 1].touched
			) {
				contour.points[0].touched = true;
				contour.points[0].ytouch = contour.points[contour.points.length - 1].ytouch;
			}
			var kleft = k,
				k0 = k;
			var untoucheds = [];
			for (var k = 0; k <= contour.points.length; k++) {
				var ki = (k + k0) % contour.points.length;
				if (contour.points[ki].touched) {
					var pleft = contour.points[kleft];
					var pright = contour.points[ki];
					var lower = pleft.y < pright.y ? pleft : pright;
					var higher = pleft.y < pright.y ? pright : pleft;
					for (var w = 0; w < untoucheds.length; w++)
						interpolate(lower, higher, untoucheds[w]);
					untoucheds = [];
					kleft = ki;
				} else {
					untoucheds.push(contour.points[ki]);
				}
			}
		}
	}
}
function untouchAll(contours) {
	for (var j = 0; j < contours.length; j++)
		for (var k = 0; k < contours[j].points.length; k++) {
			contours[j].points[k].touched = false;
			contours[j].points[k].donttouch = false;
			contours[j].points[k].ytouch = contours[j].points[k].y;
		}
}

function calculateYW(upm, ppem, stem, action, swcfgCtx) {
	const uppx = upm / ppem;
	var h, l;
	if (stem.posKeyAtTop) {
		h = stem.posKey;
		l = stem.advKey;
	} else {
		h = stem.advKey;
		l = stem.posKey;
	}
	const keyDX = h.x - l.x;
	let [y, w, strict, stacked] = action;
	const h_ytouch = y * uppx;
	const l_ytouch = (y - w) * uppx - keyDX * stem.slope;

	const swcfg = getSWCFG(swcfgCtx, 1, ppem);

	if (stem.posKeyAtTop) {
		const delta = decideDeltaShift(
			8,
			-1,
			strict,
			stacked,
			0,
			h.y - l.y,
			0,
			w * uppx,
			upm,
			ppem,
			0,
			swcfg
		);
		return { h, l, h_ytouch, l_ytouch: h_ytouch - (h.y - l.y) + delta / 8 * uppx };
	} else {
		const delta = decideDeltaShift(
			8,
			1,
			strict,
			stacked,
			0,
			h.y - l.y,
			0,
			w * uppx,
			upm,
			ppem,
			0,
			swcfg
		);
		return { h, l, l_ytouch, h_ytouch: l_ytouch + (h.y - l.y) + delta / 8 * uppx };
	}
}

function interpretTT(glyphs, strategy, ppem) {
	const rtg = roundings.Rtg(strategy.UPM, ppem);

	for (var j = 0; j < glyphs.length; j++) {
		var glyph = glyphs[j].glyph,
			features = glyphs[j].features;
		untouchAll(glyph.contours);
		var actions = glyphs[j].hints[ppem];

		// Bottom blues
		features.blueZoned.bottomZs.forEach(function(z) {
			glyph.indexedPoints[z.id].touched = true;
			glyph.indexedPoints[z.id].ytouch = rtg(strategy.BLUEZONE_BOTTOM_CENTER);
		});
		// Top blues
		features.blueZoned.topZs.forEach(function(z) {
			glyph.indexedPoints[z.id].touched = true;
			//glyph.indexedPoints[z.id].ytouch = rtg(strategy.BLUEZONE_TOP_CENTER);
			glyph.indexedPoints[z.id].ytouch = Math.round(
				rtg(strategy.BLUEZONE_BOTTOM_CENTER) +
					rtg(strategy.BLUEZONE_TOP_CENTER - strategy.BLUEZONE_BOTTOM_CENTER)
			);
		});
		// Stems
		actions.y.forEach(function(action, j) {
			const { h, l, h_ytouch, l_ytouch } = calculateYW(
				strategy.UPM,
				ppem,
				features.stems[j],
				action,
				{
					minSW: strategy.MINIMAL_STROKE_WIDTH_PIXELS || 1 / 8,
					maxSWOverflowCpxs: strategy.MAX_SW_OVERFLOW_CPXS,
					maxSWShrinkCpxs: strategy.MAX_SW_SHRINK_CPXS
				}
			);
			glyph.indexedPoints[h.id].touched = glyph.indexedPoints[l.id].touched = true;
			glyph.indexedPoints[h.id].ytouch = h_ytouch;
			glyph.indexedPoints[l.id].ytouch = l_ytouch;
		});
		// Alignments
		glyph.stems.forEach(function(stem) {
			stem.posAlign.forEach(function(pt) {
				pt = glyph.indexedPoints[pt.id];
				pt.touched = true;
				const key = glyph.indexedPoints[stem.posKey.id];
				pt.ytouch = key.ytouch + pt.y - key.y;
			});
			stem.advAlign.forEach(function(pt) {
				pt = glyph.indexedPoints[pt.id];
				pt.touched = true;
				const key = glyph.indexedPoints[stem.advKey.id];
				pt.ytouch = key.ytouch + pt.y - key.y;
			});
		});
		// diagaligns
		for (let da of features.diagAligns) {
			for (let z of da.zs) {
				interpolateIP(
					glyph.indexedPoints[da.l],
					glyph.indexedPoints[da.r],
					glyph.indexedPoints[z]
				);
			}
		}
		// IPs
		var g = [];
		features.shortAbsorptions.forEach(function(s) {
			var priority = s[2];
			if (!g[priority])
				g[priority] = {
					interpolations: [],
					absorptions: [],
					pri: priority
				};
			g[priority].absorptions.push(s);
		});
		features.interpolations.forEach(function(s) {
			var priority = s[3];
			if (!g[priority])
				g[priority] = {
					interpolations: [],
					absorptions: [],
					pri: priority
				};
			g[priority].interpolations.push(s);
		});
		g.reverse().forEach(function(group) {
			if (!group) return;
			group.absorptions.forEach(function(group) {
				var a = glyph.indexedPoints[group[0]];
				var b = glyph.indexedPoints[group[1]];
				b.touched = true;
				b.ytouch = b.y + a.ytouch - a.y;
			});
			group.interpolations.forEach(function(group) {
				var a = glyph.indexedPoints[group[0]];
				var b = glyph.indexedPoints[group[1]];
				var c = glyph.indexedPoints[group[2]];
				interpolateIP(a, b, c);
			});
		});

		// IUPy
		IUPy(glyph.contours);
	}
}

const SUPERSAMPLING = 8;
const SAMPLING_Y = 4;
const DPI = 2;
const GAMMA = 1.5;

function renderTTFCurve(h, zs, m, txp, typ) {
	if (zs.length < 3) return;
	if (!zs[0].on) {
		// the contour starts at an off point
		if (zs[1].on) {
			zs = [...zs.slice(1), zs[0]];
		} else {
			zs = [
				{
					xtouch: (zs[0].xtouch + zs[1].xtouch) / 2,
					ytouch: (zs[0].ytouch + zs[1].ytouch) / 2,
					on: true
				},
				...zs.slice(1),
				zs[0]
			];
		}
	}
	zs.push(zs[0]);
	h.moveTo(txp(zs[0].xtouch, m), typ(zs[0].ytouch));
	for (var k = 1; k < zs.length; k++) {
		if (zs[k].on || !zs[k + 1]) {
			h.lineTo(txp(zs[k].xtouch, m), typ(zs[k].ytouch));
		} else {
			if (zs[k + 1].on) {
				h.quadraticCurveTo(
					txp(zs[k].xtouch, m),
					typ(zs[k].ytouch),
					txp(zs[k + 1].xtouch, m),
					typ(zs[k + 1].ytouch)
				);
				k += 1;
			} else {
				h.quadraticCurveTo(
					txp(zs[k].xtouch, m),
					typ(zs[k].ytouch),
					txp((zs[k].xtouch + zs[k + 1].xtouch) / 2, m),
					typ((zs[k].ytouch + zs[k + 1].ytouch) / 2)
				);
			}
		}
	}
}

function RenderPreviewForPPEM(glyphs, strategy, hdc, basex, basey, ppem) {
	const uppx = strategy.UPM / ppem;

	interpretTT(glyphs, strategy, ppem);

	// Create a temp canvas
	const hpixels = ppem * glyphs.length;
	const vpixels = ppem + 1;
	var eTemp = document.createElement("canvas");
	eTemp.width = hpixels * 3 * SUPERSAMPLING;
	eTemp.height = vpixels * SAMPLING_Y;
	var hTemp = eTemp.getContext("2d");
	hTemp.fillStyle = "white";
	hTemp.fillRect(0, 0, eTemp.width, eTemp.height);

	function txp(x, m) {
		let v = (x + m * strategy.UPM) / uppx * 3 * SUPERSAMPLING;
		if (!isFinite(v)) v = 0;
		return v;
	}
	function typ(y) {
		let v = (-y / uppx + Math.round(strategy.BLUEZONE_TOP_CENTER / uppx) + 1) * SAMPLING_Y;
		if (!isFinite(v)) v = 0;
		return v;
	}
	// Fill
	hTemp.fillStyle = "black";
	for (var m = 0; m < glyphs.length; m++) {
		hTemp.beginPath();
		for (var j = 0; j < glyphs[m].glyph.contours.length; j++) {
			renderTTFCurve(hTemp, glyphs[m].glyph.contours[j].points.slice(0), m, txp, typ);
			hTemp.closePath();
		}
		hTemp.fill("nonzero");
	}

	// Downsampling
	const ori = hTemp.getImageData(0, 0, eTemp.width, eTemp.height);
	const eAA = document.createElement("canvas");
	eAA.width = hpixels;
	eAA.height = vpixels;
	const hAA = eAA.getContext("2d");

	for (var j = 0; j < vpixels; j++) {
		let aa = hAA.createImageData(hpixels, 1);
		for (var k = 0; k < hpixels; k++) {
			aa.data[k * 4] = 0xff;
			aa.data[k * 4 + 1] = 0;
			aa.data[k * 4 + 2] = 0;
			aa.data[k * 4 + 3] = 0xff;
			for (var component = 0; component < 3; component++) {
				let coverage = 0;
				for (let ssy = 0; ssy < SAMPLING_Y; ssy++)
					for (let ss = -SUPERSAMPLING; ss < SUPERSAMPLING * 2; ss++) {
						const origRow = j * SAMPLING_Y + ssy;
						let origCol = (k * 3 + component) * SUPERSAMPLING + ss;
						if (origCol < 0) origCol = 0;
						if (origCol >= eTemp.width) origCol = eTemp.width - 1;
						const origPixelId = eTemp.width * origRow + origCol;
						const raw = ori.data[origPixelId * 4];
						coverage += raw < 128 ? 1 : 0;
					}
				const alpha = coverage / (3 * SUPERSAMPLING * SAMPLING_Y);
				aa.data[k * 4 + component] = 255 * Math.pow(1 - alpha, 1 / GAMMA);
			}
		}
		hAA.putImageData(aa, 0, j);
	}
	hdc.imageSmoothingEnabled = false;
	hdc.drawImage(eAA, basex, basey, eAA.width * DPI, eAA.height * DPI);
}

let renderHandle = { handle: null };

function renderPreview(canvas, glyphs, strategy) {
	if (!canvas) return;
	const hPreview = canvas.getContext("2d");
	hPreview.font = 12 * DPI + "px sans-serif";
	let y = 10 * DPI;
	let ppem = strategy.PPEM_MIN;
	function renderView() {
		// fill with white
		hPreview.fillStyle = BG_COLOR;
		hPreview.fillRect(0, y, 128 + glyphs.length * DPI * ppem, y + DPI * ppem);
		// render
		RenderPreviewForPPEM(glyphs, strategy, hPreview, 128, y, ppem);
		hPreview.fillStyle = "black";
		hPreview.fillText(
			ppem + "",
			0,
			y + ppem * (strategy.BLUEZONE_TOP_CENTER / strategy.UPM) * DPI
		);
		y += Math.round(ppem * 1.2) * DPI;
		ppem += 1;
		if (ppem <= strategy.PPEM_MAX) {
			if (renderHandle.handle) {
				clearTimeout(renderHandle.handle);
			}
			setTimeout(renderView, 0);
		} else {
			renderHandle.handle = null;
		}
	}
	if (renderHandle.handle) {
		clearTimeout(renderHandle.handle);
	}
	setTimeout(renderView, 0);
}

function clean(canvas) {
	if (!canvas) return;
	const hPreview = canvas.getContext("2d");
	hPreview.fillStyle = BG_COLOR;
	hPreview.fillRect(0, 0, canvas.width, canvas.height);
}

function renderLoading(canvas) {
	if (!canvas) return;
	const hPreview = canvas.getContext("2d");
	hPreview.fillStyle = BG_COLOR;
	hPreview.fillRect(0, 0, canvas.width, canvas.height);
	hPreview.font = "24px sans-serif";
	hPreview.fillStyle = "black";
	hPreview.fillText("Loading...", 24, 24);
}

exports.renderPreview = renderPreview;
exports.clean = clean;
exports.renderLoading = renderLoading;
