// gif.worker.js - Web Worker for gif.js library
// https://github.com/jnordberg/gif.js
// License: MIT

// This script should be saved as gif.worker.js and placed
// in the same directory as the main HTML file or served
// from the same origin to avoid CORS issues.

var NeuQuant = (function() {

	/* NeuQuant Neural-Net Quantization Algorithm
	 * ------------------------------------------
	 *
	 * Copyright (c) 1994 Anthony Dekker
	 *
	 * NEUQUANT Neural-Net quantization algorithm by Anthony Dekker, 1994.
	 * See "Kohonen neural networks for optimal colour quantization"
	 * in "Network: Computation in Neural Systems" Vol. 5 (1994) pp 351-367.
	 * for a discussion of the algorithm.
	 * See also  http://members.ozemail.com.au/~dekker/NEUQUANT.HTML
	 *
	 * Any party obtaining a copy of these files from the author, directly or
	 * indirectly, is granted, free of charge, a full and unrestricted irrevocable,
	 * world-wide, paid up, royalty-free, nonexclusive right and license to deal
	 * in this software and documentation files (the "Software"), including without
	 * limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
	 * and/or sell copies of the Software, and to permit persons who receive
	 * copies from any such party to do so, with the only requirement being
	 * that this copyright notice remain intact.
	 *
	 * Ported to JavaScript by Johan Nordberg
	 */

	var ncycles = 100; // number of learning cycles
	var netsize = 256; // number of colors used
	var maxnetpos = netsize - 1;

	// defs for freq and bias
	var netbiasshift = 4; // bias for colour values
	var intbiasshift = 16; // bias for fractions
	var intbias = (1 << intbiasshift);
	var gammashift = 10;
	var gamma = (1 << gammashift);
	var betashift = 10;
	var beta = (intbias >> betashift); /* beta = 1/1024 */
	var betagamma = (intbias << (gammashift - betashift));

	// defs for decreasing radius factor
	var initrad = (netsize >> 3); // for 256 cols, radius starts
	var radiusbiasshift = 6; // at 32.0 biased by 6 bits
	var radiusbias = (1 << radiusbiasshift);
	var initradius = (initrad * radiusbias); // and decreases by a
	var radiusdec = 30; // factor of 1/30 each cycle

	// defs for decreasing alpha factor
	var alphabiasshift = 10; // alpha starts at 1.0
	var initalpha = (1 << alphabiasshift);
	var alphadec; // biased by 10 bits

	/* radbias and alpharadbias used for radpower calculation */
	var radbiasshift = 8;
	var radbias = (1 << radbiasshift);
	var alpharadbshift = (alphabiasshift + radbiasshift);
	var alpharadbias = (1 << alpharadbshift);

	// four primes near 500 - assume no image has a length so large that it is
	// divisible by all four primes
	var prime1 = 499;
	var prime2 = 491;
	var prime3 = 487;
	var prime4 = 503;
	var minpicturebytes = (3 * prime4);

	function NeuQuant(thepicture, samplefac) {

		var network; // int[netsize][4]
		var netindex; // for network lookup - really 256

		// bias and freq arrays for learning
		var bias;
		var freq;
		var radpower;

		var pixels = thepicture; // BGRc
		var lengthcount = pixels.length;
		var sample = samplefac;

		// four primes near 500 - assume no image has a length so large that it is
		//	divisible by all four primes
		var P1 = 499;
		var P2 = 491;
		var P3 = 487;
		var P4 = 503;
		var MINPICSIZE = 3 * P4;

		// creates NeuQuant perceptual color map
		var colorMap = function colorMap() {
			network = new Array(netsize);
			bias = new Array(netsize);
			freq = new Array(netsize);
			radpower = new Array(netsize);
			netindex = new Int32Array(256);

			for (var i = 0; i < netsize; i++) {
				var v = (i << (netbiasshift + 8)) / netsize;
				network[i] = new Float64Array([v, v, v, 0]);
				//network[i] = [v, v, v, 0];
				freq[i] = intbias / netsize;
				bias[i] = 0;
			}
		};

		// Insertion sort of network and building of netindex[0..255]
		var buildIndex = function buildIndex() {
			var previouscol = 0;
			var startpos = 0;
			for (var i = 0; i < netsize; i++) {
				var p = network[i];
				var smallpos = i;
				var smallval = p[1]; // index on g
				// find smallest in i..netsize-1
				for (var j = i + 1; j < netsize; j++) {
					var q = network[j];
					if (q[1] < smallval) { // index on g
						smallpos = j;
						smallval = q[1]; // index on g
					}
				}
				var q = network[smallpos];
				// swap p (i) and q (smallpos) entries
				if (i != smallpos) {
					var temp = p[0]; p[0] = q[0]; q[0] = temp;
					temp = p[1]; p[1] = q[1]; q[1] = temp;
					temp = p[2]; p[2] = q[2]; q[2] = temp;
					temp = p[3]; p[3] = q[3]; q[3] = temp;
				}
				// smallval entry is now in position i

				if (smallval != previouscol) {
					netindex[previouscol] = (startpos + i) >> 1;
					for (var j = previouscol + 1; j < smallval; j++) netindex[j] = i;
					previouscol = smallval;
					startpos = i;
				}
			}
			netindex[previouscol] = (startpos + maxnetpos) >> 1;
			for (var j = previouscol + 1; j < 256; j++) netindex[j] = maxnetpos; // really 256
		};

		// Main Learning Loop
		var learn = function learn() {
			if (lengthcount < minpicturebytes) sample = 1;
			alphadec = 30 + ((sample - 1) / 3);
			var p = pixels;
			var pix = 0; // current pixel position
			var lim = lengthcount;
			var rad = initradius;
			var alpha = initalpha;
			var step = lengthcount / (3 * sample + (P1 - 1));
			var delta = ~~(step / ncycles); // use ~~ as floor

			var i = 0;
			var radius = rad >> radiusbiasshift;
			if (radius <= 1) radius = 0;

			for (var j = 0; j < netsize; j++) {
				radpower[j] = alpha * (((radius * radius) << radbiasshift) / alpharadbias);
			}

			var k = 0;
			step = 0 | Math.max(1, lengthcount / P1);
			if (lengthcount < MINPICSIZE) step = 1;
			else if ((lengthcount % P1) != 0) step = 3 * P1;
			else if ((lengthcount % P2) != 0) step = 3 * P2;
			else if ((lengthcount % P3) != 0) step = 3 * P3;
			else step = 3 * P4;

			i = 0;
			while (i < lim) {
				var b = (p[pix + 0] & 0xff) << netbiasshift;
				var g = (p[pix + 1] & 0xff) << netbiasshift;
				var r = (p[pix + 2] & 0xff) << netbiasshift;
				var j = contest(b, g, r);

				altersingle(alpha, j, b, g, r);
				if (radius != 0) alterneigh(radius, j, b, g, r); // alter neighbours

				pix += step;
				if (pix >= lim) pix -= lengthcount;

				i++;
				if (delta == 0) delta = 1;
				if (i % delta == 0) {
					alpha -= alpha / alphadec;
					rad -= rad / radiusdec;
					radius = rad >> radiusbiasshift;

					if (radius <= 1) radius = 0;
					for (j = 0; j < netsize; j++) {
						radpower[j] = alpha * (((radius * radius) << radbiasshift) / alpharadbias);
					}
				}
			}
		};

		// Search for BGR values 0..255 (after net is unbiased) and return colour index
		var map = this.map = function map(b, g, r) {
			var bestd = 1000; // biggest possible dist is 256*3
			var best = -1;
			var i = netindex[g]; // index on g
			var j = i - 1; // start at netindex[g] and work outwards

			while ((i < netsize) || (j >= 0)) {
				if (i < netsize) {
					var p = network[i];
					var dist = p[1] - g; // inx key
					if (dist >= bestd) i = netsize; // stop iter
					else {
						i++;
						if (dist < 0) dist = -dist;
						var a = p[0] - b; if (a < 0) a = -a;
						dist += a;
						if (dist < bestd) {
							a = p[2] - r; if (a < 0) a = -a;
							dist += a;
							if (dist < bestd) { bestd = dist; best = p[3]; }
						}
					}
				}
				if (j >= 0) {
					var p = network[j];
					var dist = g - p[1]; // inx key - reverse dif
					if (dist >= bestd) j = -1; // stop iter
					else {
						j--;
						if (dist < 0) dist = -dist;
						var a = p[0] - b; if (a < 0) a = -a;
						dist += a;
						if (dist < bestd) {
							a = p[2] - r; if (a < 0) a = -a;
							dist += a;
							if (dist < bestd) { bestd = dist; best = p[3]; }
						}
					}
				}
			}
			return best;
		};

		var process = this.process = function process() {
			colorMap();
			learn();
			unbiasnet();
			buildIndex();
			return createColorMap();
		};

		// Unbias network to give byte values 0..255 and record position i to prepare for sort
		var unbiasnet = function unbiasnet() {
			for (var i = 0; i < netsize; i++) {
				network[i][0] >>= netbiasshift;
				network[i][1] >>= netbiasshift;
				network[i][2] >>= netbiasshift;
				network[i][3] = i; // record color number
			}
		};

		// Move adjacent neurons by precomputed alpha*(1-((i-j)^2/[r]^2)) in radpower[|i-j|]
		var alterneigh = function alterneigh(rad, i, b, g, r) {
			var lo = i - rad; if (lo < -1) lo = -1;
			var hi = i + rad; if (hi > netsize) hi = netsize;

			var j = i + 1;
			var k = i - 1;
			var m = 1;

			while ((j < hi) || (k > lo)) {
				var a = radpower[m++];

				if (j < hi) {
					var p = network[j++];
					try {
						p[0] -= (a * (p[0] - b)) / alpharadbias;
						p[1] -= (a * (p[1] - g)) / alpharadbias;
						p[2] -= (a * (p[2] - r)) / alpharadbias;
					} catch (e) { } // prevents alpha = 0 errors
				}
				if (k > lo) {
					var p = network[k--];
					try {
						p[0] -= (a * (p[0] - b)) / alpharadbias;
						p[1] -= (a * (p[1] - g)) / alpharadbias;
						p[2] -= (a * (p[2] - r)) / alpharadbias;
					} catch (e) { }
				}
			}
		};

		// Move neuron i towards biased (b,g,r) by factor alpha
		var altersingle = function altersingle(alpha, i, b, g, r) {
			// alter hit neuron
			var n = network[i];
			n[0] -= (alpha * (n[0] - b)) / initalpha;
			n[1] -= (alpha * (n[1] - g)) / initalpha;
			n[2] -= (alpha * (n[2] - r)) / initalpha;
		};

		// Search for biased BGR values
		var contest = function contest(b, g, r) {
			// finds closest neuron (min dist) and updates freq
			// finds best neuron (min dist-bias) and returns position
			// for frequently chosen neurons, freq[i] is high and bias[i] is negative
			// bias[i] = gamma*((1/netsize)-freq[i])

			var bestd = ~ (1 << 31);
			var bestbiasd = bestd;
			var bestpos = -1;
			var bestbiaspos = bestpos;

			for (var i = 0; i < netsize; i++) {
				var n = network[i];
				var dist = n[0] - b; if (dist < 0) dist = -dist;
				var a = n[1] - g; if (a < 0) a = -a;
				dist += a;
				a = n[2] - r; if (a < 0) a = -a;
				dist += a;
				if (dist < bestd) { bestd = dist; bestpos = i; }
				var biasdist = dist - ((bias[i]) >> (intbiasshift - netbiasshift));
				if (biasdist < bestbiasd) { bestbiasd = biasdist; bestbiaspos = i; }
				var betafreq = (freq[i] >> betashift);
				freq[i] -= betafreq;
				bias[i] += (betafreq << gammashift);
			}
			freq[bestpos] += beta;
			bias[bestpos] -= betagamma;
			return bestbiaspos;
		};

		// create color map
		var createColorMap = function createColorMap() {
			var map = [];
			var index = [];
			for (var i = 0; i < netsize; i++) {
				index[network[i][3]] = i;
			}
			var k = 0;
			for (var l = 0; l < netsize; l++) {
				var j = index[l];
				map[k++] = (network[j][0]);
				map[k++] = (network[j][1]);
				map[k++] = (network[j][2]);
			}
			return map;
		};

	}

	return NeuQuant;

})();

