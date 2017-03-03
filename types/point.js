"use strict"

function Point(x, y, on, id) {
	this.x = x;
	this.y = y;
	this.xtouch = x;
	this.ytouch = y;
	this.touched = false;
	this.donttouch = false;
	this.on = on;
	this.id = id;
	this.interpolated = id < 0;
}
Point.PHANTOM = -1;


module.exports = Point;