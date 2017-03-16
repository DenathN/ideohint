var roundings = require('../roundings');


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
			} else if (!contour.points[0].touched && contour.points[contour.points.length - 1].touched) {
				contour.points[0].touched = true;
				contour.points[0].ytouch = contour.points[contour.points.length - 1].ytouch;
			}
			var kleft = k, k0 = k;
			var untoucheds = []
			for (var k = 0; k <= contour.points.length; k++) {
				var ki = (k + k0) % contour.points.length;
				if (contour.points[ki].touched) {
					var pleft = contour.points[kleft];
					var pright = contour.points[ki];
					var lower = pleft.y < pright.y ? pleft : pright
					var higher = pleft.y < pright.y ? pright : pleft
					for (var w = 0; w < untoucheds.length; w++) interpolate(lower, higher, untoucheds[w]);
					untoucheds = [];
					kleft = ki;
				} else {
					untoucheds.push(contour.points[ki])
				}
			}
		}
	}
}
function untouchAll(contours) {
	for (var j = 0; j < contours.length; j++) for (var k = 0; k < contours[j].points.length; k++) {
		contours[j].points[k].touched = false;
		contours[j].points[k].donttouch = false;
		contours[j].points[k].ytouch = contours[j].points[k].y;
	}
}

function BY_PRIORITY_SHORT(p, q) { return q[2] - p[2] }
function BY_PRIORITY_IP(p, q) { return q[3] - p[3] }

function interpretTT(glyphs, strategy, ppem) {
	const rtg = roundings.Rtg(strategy.UPM, ppem);
	const roundDown = roundings.Rdtg(strategy.UPM, ppem);
	const uppx = strategy.UPM / ppem;

	for (var j = 0; j < glyphs.length; j++) {
		var glyph = glyphs[j].glyph, features = glyphs[j].features;
		untouchAll(glyph.contours);
		var actions = glyphs[j].hints[ppem];

		// Bottom blues
		features.bottomBluePoints.forEach(function (pid) {
			glyph.indexedPoints[pid].touched = true;
			glyph.indexedPoints[pid].ytouch = rtg(strategy.BLUEZONE_BOTTOM_CENTER)
		})
		// Top blues
		features.topBluePoints.forEach(function (pid) {
			glyph.indexedPoints[pid].touched = true;
			glyph.indexedPoints[pid].ytouch = Math.round(rtg(strategy.BLUEZONE_BOTTOM_CENTER) + rtg(strategy.BLUEZONE_TOP_CENTER - strategy.BLUEZONE_BOTTOM_CENTER));
		})
		// Stems
		actions.forEach(function (action, j) {
			var h, l;
			const stem = features.stems[j];
			if (stem.posKeyAtTop) {
				h = glyph.indexedPoints[stem.posKey.id], l = glyph.indexedPoints[stem.advKey.id]
			} else {
				h = glyph.indexedPoints[stem.advKey.id], l = glyph.indexedPoints[stem.posKey.id]
			}
			const [y, w, strict, stacked] = action;
			const yTopTarget = h.ytouch = (y) * uppx;
			const yBotTarget = l.ytouch = (y - w) * uppx;
			h.touched = l.touched = true;
			if (strict || w === 1 && h.y - l.y <= uppx && !stacked) return;
			if (stem.posKeyAtTop) {
				const dir = w * uppx > h.y - l.y ? (1 / 16) * uppx : (-1 / 16) * uppx;
				while (rtg(yBotTarget) === rtg(l.ytouch) && (stacked || (dir > 0
					? yTopTarget - l.ytouch > h.y - l.y
					: yTopTarget - l.ytouch < h.y - l.y))) {
					l.ytouch += dir;
				}
			} else {
				const dir = w * uppx > h.y - l.y ? (-1 / 16) * uppx : (1 / 16) * uppx;
				while (rtg(yTopTarget) === rtg(h.ytouch) && (stacked || (dir > 0
					? h.ytouch - yBotTarget < h.y - l.y
					: h.ytouch - yBotTarget > h.y - l.y))) {
					h.ytouch += dir;
				}
			}
		});
		// Alignments
		glyph.stems.forEach(function (stem) {
			stem.posAlign.forEach(function (pt) {
				pt = glyph.indexedPoints[pt.id]
				pt.touched = true;
				pt.ytouch = glyph.indexedPoints[stem.posKey.id].ytouch
			})
			stem.advAlign.forEach(function (pt) {
				pt = glyph.indexedPoints[pt.id]
				pt.touched = true;
				pt.ytouch = glyph.indexedPoints[stem.advKey.id].ytouch
			})
		});
		// diagaligns
		for (let da of features.diagAligns) {
			for (let z of da.zs) {
				interpolateIP(da.l, da.r, z);
			}
		}
		// IPs
		var g = [];
		features.shortAbsorptions.forEach(function (s) {
			var priority = s[2];
			if (!g[priority]) g[priority] = {
				interpolations: [],
				absorptions: [],
				pri: priority
			}
			g[priority].absorptions.push(s);
		});
		features.interpolations.forEach(function (s) {
			var priority = s[3];
			if (!g[priority]) g[priority] = {
				interpolations: [],
				absorptions: [],
				pri: priority
			}
			g[priority].interpolations.push(s);
		});
		g.reverse().forEach(function (group) {
			if (!group) return;
			group.absorptions.forEach(function (group) {
				var a = glyph.indexedPoints[group[0]]
				var b = glyph.indexedPoints[group[1]]
				b.touched = true;
				b.ytouch = b.y + a.ytouch - a.y;
			});
			group.interpolations.forEach(function (group) {
				var a = glyph.indexedPoints[group[0]]
				var b = glyph.indexedPoints[group[1]]
				var c = glyph.indexedPoints[group[2]]
				interpolateIP(a, b, c)
			});
		});

		// IUPy
		IUPy(glyph.contours);
	};
}