var LZWEncoder = (function() {

	/* LZWEncoder.js
	 *
	 * Authors
	 * Kevin Weiner (original Java version - kweiner@fmsware.com)
	 * Thibault Imbert (AS3 version - bytearray.org)
	 * Johan Nordberg (JS version - code@johan-nordberg.com)
	 *
	 * Acknowledgements
	 * GIFCOMPR.C - GIF Image compression routines
	 * Lempel-Ziv compression based on 'compress'. GIF modifications by
	 * David Rowley (mgardi@watdcsu.waterloo.edu)
	 * GIF Image compression - modified 'compress'
	 * Based on: compress.c - File compression ala IEEE Computer, June 1984.
	 * By Authors: Spencer W. Thomas (decvax!harpo!utah-cs!utah-gr!thomas)
	 * Jim McKie (decvax!mcvax!jim)
	 * Steve Davies (decvax!vax135!petsd!peora!srd)
	 * Ken Turkowski (decvax!decwrl!turtlevax!ken)
	 * James A. Woods (decvax!ihnp4!ames!jaw)
	 * Joe Orost (decvax!ihnp4!uiucdcs!orost)
	 *
	 * Ported to JavaScript by Johan Nordberg
	 */

	var EOF = -1;
	var BITS = 12;
	var HSIZE = 5003; // 80% occupancy
	var masks = [ 0x0000, 0x0001, 0x0003, 0x0007, 0x000F, 0x001F, 0x003F, 0x007F, 0x00FF, 0x01FF, 0x03FF, 0x07FF, 0x0FFF, 0x1FFF, 0x3FFF, 0x7FFF, 0xFFFF ];

	function LZWEncoder(width, height, pixels, colorDepth) {

		var imgW = width;
		var imgH = height;
		var pixAry = pixels;
		var initCodeSize = Math.max(2, colorDepth);

		var accum = new Uint8Array(256);
		var htab = new Int32Array(HSIZE);
		var codetab = new Int32Array(HSIZE);

		var cur_accum, cur_bits = 0;
		var n_bits;
		var maxcode;

		// Algorithm: use open addressing double hashing (no chaining) on the
		// prefix code / next character combination. We do a variant of Knuth's
		// algorithm D (vol. 3, sec. 6.4) along with G. Knott's relatively-prime
		// secondary probe. Here, the modular division first probe is gives way
		// to a faster exclusive-or manipulation. Also do block compression with
		// variable length codes
		var clear_flg = false;

		// output
		//
		// Output the given code.
		// Inputs:
		// code: A n_bits-bit integer. If == -1, then EOF. This assumes
		// that n_bits =< wordsize - 1.
		// Outputs:
		// Outputs code to the file.
		// Assumptions:
		// Chars are 8 bits long.
		// Algorithm:
		// Maintain a BITS character long buffer (so that 8 codes will
		// fit in it exactly). Use the VAX insv instruction (optional).
		// When the buffer fills up empty it and start over.

		var cur_accum = 0;
		var cur_bits = 0;

		var remaining = imgW * imgH;
		var curPixel = 0;

		// Number of characters so far in this 'packet'
		var a_count;

		// Define the storage for the packet accumulator
		var char_out = function char_out(c, outs) {
			accum[a_count++] = c;
			if (a_count >= 254) flush_char(outs);
		};

		// Add a character to the end of the current packet, and if it is 254
		// characters, flush the packet to disk.
		var flush_char = function flush_char(outs) {
			if (a_count > 0) {
				outs.writeByte(a_count);
				outs.writeBytes(accum, 0, a_count);
				a_count = 0;
			}
		};

		var MAXCODE = function MAXCODE(n_bits) {
			return (1 << n_bits) - 1;
		};

		// Clear out the hash table
		// table clear for block compress
		var cl_block = function cl_block(outs) {
			cl_hash(HSIZE);
			free_ent = ClearCode + 2;
			clear_flg = true;
			output(ClearCode, outs);
		};

		// reset code table
		var cl_hash = function cl_hash(hsize) {
			for ( var i = 0; i < hsize; ++i) htab[i] = -1;
		};

		var compress = this.compress = function compress(init_bits, outs) {
			var fcode;
			var i /* = 0 */;
			var c;
			var ent;
			var disp;
			var hsize_reg;
			var hshift;

			// Set up the globals: g_init_bits - initial number of bits
			g_init_bits = init_bits;

			// Set up the necessary values
			clear_flg = false;
			n_bits = g_init_bits;
			maxcode = MAXCODE(n_bits);

			ClearCode = 1 << (init_bits - 1);
			EOFCode = ClearCode + 1;
			free_ent = ClearCode + 2;

			a_count = 0; // clear packet

			ent = nextPixel();

			hshift = 0;
			for (fcode = HSIZE; fcode < 65536; fcode *= 2) ++hshift;
			hshift = 8 - hshift; // set hash code range bound

			hsize_reg = HSIZE;
			cl_hash(hsize_reg); // clear hash table

			output(ClearCode, outs);

			outer_loop: while ((c = nextPixel()) != EOF) {
				fcode = (c << BITS) + ent;
				i = (c << hshift) ^ ent; // xor hashing

				if (htab[i] == fcode) {
					ent = codetab[i];
					continue;
				} else if (htab[i] >= 0) { // non-empty slot
					disp = hsize_reg - i; // secondary hash (after G. Knott)
					if (i === 0) disp = 1;
					do {
						if ((i -= disp) < 0) i += hsize_reg;

						if (htab[i] == fcode) {
							ent = codetab[i];
							continue outer_loop;
						}
					} while (htab[i] >= 0);
				}
				output(ent, outs);
				ent = c;
				if (free_ent < 1 << BITS) {
					codetab[i] = free_ent++; // code -> hashtable
					htab[i] = fcode;
				} else cl_block(outs);
			}
			// Put out the final code.
			output(ent, outs);
			output(EOFCode, outs);
		};

		// Flush the packet to disk, and reset the accumulator
		var encode = this.encode = function(os) {
			os.writeByte(initCodeSize); // write "initial code size" byte
			remaining = imgW * imgH; // reset navigation variables
			curPixel = 0;
			compress(initCodeSize + 1, os); // compress and write the pixel data
			os.writeByte(0); // write block terminator
		};

		// Return the next pixel from the image
		var nextPixel = function nextPixel() {
			if (remaining === 0) return EOF;
			--remaining;
			var pix = pixAry[curPixel++];
			return pix & 0xff;
		};

		var output = function output(code, outs) {
			cur_accum &= masks[cur_bits];

			if (cur_bits > 0) cur_accum |= (code << cur_bits);
			else cur_accum = code;

			cur_bits += n_bits;

			while (cur_bits >= 8) {
				char_out((cur_accum & 0xff), outs);
				cur_accum >>= 8;
				cur_bits -= 8;
			}

			// If the next entry is going to be too big for the code size,
			// then increase it, if possible.
			if (free_ent > maxcode || clear_flg) {
				if (clear_flg) {
					maxcode = MAXCODE(n_bits = g_init_bits);
					clear_flg = false;
				} else {
					++n_bits;
					if (n_bits == BITS) maxcode = 1 << BITS;
					else maxcode = MAXCODE(n_bits);
				}
			}

			if (code == EOFCode) {
				// At EOF, write the rest of the buffer.
				while (cur_bits > 0) {
					char_out((cur_accum & 0xff), outs);
					cur_accum >>= 8;
					cur_bits -= 8;
				}
				flush_char(outs);
			}
		};
	}

	return LZWEncoder;

})();

