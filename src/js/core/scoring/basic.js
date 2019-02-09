/**
 *
 */
function _tile_score(set) {
  let locked = set.locked;
  set = set.map(s => s.dataset ? parseInt(s.dataset.tile) : s);
  let tile = set[0];

  let score = 0;

  // Only pairs of dragons score points.
  if (set.length === 2 && tile > 30) score = 2;

  // Triples means either a chow or a pung,
  // but only pungs score points.
  if (set.length === 3) {
    let s1 = set[1];
    s1 = s1.dataset ? parseInt(s1.dataset.tile) : s1;
    if (s1 === tile) score = (tile < 27) ? 2 : 4;
  }

  // goodness, a kong or numbers / honours!
  if (set.length === 4) score = (tile < 27) ? 4 : 8;

  // concealed points are worth more!
  return locked ? score : 2 * score;
}

/**
 * Determine the tile score for a collection of sets
 */
function getBasicTileScore(scorePattern) {
  return scorePattern.map(_tile_score).reduce((t,v)=>t+v, 0);
}

/**
 *
 */
function scoreTiles(player) {
  // Let's get the administrative data:
  let winner = player.has_won;
  let tiles = player.getTileFaces();
  let locked = player.locked;

  // And then let's see what our tile-examining
  // algorithm has to say about the tiles we have.
  let openCompositions = tilesNeeded(tiles, locked).composed;

  // If there is nothing to be formed with the tiles in hand,
  // then we need to create an empty path, so that we at
  // least still compute the based on just the locked tiles.
  if (openCompositions.length === 0) {
    openCompositions.push([]);
  }

  let possibleScores = openCompositions.map(chain => {
    let scorePattern = chain.map(s => {
      let terms = s.split('-');
      let c = terms[0];
      let count = parseInt(c);
      let tile = parseInt(terms[1]);
      if (c.indexOf('c') > -1) return [tile, tile+1, tile+2];
      return [tile, tile, tile, tile].slice(0,count);
    }).concat(locked);

    let score = getBasicTileScore(scorePattern);
    return score + (winner?10:0);
  });

  return possibleScores.sort().slice(-1)[0];
}