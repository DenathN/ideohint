var parseOTD = require('../../otdParser').parseOTD;
var Point = require('../../types').Point;
var voronoi = require('./voronoi');
var glyphs = document.getElementById('source').value.split('\n').map(function (passage, j) {
	if (passage.trim()) {
		return parseOTD(JSON.parse(passage.trim())[2])
	} else {
		return null;
	}
}).filter(function (x) { return !!x });
var strategy = {
	UPM: 1000,
	MIN_STEM_WIDTH: 20,
	MAX_STEM_WIDTH: 100,
	MOST_COMMON_STEM_WIDTH: 65,
	STEM_SIDE_MIN_RISE: 40,
	STEM_SIDE_MIN_DESCENT: 60,
	PPEM_MIN: 10,
	PPEM_MAX: 36,
	POPULATION_LIMIT: 400,
	CHILDREN_LIMIT: 175,
	EVOLUTION_STAGES: 40,
	MUTANT_PROBABLITY: 0.1,
	ELITE_COUNT: 10,
	ABLATION_IN_RADICAL: 1,
	ABLATION_RADICAL_EDGE: 2,
	ABLATION_GLYPH_EDGE: 15,
	ABLATION_GLYPH_HARD_EDGE: 25,
	COEFF_PORPORTION_DISTORTION: 4,
	BLUEZONE_BOTTOM_CENTER: -77,
	BLUEZONE_TOP_CENTER: 836,
	BLUEZONE_BOTTOM_LIMIT: -65,
	BLUEZONE_TOP_LIMIT: 810,
	BLUEZONE_WIDTH: 15,
	COEFF_A_MULTIPLIER: 10,
	COEFF_A_SAME_RADICAL: 4,
	COEFF_A_FEATURE_LOSS: 15,
	COEFF_A_RADICAL_MERGE: 1,
	COEFF_C_MULTIPLIER: 40,
	COEFF_C_SAME_RADICAL: 6,
	COEFF_S: 10000,
	COLLISION_MIN_OVERLAP_RATIO: 0.2,
	DONT_ADJUST_STEM_WIDTH: false,
	PPEM_STEM_WIDTH_GEARS: [[0, 1, 1], [22, 2, 1], [23, 2, 2], [35, 3, 2]]
};
function cxx_copy_simple_object(o) {
	var p = Object.getPrototypeOf(o);
	var r = {};
	for (var k in p) {
		if (p.hasOwnProperty(k)) {
			r[k] = o[k];
		}
	}
	return r;
}