var ByteArray = (function() {

	function ByteArray() {
		this.page = -1;
		this.pages = [];
		this.newPage();
	}

	ByteArray.pageSize = 4096;
	ByteArray.charMap = {};

	for (var i = 0; i < 256; i++) {
		ByteArray.charMap[i] = String.fromCharCode(i);
	}

	ByteArray.prototype.newPage = function() {
		this.pages[++this.page] = new Uint8Array(ByteArray.pageSize);
		this.cursor = 0;
	};

	ByteArray.prototype.getData = function() {
		var rv = '';
		for (var p = 0; p < this.pages.length; p++) {
			for (var i = 0; i < ByteArray.pageSize; i++) {
				rv += ByteArray.charMap[this.pages[p][i]];
			}
		}
		return rv;
	};

	ByteArray.prototype.writeByte = function(val) {
		if (this.cursor >= ByteArray.pageSize) this.newPage();
		this.pages[this.page][this.cursor++] = val;
	};

	ByteArray.prototype.writeUTFBytes = function(string) {
		for (var l = string.length, i = 0; i < l; i++) {
			this.writeByte(string.charCodeAt(i));
		}
	};

	ByteArray.prototype.writeBytes = function(array, offset, length) {
		for (var l = length || array.length, i = offset || 0; i < l; i++) {
			this.writeByte(array[i]);
		}
	};

	return ByteArray;

})();

