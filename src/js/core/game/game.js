if (typeof process !== "undefined") {
  Player = require('../players/player.js');
  Ruleset = require('../scoring/ruleset');
  Wall = require('./wall/wall.js');
  CLAIM = require('../../../config.js').CLAIM;
  modal = require('../../page/modal/modal.js');
  console = require('../utils/console-shim.js');
  // TODO: game.js should not know anything about UI code...
  rotateWinds = require('../players/ui/windicator.js');
}


/**
 * This class models an entire game.
 */
class Game {
  constructor(players) {
    this.players = players;
    players.forEach(p => p.setActiveGame(this));
    this.rules = Ruleset.getRuleset(config.RULES);
    this.players.forEach(p => p.setRules(this.rules));
    this.wall = new Wall(players);
    this.scoreHistory = [];
    this._playLock = false;
    this.GAME_START = false;

    // This gets redeclared by pause(), but we allocate
    // it here so that it exists as callable noop.
    this.resume = () => {};
  }

  /**
   * Start a game of mahjong!
   */
  startGame(whenDone) {
    document.body.classList.remove(`finished`);
    this.GAME_START = Date.now();
    this.currentpid = 0;
    this.wind = 0;
    this.windOfTheRound = 0;
    this.hand = 0;
    this.draws = 0;
    this.totalDraws = 0;
    this.totalPlays = 0;
    this.players.forEach(p => p.gameWillStart());
    this.finish = whenDone;

    this.fixValues = () => {
      // drop in term fixes (hand/draw/seed/wind/wotr) here.
    }

    config.log(`starting game.`);
    this.startHand();
  }

  /**
   * Pause this game. Which is harder than it sounds,
   * really what this function does is it sets a
   * local lock that we can check at every point
   * in the code where we can reasonably pause.
   *
   * Being paused is then effected by waiting for
   * the lock to be released again.
   *
   * Note that the corresponding `.resume()` is
   * not part of the class definition, and is built
   * only as needed by when `pause()` is invoked.
   */
  pause() {
    if (!this.GAME_START) return;
    console.debug('pausing game');
    this._playLock = new Promise(resolve => {
      this.resume = () => {
        console.debug('resuming game');
        this._playLock = false;
        this.players.forEach(p => p.resume());
        resolve();
      }
    });
    this.players.forEach(p => p.pause(this._playLock));
    return this.resume;
  }

  /**
   * A utility function that works together with
   * the pause lock to ensure that is we're paused,
   * execution is suspended until the lock is released.
   */
  async continue(where='continue') {
    if (this._playLock) {
      console.debug(`paused at ${where}`);
      await this._playLock;
    }
  }

