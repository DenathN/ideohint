"use strict";

const toVQ = require("../../support/vq");
const { mix } = require("../../support/common");

const GROUP_CVT = "ideohint_CVT_entries";
const GROUP_FPGM = "ideohint_FPGM_entries";

function mgmGroupRegex(group) {
	return new RegExp(
		`^/\\*## !! MEGAMINX !! BEGIN SECTION ${group} ##\\*/$[\\s\\S]*?^/\\*## !! MEGAMINX !! END SECTION ${group} ##\\*/$`,
		"m"
	);
}

function mgmGroup(group, ...s) {
	return (`\n\n/*## !! MEGAMINX !! BEGIN SECTION ${group} ##*/\n` +
		s.join("\n") +
		`\n/*## !! MEGAMINX !! END SECTION ${group} ##*/\n\n`).replace(/\t/g, "    ");
}

/// FPGM

exports.fpgmShiftOf = {
	interpreter: 0,
	DLTP1: 1,
	DLTP2: 2,
	DLTP3: 3,
	_combined: 4,
	_combined_ss: 5,
	comp_integral: 6,
	comp_octet: 7,
	comp_quad: 8
};

exports.generateFPGM = (function() {
	const interpreterF = fid => `
/* Function ${fid}, the interpreter */
FDEF[], ${fid}
#BEGIN
	#PUSHOFF
	DUP[]
	#PUSH, 6
	SWAP[]
	#PUSHON
	JROF[],*,*
	#PUSHOFF
	CALL[]
	#PUSH, -9
	#PUSHON
	JMPR[],*
	#PUSHOFF
	POP[]
	#PUSHON
#END
ENDF[]
`;
	const splitStackTopByte = (d, s1, s2) => `
	DUP[]
	DUP[]
	#PUSH, ${d * 64}
	DIV[]
	#PUSH, ${d * 64}
	MUL[]
	SUB[]
	${s1 ? "#PUSH, " + s1 + "\n\tADD[]" : ""}
	SWAP[]
	#PUSH, ${d * 64}
	DIV[]
	${s2 ? "#PUSH, " + s2 + "\n\tADD[]" : ""}
	SWAP[]
`;
	const intCompressedSegment = (n, d) => `
		/* section for startPpem + ${n} */
			#PUSH, 4
			MINDEX[]
			DUP[]
			ROLL[]
			DUP[]
			SWAP[]
			DUP[]
			#PUSH, 16
			MUL[]
			#PUSH, 256
			MUL[]
			SUB[]
			ROLL[]
			SWAP[]
			#PUSH, ${d}
			DIV[]
			#PUSH, 6
			MINDEX[]
			DUP[]
			MPPEM[]
			EQ[]
			IF[]
				ROLL[]
				ROLL[]
				SHPIX[]
			ELSE[]
				ROLL[]
				ROLL[]
				POP[]
				POP[]
			EIF[]
			#PUSH, 1
			ADD[]
			SWAP[]
			#PUSH, 256
			DIV[]
			#PUSH, 4
			MINDEX[]
			SWAP[]
		/* end */
`;

	const intCompressedDeltaFunction = (fid, d) => `
/* Function ${fid} : Compressed form of integral Deltas
	Arguments:
	  b_n, ..., b_1 : argument bytes
	  z : point ID
	  startPpem : start ppem - 9 (5 bits)
	  n : quantity of bytes      (3 bits)
	
	Each argument byte is a compact form of four delta values, 2 bits per value:
	...     ---BYTE 2---    ---BYTE 1---    pointid     startPpem    n
	...     dd'cc'bb'aa'    dd cc bb aa     ZZZZZZZZ      PPPPP     NNN | STACK TOP
	  startPpem + 4 <-'      |       \`-> startPpem + 0
	                         \`-> startPpem + 3
	
	For each 2-bit component of argument bytes, the meanings are:
	  0 : 0
	  1 : +${1 / d} pixel
	  2 : -${2 / d} pixel
	  3 : -${1 / d} pixel
 */
FDEF[], ${fid}
#BEGIN
	#PUSHOFF
	/* Extract startPpem and n from the compact byte */
	${splitStackTopByte(8, 0, 9)}
	/* On Y axis */
	SVTCA[Y]
	/* Loop begin */
	DUP[]
	#PUSH, 208
	SWAP[]
	#PUSHON
	JROF[],*,*
	#PUSHOFF
		#PUSH, 4
		MINDEX[]
		${intCompressedSegment(0, d)}
		${intCompressedSegment(1, d)}
		${intCompressedSegment(2, d)}
		${intCompressedSegment(3, d)}
		/* The top byte is now zero */
		/* Pop it */
		POP[]
		#PUSH, 1
		SUB[]
	#PUSH, -211
	#PUSHON
	JMPR[],*
	#PUSHOFF
	POP[]
	POP[]
	POP[]
	#PUSHON
#END
ENDF[]
`;
	const compressedDeltaFunction = (fid, instr) => `
/* Function ${fid} : Compressed form of ${instr}
   Arguments:
	 p_n, ..., p_1 : Delta of ${instr}
	 z : point ID
	 n : Quantity of ${instr}s
*/
FDEF[], ${fid}
#BEGIN
#PUSHOFF
DUP[]
#PUSH, 18
SWAP[]
#PUSHON
JROF[],*,*
#PUSHOFF
SWAP[]
DUP[]
#PUSH, 4
MINDEX[]
SWAP[]
#PUSH, 1
${instr}[]
SWAP[]
#PUSH, 1
SUB[]
#PUSH, -21
#PUSHON
JMPR[],*
#PUSHOFF
POP[]
POP[]
#PUSHON
#END
ENDF[]
`;

	const combinedCompDeltaFunction = fid => `
/* Function ${fid} : Compressed form of DLTP1 and DLTP2
   Arguments:
	 p1_n, ..., p1_1 : Delta quantity of DLTP1
	 p2_m, ..., p2_2 : Delta quantity of DLTP2
	 z : point ID
	 n : quantity of DLTP1s
	 m : quantity of DLTP2s
*/
FDEF[], ${fid}
#BEGIN
	#PUSHOFF
	DUP[]
	#PUSH, 20
	SWAP[]
	#PUSHON
	JROF[],*,*
	#PUSHOFF
	ROLL[]
	DUP[]
	#PUSH, 5
	MINDEX[]
	SWAP[]
	#PUSH, 1
	DELTAP2[]
	SWAP[]
	ROLL[]
	SWAP[]
	#PUSH, 1
	SUB[]
	#PUSH, -23
	#PUSHON
	JMPR[],*
	#PUSHOFF
	POP[]
	DUP[]
	#PUSH, 18
	SWAP[]
	#PUSHON
	JROF[],*,*
	#PUSHOFF
	SWAP[]
	DUP[]
	#PUSH, 4
	MINDEX[]
	SWAP[]
	#PUSH, 1
	DELTAP1[]
	SWAP[]
	#PUSH, 1
	SUB[]
	#PUSH, -21
	#PUSHON
	JMPR[],*
	#PUSHOFF
	POP[]
	POP[]
	#PUSHON
#END
ENDF[]

/* Function ${fid + 1} : Fn ${fid} with m <= 16 and n <= 16
	m and n are compressed into one byte, four bits for each
*/
FDEF[], ${fid + 1}
#BEGIN
	#PUSHOFF
	${splitStackTopByte(16, 1, 1)}
	#PUSH, ${fid}
	CALL[]
	#PUSHON
#END
ENDF[]
`;
	return function(fpgm, padding) {
		return (
			fpgm +
			mgmGroup(
				GROUP_FPGM,
				interpreterF(padding),
				compressedDeltaFunction(padding + 1, "DELTAP1"),
				compressedDeltaFunction(padding + 2, "DELTAP2"),
				compressedDeltaFunction(padding + 3, "DELTAP3"),
				combinedCompDeltaFunction(padding + 4),
				intCompressedDeltaFunction(padding + 6, 1),
				intCompressedDeltaFunction(padding + 7, 8),
				intCompressedDeltaFunction(padding + 8, 4)
			)
		);
	};
})();