// The main process
var GIFEncoder = function(width, height) {

	// image size
	this.width = ~~width;
	this.height = ~~height;

	// transparent color if given
	this.transparent = null;

	// transparent index in color table
	this.transIndex = 0;

	// -1 = no repeat, 0 = forever. Anything else is repeat count
	this.repeat = -1;

	// frame delay (hundredths)
	this.delay = 0;

	this.image = null; // current frame
	this.pixels = null; // BGR byte array from frame
	this.indexedPixels = null; // converted frame indexed to palette
	this.colorDepth = null; // number of bit planes
	this.colorTab = null; // RGB palette
	this.usedEntry = new Array(); // active palette entries
	this.palSize = 7; // color table size (bits-1)
	this.dispose = -1; // disposal code (-1 = use default)
	this.firstFrame = true;
	this.sample = 10; // default sample interval for quantizer

	this.out = new ByteArray();
};

/*
	Sets the delay time between each frame, or changes it for subsequent frames
	(applies to last frame added)
*/
GIFEncoder.prototype.setDelay = function(milliseconds) {
	this.delay = Math.round(milliseconds / 10);
};

/*
	Sets the GIF frame disposal code for the last added frame and any
	subsequent frames. Default is 0 if no transparent color has been set,
	otherwise 2.
*/
GIFEncoder.prototype.setDispose = function(disposalCode) {
	if (disposalCode >= 0) this.dispose = disposalCode;
};

