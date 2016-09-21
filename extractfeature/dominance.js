"use strict"

var toposort = require('toposort');

module.exports = function (stems) {
	var dominance = [];
	for (var j = 0; j < stems.length; j++) for (var k = 0; k < stems.length; k++) {
		if (stems[j].xmin < stems[k].xmin && stems[j].xmax > stems[k].xmax) {
			dominance.push([j, k]);
		}
	}
	return toposort(dominance);
}