function cxx_vector_map(cxx_vector, cb) {
	var rl = [];
	for (var i = 0, l = cxx_vector.size(); i < l; ++i) {
		var cxx_value = cxx_vector.get(i);

		var r = cb.call(null, cxx_value);

		cxx_value.delete();

		rl.push(r);
	}
	return rl;
}
function inPoly(point, vs) {
	// ray-casting algorithm based on
	// http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html

	var x = point.x, y = point.y;

	var inside = false;
	for (var i = 0, j = vs.length - 2; i < vs.length - 1; j = i++) {
		var xi = vs[i].x, yi = vs[i].y;
		var xj = vs[j].x, yj = vs[j].y;

		var intersect = ((yi > y) !== (yj > y))
			&& (yj > yi ? (x - xi) * (yj - yi) < (xj - xi) * (y - yi) : (x - xi) * (yj - yi) > (xj - xi) * (y - yi));
		if (intersect) inside = !inside;
	}

	return inside;
};
function containsPoint(contours, x, y) {
	var nCW = 0, nCCW = 0;
	for (var j = 0; j < contours.length; j++) {
		if (inPoly({ x: x, y: y }, contours[j].testpoints)) {
			if (contours[j].ccw) nCCW += 1;
			else nCW += 1;
		}
	};
	return nCCW != nCW
}
function construct_voronoi(glyph) {
	var cxx_vc = new voronoi.voronoi_constructor();

	var pointCache = [];

	var glyphSegments = [];
	var testSegments = [];

	for (var j = 0; j < glyph.contours.length; j++) {
		var contour = glyph.contours[j];

		// Layer 1 : Control outline
		var x0 = contour.points[0].xori;
		var y0 = contour.points[0].yori;
		var testpoints = [{ x: x0, y: y0 }];
		contour.testpoints = testpoints;
		for (var k = 1; k < contour.points.length; k++) {
			if (contour.points[k].on) {
				var x1 = contour.points[k].xori
				var y1 = contour.points[k].yori
				var gs = [contour.points[k - 1], contour.points[k]];
				var ts = [gs, x0, y0, x1, y1];
				glyphSegments.push(gs);
				testSegments.push(ts);
				x0 = x1;
				y0 = y1;
				testpoints.push({ x: x1, y: y1 });
			} else {
				var x1 = contour.points[k].xori;
				var y1 = contour.points[k].yori;
				var next = contour.points[k + 1];
				if (next.on) {
					var x2 = next.xori;
					var y2 = next.yori;
				} else {
					var x2 = (x1 + next.xori) / 2;
					var y2 = (y1 + next.yori) / 2;
				}
				var SEGMENTS = 7;
				var gs = [contour.points[k - 1], contour.points[k], contour.points[k + 1]];
				glyphSegments.push(gs);
				for (var s = 0; s < SEGMENTS; s++) {
					var t = s / SEGMENTS;
					var ts = [gs,
						(1 - s / SEGMENTS) * (1 - s / SEGMENTS) * x0 + 2 * (s / SEGMENTS) * (1 - s / SEGMENTS) * x1 + (s / SEGMENTS) * (s / SEGMENTS) * x2,
						(1 - s / SEGMENTS) * (1 - s / SEGMENTS) * y0 + 2 * (s / SEGMENTS) * (1 - s / SEGMENTS) * y1 + (s / SEGMENTS) * (s / SEGMENTS) * y2,
						(1 - (s + 1) / SEGMENTS) * (1 - (s + 1) / SEGMENTS) * x0 + 2 * ((s + 1) / SEGMENTS) * (1 - (s + 1) / SEGMENTS) * x1 + ((s + 1) / SEGMENTS) * ((s + 1) / SEGMENTS) * x2,
						(1 - (s + 1) / SEGMENTS) * (1 - (s + 1) / SEGMENTS) * y0 + 2 * ((s + 1) / SEGMENTS) * (1 - (s + 1) / SEGMENTS) * y1 + ((s + 1) / SEGMENTS) * ((s + 1) / SEGMENTS) * y2]
					testSegments.push(ts);
					testpoints.push({ x: ts[1], y: ts[2] });
				}
				x0 = x2;
				y0 = y2;
				if (next.on) k += 1;
				testpoints.push({ x: x2, y: y2 });
			}
		};
	};

	for (var i = 0, l = testSegments.length; i < l; ++i) {
		var x0 = Math.round(testSegments[i][1]);
		var y0 = Math.round(testSegments[i][2]);
		var x1 = Math.round(testSegments[i][3]);
		var y1 = Math.round(testSegments[i][4]);
		if (!pointCache[x0]) pointCache[x0] = []; pointCache[x0][y0] = true;
		if (!pointCache[x1]) pointCache[x1] = []; pointCache[x0][y0] = true;
		cxx_vc.insert_segment(x0, y0, x1, y1);
	}

	var cxx_result = cxx_vc.construct();
	cxx_vc['delete']();

	var cxx_vertexes = cxx_result.vertexes;
	var cxx_edges = cxx_result.edges;
	var cxx_cells = cxx_result.cells;


	var vertexes = cxx_vector_map(cxx_vertexes, cxx_copy_simple_object);
	var edges = cxx_vector_map(cxx_edges, cxx_copy_simple_object);
	var cells = cxx_vector_map(cxx_cells, cxx_copy_simple_object);

	cxx_vertexes['delete']();
	cxx_edges['delete']();
	cxx_cells['delete']();
	cxx_result['delete']();

	for (var j = 0; j < vertexes.length; j++) {
		var p = vertexes[j];
		if (pointCache[p.x] && pointCache[p.x][p.y]) {
			p.inside = p.border = true
		} else if (containsPoint(glyph.contours, p.x, p.y)) {
			p.inside = true;
		}
	};

	return {
		vertexes: vertexes,
		edges: edges,
		cells: cells,
		testSegments: testSegments
	}
}

function extractStems(diagram) {
	var edges = diagram.edges;
	var candidates = []
	for (var j = 0; j < edges.length; j++) if (edges[j].vertex0_index >= 0 && edges[j].vertex1_index >= 0) {
		var v0 = diagram.vertexes[edges[j].vertex0_index], v1 = diagram.vertexes[edges[j].vertex1_index]
		if (v0.inside && v1.inside && !v0.border && !v1.border) {
			if (Math.abs(v1.y - v0.y) < 0.15 * Math.abs(v1.x - v0.x)) {
				candidates.push(edges[j])
			}
		}
	}
	return candidates
}

function nearestAttach(v, arc) {
	var mind = 0xFFFF, minp = arc[0];
	for (var j = 0; j < arc.length; j++) {
		var d = Math.hypot(arc[j].xori - v.x, arc[j].yori - v.y);
		if (d <= mind) {
			minp = arc[j];
			mind = d;
		}
	}
	return minp;
}
function val(z1, z2) {
	return Math.hypot(z1.x - z2.x, z1.y - z2.y) <= 1;
}
function valz(z1, z2) {
	return z1.id === z2.id;
}
function vy(z1, z2) {
	return Math.abs(z1.yori - z2.yori) <= 1
}