  /**
   * Triggered immediately after `startGame`, as well as
   * at the end of every `play()` cycle, this function
   * keeps getting called for as long as there are hands
   * left to play in this particular game.
   */
  async startHand(result = {}) {
    await this.continue();

    let players = this.players;

    if (result.winner) {
      // only rotate the winds if the winner is not East
      let winner = result.winner;
      if (winner.wind !== 0) {
        this.wind++;
        if (this.wind === 4) {
          this.wind = 0;
          this.windOfTheRound++;
          if (this.windOfTheRound === 4) {
            let ms = (Date.now() - this.GAME_START);
            let s = ((ms/10)|0)/100;
            let finalScores = players.map(p => p.getScore());
            let highest = finalScores.reduce((t,v) => v>t?v:t, 0);
            let gamewinner = finalScores.indexOf(highest);
            console.log(`\nfull game played: player ${gamewinner} is the winner!`);
            console.log(`(game took ${s}s. ${this.totalPlays} plays: ${this.hand} hands, ${this.totalDraws} draws)`);
            players.forEach(p => p.endOfGame(finalScores));
            rotateWinds.reset();
            return this.finish(s);
          }
        }
      } else console.debug(`Winner player was East, winds will not rotate.`);
    }

    this.totalPlays++;
    if (!result.draw && !config.FORCE_DRAW) {
      this.hand++;
      this.draws = 0;
    } else {
      config.log(`Hand was a draw.`);
      this.draws++;
      this.totalDraws++;
    }

    console.debug("Rotated winds:", this.wind, this.windOfTheRound);
    rotateWinds(this.wind, this.windOfTheRound, this.hand, this.draws);

    this.players.forEach((player,p) => {
      let playerwind = (this.wind + p) % 4;

      // Do we need to rotate player winds in the
      // opposite direction of the round winds?
      if (this.rules.reverse_wind_direction) {
        playerwind = (4 + this.wind - p) % 4;
      }

      player.reset(this.hand, playerwind, this.windOfTheRound, this.draws);
    });

    // used for play debugging:
    if (config.PAUSE_ON_HAND && this.hand === config.PAUSE_ON_HAND) config.HAND_INTERVAL = 60 * 60 * 1000;
    if (this.fixValues) { this.fixValues(); this.fixValues=()=>{}; }

    // "Starting hand" / "Restarting hand"
    let pre = result.draw ? 'Res' : 'S';
    let logNotice = `${pre}tarting hand ${this.hand}.`;
    let style = `color: red; font-weight: bold; font-size: 120%; border-bottom: 1px solid black;`;
    console.log(`\n${ (typeof process === "undefined") ? `%c` : `` }${logNotice}`, (typeof process === "undefined") ? style : ``);
    config.log(`\n${logNotice}`);

    logNotice = `this.hand=${this.hand}; this.draws=${this.draws}; config.PRNG.seed(${config.PRNG.seed()}); this.wind=${this.wind}; this.windOfTheRound=${this.windOfTheRound};`;
    console.log(logNotice);
    config.log(logNotice);

    this.wall.reset();
    logNotice = `wall: ${this.wall.tiles}`;
    console.debug(logNotice);
    config.log(logNotice);

    config.log(`initial deal`);
    await this.dealTiles();
    this.players.forEach(p => {
      let message = `tiles for ${p.id}: ${p.getTileFaces()}`;
      console.debug(message);
      config.log(message);
    });

    config.log(`prepare play`);
    await this.preparePlay(config.FORCE_DRAW || this.draws > 0);
    this.players.forEach(p => {
      let message = `tiles for ${p.id}: ${p.getTileFaces()} [${p.getLockedTileFaces()}]`;
      console.debug(message);
      config.log(message);
    });

    players.forEach(player => player.playWillStart());
    this.PLAY_START = Date.now();
    this.play();
  }

  /**
   * Called as part of `startHand`, this function deals
   * 13 play tiles to each player, making sure that any
   * bonus tiles are compensated for.
   */
  async dealTiles() {
    await this.continue("dealTiles");

    let wall = this.wall;
    let players = this.players;

    // The internal function for actually
    // giving initial tiles to players.
    let runDeal = async (player, done) => {
      let bank = wall.get(13);
      for (let t=0, tile; t<bank.length; t++) {
        tile = bank[t];
        players.forEach(p => p.receivedTile(player));
        let revealed = player.append(tile);
        if (revealed) {
          // bonus tile are shown to all other players.
          players.forEach(p => p.see(revealed, player));
          bank.push(wall.get());
        }
      }
      done();
    };

    // make sure the game can wait for all deals to finish:
    return Promise.all(players.map(p => {
      return new Promise(done => runDeal(p, done));
    }));
  }

  /**
   * Called as part of `startHand`, right after `dealTiles`,
   * this function preps all players for the start of actual
   * game play.
   */
  async preparePlay(redraw) {
    await this.continue("preparePlay");

    this.currentPlayerId = (this.wind % 4);
    this.discard = undefined;
    this.counter = 0;

    let players = this.players;

    // wait for "ready" from each player in response to a "hand will start" notice
    await Promise.all(players.map(p => {
      return new Promise(ready => p.handWillStart(redraw, ready))
    }));

    // at this point, the game can be said to have started, but
    // we want to make sure that any player that, at the start
    // of actual play, has a kong in their hand, is given the
    // option to declare that kong before tiles start getting
    // discarded:

    await Promise.all(players.map(p => {
      return new Promise(done => this.resolveKongs(p, done));
    }));
  }