/// CVT

const SPLITS = 7 + 16;
function getVTTAux(strategy) {
	const bot = strategy.BLUEZONE_BOTTOM_CENTER;
	const top = strategy.BLUEZONE_TOP_CENTER;
	const canonicalSW = toVQ(strategy.CANONICAL_STEM_WIDTH, strategy.PPEM_MAX);
	const p = 1 / 20;
	const pd = 1 / 40;

	const SWDs = [];
	for (let j = 1; j < SPLITS; j++) {
		SWDs.push(Math.round(canonicalSW * mix(1 / 2, 1 + 1 / 5, j / SPLITS)));
	}
	return {
		yBotBar: Math.round(mix(bot, top, p)),
		yBotD: Math.round(mix(bot, top, pd)),
		yTopBar: Math.round(mix(top, bot, p)),
		yTopD: Math.round(mix(top, bot, pd)),
		canonicalSW: Math.round(canonicalSW),
		SWDs: SWDs
	};
}

exports.getVTTAux = getVTTAux;
exports.cvtIds = function(padding) {
	return {
		cvtZeroId: padding,
		cvtTopId: padding + 1,
		cvtBottomId: padding + 2,
		cvtTopDId: padding + 5,
		cvtBottomDId: padding + 6,
		cvtTopBarId: padding + 3,
		cvtBottomBarId: padding + 4,
		cvtTopBotDistId: padding + 7,
		cvtTopBotDDistId: padding + 8,
		cvtCSW: padding + 9,
		cvtCSWD: padding + 10
	};
};

exports.generateCVT = function generateCVT(cvt, cvtPadding, strategy) {
	const { yBotBar, yTopBar, yBotD, yTopD, canonicalSW, SWDs } = getVTTAux(strategy);
	return (
		cvt.replace(mgmGroupRegex(GROUP_CVT), "") +
		mgmGroup(
			GROUP_CVT,
			`${cvtPadding} : ${0}`,
			`${cvtPadding + 1} : ${strategy.BLUEZONE_TOP_CENTER}`,
			`${cvtPadding + 2} : ${strategy.BLUEZONE_BOTTOM_CENTER}`,
			`${cvtPadding + 3} : ${yTopBar}`,
			`${cvtPadding + 4} : ${yBotBar}`,
			`${cvtPadding + 5} : ${yTopD}`,
			`${cvtPadding + 6} : ${yBotD}`,
			`${cvtPadding + 7} : ${strategy.BLUEZONE_TOP_CENTER - strategy.BLUEZONE_BOTTOM_CENTER}`,
			`${cvtPadding + 8} : ${yTopD - yBotD}`,
			`${cvtPadding + 9} : ${canonicalSW}`,
			`${SWDs.map((x, j) => cvtPadding + 10 + j + " : " + x).join("\n")}`
		)
	);
};