function spp(a, b, c, d) {
	return Math.max(a.y, b.y, c.y, d.y) - Math.min(a.y, b.y, c.y, d.y) <= 8
}

function mergible(s1, s2) {
	return val(s1.v1, s2.v1) || val(s1.v0, s2.v0) || val(s1.v0, s2.v1) || val(s1.v1, s2.v0)
		|| s1.pos === s2.pos && (valz(s1.a1, s2.a1) || valz(s1.a0, s2.a0) || valz(s1.a0, s2.a1) || valz(s1.a1, s2.a0)
			|| s1.edge === s2.edge && !(s1.ak === 8 || s1.ak === 9)
			|| vy(s1.a1, s2.a1) && vy(s1.a0, s2.a0) && vy(s1.a0, s2.a1) && vy(s1.a1, s2.a0)) && spp(s1.v0, s1.v1, s2.v0, s2.v1)
}
function by_val(a, b) { return a - b }
function uniq(a) {
    return a.sort(by_val).filter(function (item, pos, ary) {
        return !pos || item != ary[pos - 1];
    })
}
function present(x) { return !!x }

function getkind(segs, k) {
	if (segs[k].kind === k) return k;
	else return segs[k].kind = getkind(segs, segs[k].kind);
}

var POS_ABOVE = 1;
var POS_BELOW = -1;
var POS_MID = 0

function getpos(v0, v1, a0, a1) {
	if (a0.yori > v0.y && a1.yori > v1.y && a0.yori > v1.y && a1.yori > v0.y) return POS_ABOVE;
	if (a0.yori < v0.y && a1.yori < v1.y && a0.yori < v1.y && a1.yori < v0.y) return POS_BELOW;
	return POS_MID;
}