  /**
   * Called as the last step in `preparePlay`, to give
   * players an opportunity to declare any hidden kongs
   * before the first player gets to "draw one, play one".
   */
  async resolveKongs(player, done) {
    await this.continue("resolveKongs");

    let players = this.players;
    let kong;
    do {
      kong = await player.checkKong();
      if (kong) await this.processKong(player, kong);
    } while (kong);

    done();
  }

  /**
   * When a player declares a kong, show this to all other
   * players and issue them a compensation tile. Which
   * may, of course, be a bonus tile, so keep going until
   * the player no longer reveals their just-dealt tile.
   */
  async processKong(player, kong, melded=false) {
    console.debug(`${player.id} plays kong ${kong[0].dataset.tile} (melded: ${melded})`);
    config.log(`${player.id} locks [${kong.map(t => t.dataset.tile)}]`);


    let players = this.players;
    let robbed = await Promise.all(
      players.map(p => new Promise(resolve => p.seeKong(kong, player, this.wall.remaining, resolve)))
    );

    if (robbed.some(v => !!v)) {
      console.log("kong was robbed!");
      // TODO: finish this win path.
    }

    // deal supplement tile(s) for as long as necessary
    let revealed = false;
    do {
      let tile = this.wall.get();
      config.log(`${player.id} <  ${tile} (supplement)`);
      revealed = player.append(tile);
      if (revealed) players.forEach(p => p.see(revealed, player));
    } while (revealed);
  }

  /**
   * This is the last call in `startHand`, and is our main game
   * loop. This function coordinates players drawing a tile
   * (either from the wall, or as a claimed discard from a
   * previous player), rewarding claims on discards, and
   * determining whether the hand has been won or drawn based
   * on whether or not players are witholding their discard,
   * or the wall has run out of tiles to deal from.
   */
  async play(claim) {
    await this.continue("start of play()");

    // Bootstrap this step of play
    let hand = this.hand;
    let players = this.players;
    let wall = this.wall;
    if (claim) this.currentPlayerId = claim.p;
    let discard = this.discard;
    let discardpid = discard ? (discard.dataset.from|0) : undefined;
    let currentPlayerId = this.currentPlayerId;
    this.playDelay = (hand===config.PAUSE_ON_HAND && this.counter===config.PAUSE_ON_PLAY) ? 60*60*1000 : config.PLAY_INTERVAL;
    let player = players[currentPlayerId];
    players.forEach(p => p.activate(currentPlayerId));

    // increase the play counter for debugging purposes:
    this.counter++;
    console.debug(`%chand ${hand}, play ${this.counter}`, `color: red; font-weight: bold;`);

    // ===========================
    // GAME LOOP: "Draw one" phase
    // ===========================

    if (!claim) {
      // If this is a plain call, then the player receives
      // a tile from the shuffled pile of tiles:
      discard = false;
      discardpid = false;
      await this.dealTile(player);
    }

    else {
      // If this is claim call, then the player receives
      // the current discard instead of drawing a tile:
      config.log(`${player.id} <  ${discard.dataset.tile} (${claim.claimtype})`);
      let tiles = player.receiveDiscardForClaim(claim, discard);
      config.log(`${player.id} has [${player.getTileFaces()}], [${player.getLockedTileFaces()}]`);
      players.forEach(p => p.seeClaim(tiles, player, discard, claim));

      // If the claim was for a kong, the player needs a supplement tile.
      if (tiles.length === 4) await this.dealTile(player);
    }


    // ===========================
    // GAME LOOP: "Play one" phase
    // ===========================

    do {
      if (discard) discard.classList.remove('discard');

      discard = this.discard = await new Promise(resolve => player.getDiscard(wall.remaining, resolve));

      // Did anyone win?
      if (!discard) {
        return this.processWin(player, discardpid);
      }

      // no winner, but did this player declare/meld a kong?
      if (discard.exception === CLAIM.KONG) {
        let kong = discard.kong;
        let melded = (kong.length === 1);

        await this.processKong(player, kong, melded);

        // Then set the discard to `false` so that we enter the
        // "waiting for discard from player" state again.
        discard = false;
      }
    } while (!discard); // note: we will have exited `play()` in the event of a "no discard" win.


    // No winner - process the discard.
    this.processDiscard(player);

    // Does someone want to claim this discard?
    await this.continue("just before getAllClaims() in play()");
    claim = await this.getAllClaims(); // players take note of the fact that a discard happened as part of their determineClaim()
    if (claim) return this.processClaim(player, claim);

    // No claims: have we run out of tiles?
    if (wall.dead) {
      console.log(`Hand ${hand} is a draw.`);
      players.forEach(p => p.endOfHand());
      let nextHand = () => this.startHand({ draw: true });
      if (!config.BOT_PLAY) {
        return modal.choiceInput("Hand was a draw", [{label:"OK"}], nextHand, nextHand);
      } else return setTimeout(nextHand, this.playDelay);
    }

    // If we get here, nothing of note happened, and we just move on to the next player.
    await this.continue("just before scheduling the next play() call");

    players.forEach(p => p.nextPlayer());
    this.currentPlayerId = (this.currentPlayerId + 1) % 4;

    return setTimeout(() => { player.disable(); this.play(); }, this.playDelay);
  }

