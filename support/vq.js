"use strict";
const monoip = require("./monotonic-interpolate");
module.exports = function toVQ(v, ppem) {
	if (v && v instanceof Array) {
		return monoip(v)(ppem);
	} else {
		return v;
	}
};