/*
	Sets the number of times the set of GIF frames should be played. Default is
	-1 (no repeat). 0 means play indefinitely. Must be invoked before the first
	image is added.
*/
GIFEncoder.prototype.setRepeat = function(repeat) {
	this.repeat = repeat;
};

/*
	Sets the transparent color for the last added frame and any subsequent
	frames. Since all colors are subject to modification in the quantization
	process, the color in the final palette for each frame closest to the given
	color becomes the transparent color for that frame. May be set to null to
	indicate no transparent color.
*/
GIFEncoder.prototype.setTransparent = function(color) {
	this.transparent = color;
};

/*
	Adds next GIF frame. The frame is not written immediately, but is
	actually deferred until the next frame is received so that timing
	data can be inserted.  Invoking finish() flushes all frames.
*/
GIFEncoder.prototype.addFrame = function(imageData) {
	this.image = imageData;
	this.getImagePixels(); // convert to correct format if necessary
	this.analyzePixels(); // build color table & map pixels

	if (this.firstFrame) {
		this.writeLSD(); // logical screen descriptior
		this.writePalette(); // global color table
		if (this.repeat >= 0) {
			// use NS app extension to indicate reps
			this.writeNetscapeExt();
		}
	}

	this.writeGraphicCtrlExt(); // write graphic control extension
	this.writeImageDesc(); // image descriptor
	if (!this.firstFrame) this.writePalette(); // local color table
	this.writePixels(); // encode and write pixel data

	this.firstFrame = false;
};