  /**
   * Called as part of `play()` during the "draw one"
   * phase, this function simply gets a tile from the
   * wall, and then deals it to the indicated player.
   */
  async dealTile(player) {
    let wall = this.wall;
    let revealed = false;
    do {
      let tile = wall.get();
      this.players.forEach(p => p.receivedTile(player));
      console.debug(`${player.id} receives ${tile}`);
      config.log(`${player.id} <  ${tile}`);
      revealed = player.append(tile);
      if (revealed) { this.players.forEach(p => p.see(revealed, player)); }
      else {
        let kong = await player.checkKong(tile);
        if (kong) {
          console.debug(`${player.id} plays self-drawn kong ${kong[0].dataset.tile} during play`);
          await this.processKong(player, kong);
        }
      }
    } while (revealed);
    return wall.dead;
  }

  /**
   * Called as part of `play()` during the "play one"
   * phase, this function is triggered when the player
   * opts _not_ to discard a tile, instead discarding
   * the value `undefined`. This signals that the player
   * has managed to form a winning hand during the
   * "draw on" phase of their turn, and we should
   * wrap up this hand of play, calculate the scores,
   * and schedule a call to `startHand` so that play
   * can move on to the next hand (or end, if this
   * was the last hand to be played and it resolved
   * in a way that would normally rotate the winds).
   */
  async processWin(player, discardpid) {
    let hand = this.hand;
    let players = this.players;
    let currentPlayerId = this.currentPlayerId;
    let windOfTheRound = this.windOfTheRound;

    player.markWinner();

    let play_length = (Date.now() - this.PLAY_START);
    let message = `Player ${currentPlayerId} wins hand ${hand}! (hand took ${play_length}ms)`;
    console.log(message);
    config.log(message);

    players.forEach(p => {
    });

    // Let everyone know what everyone had. It's the nice thing to do.
    let fullDisclosure = players.map(p => p.getDisclosure());
    console.debug('disclosure array:', fullDisclosure);
    players.forEach(p => p.endOfHand(fullDisclosure));

    // And od course, calculate the scores.
    let scores = fullDisclosure.map((d,id) => this.rules.scoreTiles(d, id, windOfTheRound, this.wall.remaining));

    // In order to make sure payment is calculated correctly,
    // check which player is currently playing east, and then
    // ask the current ruleset to settle the score differences.
    let eastid = 0;
    players.forEach(p => { if(p.wind === 0) eastid = p.id; });
    let adjustments = this.rules.settleScores(scores, player.id, eastid, discardpid);
    players.forEach(p => {
      config.log(`${p.id}: ${adjustments[p.id]}, hand: ${p.getTileFaces()}, [${p.getLockedTileFaces()}], (${p.bonus})`);
      p.recordScores(adjustments);
    });


    // Before we move on, record this step in the game,
    // and show the score line in a dismissable modal.
    this.scoreHistory.push({ fullDisclosure, scores, adjustments });
    scores[player.id].winner = true;

    if (config.HAND_INTERVAL > 0) {
      // Start a new hand after the scoring modal gets dismissed.
      modal.setScores(hand, this.rules, scores, adjustments, () => {
        this.startHand({ winner: player });
      });
    } else this.startHand({ winner: player });
  }

