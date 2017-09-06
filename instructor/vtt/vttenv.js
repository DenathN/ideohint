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
	return (
		`\n\n/*## !! MEGAMINX !! BEGIN SECTION ${group} ##*/\n` +
		s.join("\n") +
		`\n/*## !! MEGAMINX !! END SECTION ${group} ##*/\n\n`
	);
}

/// FPGM

exports.fpgmShiftOf = {
	DLTP1: 1,
	DLTP2: 2,
	DLTP3: 3,
	_combined: 4,
	_combined_eq: 5,
	_combined_g1: 6,
	_combined_l1: 7
};

exports.generateFPGM = (function() {
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


/* Function ${fid + 1} : Fn ${fid} with m === n */
FDEF[], ${fid + 1}
#BEGIN
#PUSHOFF
DUP[]
#PUSH, ${fid}
CALL[]
#PUSHON
#END
ENDF[]

/* Function ${fid + 1} : Fn ${fid} with m === n + 1 */
FDEF[], ${fid + 2}
#BEGIN
#PUSHOFF
DUP[]
#PUSH, 1
ADD[]
#PUSH, ${fid}
CALL[]
#PUSHON
#END
ENDF[]

/* Function ${fid + 1} : Fn ${fid} with m === n - 1 */
FDEF[], ${fid + 3}
#BEGIN
#PUSHOFF
DUP[]
#PUSH, 1
SUB[]
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
				compressedDeltaFunction(padding + 1, "DELTAP1"),
				compressedDeltaFunction(padding + 2, "DELTAP2"),
				compressedDeltaFunction(padding + 3, "DELTAP3"),
				combinedCompDeltaFunction(padding + 4)
			)
		);
	};
})();

/// CVT

const SPLITS = 16 + 7;
function getVTTAux(strategy) {
	const bot = strategy.BLUEZONE_BOTTOM_CENTER;
	const top = strategy.BLUEZONE_TOP_CENTER;
	const canonicalSW = toVQ(strategy.CANONICAL_STEM_WIDTH, strategy.PPEM_MAX);
	const p = 1 / 20;
	const pd = 1 / 40;

	const SWDs = [];
	for (let j = 1; j < SPLITS; j++) {
		SWDs.push(Math.round(canonicalSW * (1 / 6 + j / SPLITS)));
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
