/**
 * And this is a human player... which is "a kind
 * of bot player" and that might seem surprising,
 * but the reason we do this is because it allows
 * us to get a bot player helping the human player
 * "for free", and that's great!
 */
class HumanPlayer extends BotPlayer {
  constructor(id, proxyWall) {
    super(id, proxyWall);
    this.mayDiscard = false;
    this.maySendClaim = false;

    // we will see the "knowledge" panel with our tracker
    this.tracker.bindTo(document.querySelector(".knowledge"));

    // humans need a UI to play mahjong.
    this.ui = new ClientUI(this.id);
  }

  append(tile, concealed=false) {
    return super.append(tile, concealed);
  }

  determineDiscard(resolve) {
    // Let's ask our "bot" assistant for what it would
    // suggest we throw away:
    super.determineDiscard(suggestion => {
      if (BOT_PLAY) {
        return resolve(suggestion);
      }

      suggestion.classList.add('suggestion');

      // Set up click-listening for tiles: if the user clicks
      // any tile that is still concealed in their hand, that's
      // the tile they're discarding.
      let fn = e => {
        tiles.forEach(tile => removeEventListener("click", fn));
        suggestion.classList.remove('suggestion');
        resolve(e.target);
      };

      // And start listening for clicks. Even though this may
      // take an hour or more, play will resume on a click occurs.
      //
      // TODO: this.ui.listenForDiscard();
      //
    });
  }

  determineClaim(pid, discard, resolve, interrupt) {
    // and of course, the same applies here:
    let suggestion = super.determineClaim(pid, discard, suggestion => {
      if (BOT_PLAY) {
        return resolve(suggestion);
      }

      let fn = e => {
        interrupt();

        // let's spawn a little modal to see what the user actually wanted to do here.
        modal.setContent("What kind of claim are you making?", [
          { label: "Ignore", value: CLAIM.IGNORE },
          { label: "Chow (X**)", value: CLAIM.CHOW1 },
          { label: "Chow (*X*)", value: CLAIM.CHOW2 },
          { label: "Chow (**X)", value: CLAIM.CHOW3 },
          { label: "Pung", value: CLAIM.PUNG },
          { label: "Kong", value: CLAIM.KONG },
          { label: "Win", value: CLAIM.WIN },
        ], result => {
          discard.removeEventListener("click", fn);
          resolve({
            claimtype: result,
            wintype: undefined
          });
        });
        modal.classList.remove('hidden');
      }

      discard.addEventListener("click", fn);
    });
  }
}