/*
	Adds final trailer to the GIF stream, if you don't call the finish method
	the GIF stream will not be valid.
*/
GIFEncoder.prototype.finish = function() {
	this.out.writeByte(0x3b); // gif trailer
};

/*
	Sets frame rate in frames per second. Equivalent to
	setDelay(1000/fps).
*/
GIFEncoder.prototype.setFrameRate = function(fps) {
	this.delay = Math.round(100 / fps);
};

/*
	Sets quality of color quantization (conversion of images to the maximum 256
	colors allowed by the GIF specification). Lower values (minimum = 1)
	produce better colors, but slow processing significantly. 10 is the
	default, and produces good color mapping at reasonable speeds. Values
	greater than 20 do not yield significant improvements in speed.
*/
GIFEncoder.prototype.setQuality = function(quality) {
	if (quality < 1) quality = 1;
	this.sample = quality;
};

/*
	Writes Logical Screen Descriptor
*/
GIFEncoder.prototype.writeLSD = function() {
	// logical screen size
	this.writeShort(this.width);
	this.writeShort(this.height);

	// packed fields
	this.out.writeByte(
		0x80 | // 1 : global color table flag = 1 (gct used)
		0x70 | // 2-4 : color resolution = 7
		0x00 | // 5 : gct sort flag = 0
		this.palSize // 6-8 : gct size
	);

	this.out.writeByte(0); // background color index
	this.out.writeByte(0); // pixel aspect ratio - assume 1:1
};