function render() {
	var INDEX = 0;
	var ppem = 1350;
	var hPreview = document.getElementById('preview').getContext('2d');
	function txp(x) { return ((x + 50) / strategy.UPM * ppem) };
	function typ(y) { return Math.round((- y + strategy.BLUEZONE_TOP_CENTER / 1000 * strategy.UPM + 100) / strategy.UPM * ppem) };

var glyph = glyphs[INDEX];
	var diagram = construct_voronoi(glyph);
	var edges = diagram.edges;
	
	var extremeEdges = [];
	for (var j = 0; j < glyph.contours.length; j++) {
		var contour = glyph.contours[j];
		for (var k = 0; k < contour.points.length; k++) if(contour.points[k].on) for(var m = 0; m < edges.length; m++){
			var v0 = diagram.vertexes[edges[m].vertex0_index], v1 = diagram.vertexes[edges[m].vertex1_index];
			if(v0 && v1 && v0.x === contour.points[k].xori && v0.y === contour.points[k].yori && v1.inside && !v1.border){
				extremeEdges.push(edges[m]);
			}
		}
	}
	for (var j = 0; j < extremeEdges.length; j++) {
		var v0 = diagram.vertexes[extremeEdges[j].vertex0_index], v1 = diagram.vertexes[extremeEdges[j].vertex1_index];
		hPreview.lineWidth = 1;
		hPreview.strokeStyle = 'red';
		hPreview.beginPath();
		hPreview.moveTo(txp(v0.x), typ(v0.y));
		hPreview.lineTo(txp(v1.x), typ(v1.y));
		hPreview.stroke();
	}

	// Voronoi diagram constructor
	var segs = [];

	var sss = extractStems(diagram);
	for (var j = 0; j < sss.length; j++) {
		var v0 = diagram.vertexes[sss[j].vertex0_index], v1 = diagram.vertexes[sss[j].vertex1_index]

		var cell = diagram.cells[sss[j].cell_index];
		hPreview.lineWidth = 1;
		var xm = (v0.x + v1.x) / 2;
		var ym = (v0.y + v1.y) / 2;
		var doit = false;
		var attach = null;
		if (cell.source_category === 8 || cell.source_category === 9) {
			var s = diagram.testSegments[cell.source_index];
			var a = s[4] - s[2];
			var b = s[1] - s[3];
			var c = s[3] * s[2] - s[1] * s[4];
			var xh = (b * b * xm - a * b * ym - a * c) / (a * a + b * b);
			var yh = (-a * b * xm + a * a * ym - b * c) / (a * a + b * b);
			doit = true;
		} else if (cell.source_category === 1) {
			var s = diagram.testSegments[cell.source_index];
			var xh = s[1]
			var yh = s[2]
			if (s[0].length === 2) {
				attach = s[0][0];
			}
			doit = true;
		} else if (cell.source_category === 2) {
			var s = diagram.testSegments[cell.source_index];
			var xh = s[3];
			var yh = s[4];
			if (s[0].length === 2) {
				attach = s[0][1];
			}
			doit = true;
		}
		if (doit) {
			if (attach) {
				segs.push({
					v0: v0, v1: v1, a0: attach, a1: attach, edge: s, kind: segs.length, pos: getpos(v0, v1, attach, attach), ak: cell.source_category
				});
			} else {
				var a0 = nearestAttach(v0, s[0]);
				var a1 = nearestAttach(v1, s[0]);
				segs.push({
					v0: v0, v1: v1, a0: a0, a1: a1, edge: s, kind: segs.length, pos: getpos(v0, v1, a0, a1), ak: cell.source_category
				});
			}
		}
	}
	for (var j = 0; j < segs.length; j++) for (var k = j + 1; k < segs.length; k++) {
		if (mergible(segs[j], segs[k])) {
			segs[getkind(segs, k)].kind = getkind(segs, j);
		}
	}

	var kh = [];
	var totalDifferentKinds = 0;
	for (var j = 0; j < segs.length; j++) {
		var kind = getkind(segs, j);
		if (!kh[kind]) {
			kh[kind] = totalDifferentKinds + 1;
			totalDifferentKinds += 1;
		}
	}
	for (var j = 0; j < segs.length; j++) {
		var s = segs[j];
		var color = 'hsl(' + (360 * kh[getkind(segs, j)] / totalDifferentKinds) + ', 100%, 40% )';
		hPreview.lineWidth = 3;
		hPreview.strokeStyle = color;
		hPreview.beginPath();
		hPreview.moveTo(txp(s.v0.x), typ(s.v0.y))
		hPreview.lineTo(txp(s.v1.x), typ(s.v1.y))
		hPreview.stroke();
		hPreview.lineWidth = 1;
		/*
		//if (s.a0.on) {
		hPreview.beginPath();
		hPreview.moveTo(txp(s.v0.x), typ(s.v0.y));
		hPreview.lineTo(txp(s.a0.xori), typ(s.a0.yori));
		hPreview.stroke();
		//}
		//if (s.a1.on) {
		hPreview.beginPath();
		hPreview.moveTo(txp(s.v1.x), typ(s.v1.y));
		hPreview.lineTo(txp(s.a1.xori), typ(s.a1.yori));
		hPreview.stroke();
		//}*/
	}

	var stems = [];
	for (var j = 0; j < segs.length; j++) {
		var s = segs[j];
		var kind = getkind(segs, j);
		if (!stems[kind]) {
			stems[kind] = {
				high: [], low: []
			}
		}
		if (s.pos === POS_ABOVE) {
			stems[kind].high.push(s.a0.id, s.a1.id)
		} else if (s.pos === POS_BELOW) {
			stems[kind].low.push(s.a0.id, s.a1.id)
		}
	}
	stems = stems.map(function (s) {
		if (!s) return;
		s.high = uniq(s.high);
		s.low = uniq(s.low);
		if (s.high.length && s.low.length) {
			return s;
		}
	}).filter(present);

	console.log(stems);

	hPreview.beginPath();
	for (var j = 0; j < glyphs[INDEX].contours.length; j++) {
		var contour = glyphs[INDEX].contours[j];
		// Layer 1 : Control outline
		var x0 = contour.points[0].xori
		var y0 = contour.points[0].yori
		hPreview.moveTo(txp(x0), typ(y0));
		for (var k = 1; k < contour.points.length; k++) {
			if (contour.points[k].on) {
				var x1 = contour.points[k].xori
				var y1 = contour.points[k].yori
				hPreview.lineTo(txp(x1), typ(y1));
				x0 = x1;
				y0 = y1;
			} else {
				var x1 = contour.points[k].xori
				var y1 = contour.points[k].yori
				var next = contour.points[k + 1];
				if (next.on) {
					var x2 = next.xori;
					var y2 = next.yori;
				} else {
					var x2 = (x1 + next.xori) / 2;
					var y2 = (y1 + next.yori) / 2;
				}
				hPreview.quadraticCurveTo(txp(x1), typ(y1), txp(x2), typ(y2))
				x0 = x2;
				y0 = y2;
				if (next.on) k += 1;
			}
		}
		hPreview.closePath();
	};
	hPreview.lineWidth = 3;
	hPreview.strokeStyle = 'black';
	hPreview.stroke();

	for (var j = 0; j < diagram.vertexes.length; j++) {
		var v = diagram.vertexes[j];
		hPreview.beginPath();
		hPreview.fillStyle = v.border ? 'black' : v.inside ? 'blue' : 'transparent';
		hPreview.arc(txp(v.x), typ(v.y), 2, 0, 2 * Math.PI);
		hPreview.fill();
	}

};

render()