const SUPERSAMPLING = 8;
const SAMPLING_Y = 4;
const DPI = 2;
const GAMMA = 2.4;
function RenderPreviewForPPEM(glyphs, strategy, hdc, basex, basey, ppem) {
	const uppx = strategy.UPM / ppem;

	interpretTT(glyphs, strategy, ppem);

	// Create a temp canvas
	const hpixels = ppem * glyphs.length;
	const vpixels = ppem + 1;
	var eTemp = document.createElement('canvas')
	eTemp.width = hpixels * 3 * SUPERSAMPLING;
	eTemp.height = vpixels * SAMPLING_Y;
	var hTemp = eTemp.getContext('2d')
	hTemp.fillStyle = "white";
	hTemp.fillRect(0, 0, eTemp.width, eTemp.height);

	function txp(x) { return (x / uppx) * 3 * SUPERSAMPLING }
	function typ(y) { return ((-y / uppx + Math.round(strategy.BLUEZONE_TOP_CENTER / uppx)) + 1) * SAMPLING_Y }
	// Fill
	hTemp.fillStyle = 'black';
	for (var m = 0; m < glyphs.length; m++) {
		hTemp.beginPath();
		for (var j = 0; j < glyphs[m].glyph.contours.length; j++) {
			var contour = glyphs[m].glyph.contours[j];
			hTemp.moveTo(txp(contour.points[0].xtouch + m * strategy.UPM), typ(contour.points[0].ytouch))
			for (var k = 1; k < contour.points.length; k++) {
				if (contour.points[k].on || !contour.points[k + 1]) {
					hTemp.lineTo(txp(contour.points[k].xtouch + m * strategy.UPM), typ(contour.points[k].ytouch))
				} else {
					hTemp.quadraticCurveTo(
						txp(contour.points[k].xtouch + m * strategy.UPM), typ(contour.points[k].ytouch),
						txp(contour.points[k + 1].xtouch + m * strategy.UPM), typ(contour.points[k + 1].ytouch))
					k += 1;
				}
			}
			hTemp.closePath();
		}
		hTemp.fill('nonzero');
	};

	// Downsampling
	const ori = hTemp.getImageData(0, 0, eTemp.width, eTemp.height);
	const eAA = document.createElement("canvas");
	eAA.width = hpixels;
	eAA.height = vpixels;
	const hAA = eAA.getContext("2d");

	for (var j = 0; j < vpixels; j++) {
		let aa = hAA.createImageData(hpixels, 1);
		for (var k = 0; k < hpixels; k++) {
			aa.data[k * 4] = 0xFF, aa.data[k * 4 + 1] = 0, aa.data[k * 4 + 2] = 0, aa.data[k * 4 + 3] = 0xFF;
			for (var component = 0; component < 3; component++) {
				let coverage = 0;
				for (let ssy = 0; ssy < SAMPLING_Y; ssy++)for (let ss = -SUPERSAMPLING; ss < SUPERSAMPLING * 2; ss++) {
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
	};
	hdc.imageSmoothingEnabled = false;
	hdc.drawImage(eAA, basex, basey, eAA.width * DPI, eAA.height * DPI);
};

let renderHandle = { handle: null }

function renderPreview(hPreview, glyphs, strategy) {
	hPreview.font = (12 * DPI) + 'px sans-serif'
	let y = 10 * DPI;
	let ppem = strategy.PPEM_MIN;
	function renderView() {
		// fill with white
		hPreview.fillStyle = 'white';
		hPreview.fillRect(0, y, 128 + glyphs.length * DPI * ppem, y + DPI * ppem)
		// render 
		RenderPreviewForPPEM(glyphs, strategy, hPreview, 128, y, ppem)
		hPreview.fillStyle = 'black';
		hPreview.fillText(ppem + '', 0, y + ppem * (strategy.BLUEZONE_TOP_CENTER / strategy.UPM) * DPI)
		y += Math.round(ppem * 1.2) * DPI;
		ppem += 1;
		if (ppem <= strategy.PPEM_MAX) {
			if (renderHandle.handle) { clearTimeout(renderHandle.handle); }
			setTimeout(renderView, 0);
		} else {
			renderHandle.handle = null;
		}
	}
	if (renderHandle.handle) { clearTimeout(renderHandle.handle); }
	setTimeout(renderView, 0);
}

exports.renderPreview = renderPreview;
exports.renderHandle = renderHandle;