/*
	Writes Netscape application extension to define repeat count.
*/
GIFEncoder.prototype.writeNetscapeExt = function() {
	this.out.writeByte(0x21); // extension introducer
	this.out.writeByte(0xff); // app extension label
	this.out.writeByte(11); // block size
	this.out.writeUTFBytes('NETSCAPE2.0'); // app id + auth code
	this.out.writeByte(3); // sub-block size
	this.out.writeByte(1); // loop sub-block id
	this.writeShort(this.repeat); // loop count (extra iterations, 0=repeat forever)
	this.out.writeByte(0); // block terminator
};

/*
	Writes Graphic Control Extension
*/
GIFEncoder.prototype.writeGraphicCtrlExt = function() {
	this.out.writeByte(0x21); // extension introducer
	this.out.writeByte(0xf9); // GCE label
	this.out.writeByte(4); // data block size

	var transp, disp;
	if (this.transparent === null) {
		transp = 0;
		disp = 0; // dispose = no action
	} else {
		transp = 1;
		disp = 2; // force clear if using transparent color
	}

	if (this.dispose >= 0) {
		disp = this.dispose & 7; // user override
	}
	disp <<= 2;

	// packed fields
	this.out.writeByte(
		0 | // 1:3 reserved
		disp | // 4:6 disposal
		0 | // 7 user input - 0 = none
		transp // 8 transparency flag
	);

	this.writeShort(this.delay); // delay x 1/100 sec
	this.out.writeByte(this.transIndex); // transparent color index
	this.out.writeByte(0); // block terminator
};

/*
	Writes Image Descriptor
*/
GIFEncoder.prototype.writeImageDesc = function() {
	this.out.writeByte(0x2c); // image separator
	this.writeShort(0); // image position x,y = 0,0
	this.writeShort(0);
	this.writeShort(this.width); // image size
	this.writeShort(this.height);

	// packed fields
	if (this.firstFrame) {
		// no local color table: global color table applies
		this.out.writeByte(0);
	} else {
		// local color table flag = 1; interlace flag = 0;
		this.out.writeByte(
			0x80 | // 1 local color table 1=yes
			0 | // 2 interlace 0=no
			0 | // 3 sorted 0=no
			0 | // 4-5 reserved
			this.palSize // 6-8 size of lct
		);
	}
};