  /**
   * Called as part of `play()` during the "play one"
   * phase, this function processes the discard as
   * declared by the current player. Note that this
   * function only deals with actual discards: if the
   * player opted not to discard because they were
   * holding a winning tile, this function is not called.
   */
  processDiscard(player) {
    let discard = this.discard;
    console.debug(`${player.id} discarded ${discard.dataset.tile}`);
    config.log(`${player.id}  > ${discard.dataset.tile}`);
    player.remove(discard);
    discard.dataset.from = player.id;
    delete discard.dataset.hidden;
    this.players.forEach(p => p.playerDiscarded(player, discard, this.counter));
  }

  /**
   * Called as part of `play()` during the "play one"
   * phase, after `processDiscard()` takes place, this
   * function ask all players to state whether they are
   * interested in the discarded tile, and if so: what
   * kind of play they intend to make with that tile.
   *
   * This is asynchronous code in that all players are
   * asked to make their determinations simultaneously,
   * and the game is on hold until all claims (including
   * passes) are in.
   *
   * If there are multiple claims, claims are ordered
   * by value, and the higest claim "wins".
   */
  async getAllClaims() {
    await this.continue("getAllClaims");

    let players = this.players;
    let currentpid = this.currentPlayerId;
    let discard = this.discard;

    // get all players to put in a claim bid
    let claims = await Promise.all(
      players.map(p => new Promise(resolve => p.getClaim(currentpid, discard, this.wall.remaining, resolve)))
    );

    console.debug('all claims are in');

    let claim = CLAIM.IGNORE;
    let win = undefined;
    let p = -1;

    // Who wins the bidding war?
    claims.forEach((c,pid)=> {
      if (c.claimtype > claim) {
        claim = c.claimtype;
        win = c.wintype ? c.wintype : undefined;
        p = pid;
      }
    });
    //console.log(claims);

    // artificial delay, if required for human play
    if (currentpid===0 && !config.BOT_PLAY && config.BOT_DELAY_BEFORE_DISCARD_ENDS) {
      await new Promise( resolve => {
        setTimeout(() => resolve(), config.BOT_DELAY_BEFORE_DISCARD_ENDS);
      });
    }

    let winningClaim = (p === -1) ? undefined : { claimtype: claim, wintype: win, p };
    // console.log(winningClaim);
    return winningClaim;
  }

  /**
   * Called in `play()` during the "play one" phase, after
   * `getAllClaims()` resolves, this function schedules the
   * "recursive" call to `play()` with the winning claim
   * passed in, so that the next "draw one" resolves the
   * claim, instead of drawing a new tile from the wall.
   */
  processClaim(player, claim) {
    let discard = this.discard;
    //console.log(`${claim.p} wants ${discard.dataset.tile} for ${claim.claimtype}`);
    player.disable();
    setTimeout(() => this.play(claim), this.playDelay);
  }
}

if (typeof process !== "undefined") {
  module.exports = Game;
}
