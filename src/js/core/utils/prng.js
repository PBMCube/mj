/**
 * https://gist.github.com/blixt/f17b47c62508be59987b
 */

/**
 * Creates a pseudo-random value generator. The seed must be an integer.
 *
 * Uses an optimized version of the Park-Miller PRNG.
 * http://www.firstpr.com.au/dsp/rand31/
 */

 /**
  * Changes: if no seed (or seed=0) is provided, use a random seed.
  */
function Random(seed) {
  this._seed = seed ? seed % 2147483647 : (Math.random()*2147483647)|0;
  console.log(`using random seed ${this._seed}`);
  if (this._seed <= 0) this._seed += 2147483646;
}

// custom addition because we need a way to know how to seed very exactly.
Random.prototype.seed = function () {
  return this._seed;
}

/**
 * Returns a pseudo-random value between 1 and 2^32 - 2.
 */
Random.prototype.next = function () {
  return this._seed = this._seed * 16807 % 2147483647;
};


/**
 * Returns a pseudo-random floating point number in range [0, 1).
 */
Random.prototype.nextFloat = function (opt_minOrMax, opt_max) {
  // We know that result of next() will be 1 to 2147483646 (inclusive).
  return (this.next() - 1) / 2147483646;
};

if(typeof process !== "undefined") {
  module.exports = Random;
}