/*
	Writes Logical Screen Descriptor
*/
GIFEncoder.prototype.writePalette = function() {
	this.out.writeBytes(this.colorTab);
	var n = (3 * 256) - this.colorTab.length;
	for (var i = 0; i < n; i++) this.out.writeByte(0);
};

GIFEncoder.prototype.writeShort = function(pValue) {
	this.out.writeByte(pValue & 0xff);
	this.out.writeByte((pValue >> 8) & 0xff);
};

/*
	Encodes and writes pixel data
*/
GIFEncoder.prototype.writePixels = function() {
	var enc = new LZWEncoder(this.width, this.height, this.indexedPixels, this.colorDepth);
	enc.encode(this.out);
};

/*
	Analyze pixels for color analysis needs
*/
GIFEncoder.prototype.analyzePixels = function() {
	var len = this.pixels.length;
	var nPix = len / 3;
	this.indexedPixels = new Uint8Array(nPix);
	var nq = new NeuQuant(this.pixels, this.sample);
	this.colorTab = nq.process(); // create reduced palette

	// map image pixels to new palette
	var k = 0;
	for (var j = 0; j < nPix; j++) {
		var index = nq.map(this.pixels[k++] & 0xff, this.pixels[k++] & 0xff, this.pixels[k++] & 0xff);
		this.usedEntry[index] = true;
		this.indexedPixels[j] = index;
	}

	this.pixels = null;
	this.colorDepth = 8;
	this.palSize = 7;

	// get closest match to transparent color if specified
	if (this.transparent !== null) {
		this.transIndex = this.findClosest(this.transparent);
	}
};

/*
	Returns index of palette color closest to c
*/
GIFEncoder.prototype.findClosest = function(c) {
	if (this.colorTab === null) return -1;

	var r = (c & 0xff0000) >> 16;
	var g = (c & 0x00ff00) >> 8;
	var b = (c & 0x0000ff);
	var minpos = 0;
	var dmin = 256 * 256 * 256;
	var len = this.colorTab.length;

	for (var i = 0; i < len;) {
		var dr = r - (this.colorTab[i++] & 0xff);
		var dg = g - (this.colorTab[i++] & 0xff);
		var db = b - (this.colorTab[i] & 0xff);
		var d = dr * dr + dg * dg + db * db;
		var index = i / 3;
		if (this.usedEntry[index] && (d < dmin)) {
			dmin = d;
			minpos = index;
		}
		i++;
	}
	return minpos;
};

/*
	Extracts image pixels into byte array pixels
	(removes alpha channel)
*/
GIFEncoder.prototype.getImagePixels = function() {
	var w = this.width;
	var h = this.height;
	this.pixels = new Uint8Array(w * h * 3);

	var data = this.image;
	var srcPos = 0;
	var count = 0;

	for (var i = 0; i < h; i++) {
		for (var j = 0; j < w; j++) {
			this.pixels[count++] = data[srcPos++]; // R
			this.pixels[count++] = data[srcPos++]; // G
			this.pixels[count++] = data[srcPos++]; // B
			srcPos++; // A
		}
	}
};

/*
	Returns byte array of GIF stream.
 */
GIFEncoder.prototype.stream = function() {
	return this.out;
};

// Worker specific code
var encoder;

self.onmessage = function(event) {
	var data = event.data;
	switch(data.cmd) {
		case 'start':
			encoder = new GIFEncoder(data.width, data.height);
			encoder.setRepeat(data.repeat);
			encoder.setDelay(data.delay);
			encoder.setQuality(data.quality);
			encoder.setTransparent(data.transparent);
			break;
		case 'frame':
			encoder.addFrame(data.frame);
			break;
		case 'finish':
			var stream = encoder.stream();
			// Send the result back to the main thread
			// Use transferable objects for typed array for performance
			self.postMessage({cmd: 'finished', stream: stream.pages}, [stream.pages[0].buffer]); // Transfer buffer of the first page
			break;
	}
};
