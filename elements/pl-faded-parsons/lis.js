/* FEEDBACK:
 - peräkkäiset rivit yhdistetään blokeiksi
 - etsitään LIS jossa eniten peräkkäisiä rivejä
 - värjätään LIS:n inverse punaiseksi, blokeista ehkä vain tausta
 - sisennyspalaute kuten nykyisin alusta asti oikealla paikalla olevista riveistä (värjätäänkö vihreiksi?)
*/

// Takes an iterable sequence and returns the decks given by
// patience sorting as a list of lists
// http://wordaligned.org/articles/patience-sort
// http://en.wikipedia.org/wiki/Longest_increasing_subsequence

var LIS = {};

(function($, _) { // wrap in anonymous function to allow overriding of _ and $

  LIS.patience_sort = function(list) {
    var arr = _.toArray(list),
        decks = [[arr[0]]],
        deckPos = 0;
    for (var i = 1; i < arr.length; i++) {
      var x = arr[i],
          currDeck = decks[deckPos];
      if (x < _.last(currDeck)) {
        // append to the last created deck
        currDeck.push(x);
      } else {
        // create a new deck
        decks.push([x]);
        deckPos++;
      }
    }
    return decks;
  };

  // Takes an iterable sequence of iterables that represent decks
  // that are the result of patience sorting a sequence
  LIS.find_lises = function(decks) {
    decks = _.toArray(decks);
    if (decks.length < 1) {
      return decks;
    }
    var lises = [],
        new_lises,
        deck,
        partial_lis,
        new_partial_lis,
        x, i, j, k;
    for (i = 0; i < decks.length; i++) {
      new_lises = [];
      deck = decks[i];
      for (j = 0; j < lises.length; j++) {
        partial_lis = lises[j];
        for (k = 0; k < deck.length; k++) {
          x = deck[k];
          if (x > _.last(partial_lis)) {
            new_partial_lis = partial_lis.slice(0); // dummy copy
            new_partial_lis.push(x);
            new_lises.push(new_partial_lis);
          }
        }
        new_lises.push(partial_lis);
      }
      for (k = 0; k < deck.length; k++) {
        new_lises.push([deck[k]]);
      }
      lises = new_lises;
    }
    var lis_length = 0;
    for (i = lises.length; i--; ) {
      lis_length = Math.max(lis_length, lises[i].length);
    }
    lises = _.select(lises, function(item) { return item.length >= lis_length; });
    return lises;
  };

  LIS.best_lise = function(lises) {
    var lis_scores = _.map(lises, function(item, index) {
      if (item.length <= 1) {
        return {score: 0, index: index};
      }
      var score = 0;
      for (var i = 1; i < item.length; i++) {
        if (item[i-1] == item[i] - 1) {
          score++;
        }
      }
      return {score: score, index: index};
    });
    var best = _.max(lis_scores, function(item) { return item.score; });
    return lises[best.index];
  };

  LIS.best_lise_inverse = function(list) {
    var decks = this.patience_sort(_.toArray(list)),
        lises = this.find_lises(decks),
        best = this.best_lise(lises);
    return _.difference(list, best);
  };

  // Returns an array of those indices of the input that
  // are not included in the chosen longest increasing
  // subsequence of the input values.
  LIS.best_lise_inverse_indices = function(input) {
    var decks = this.patience_sort(_.toArray(input)),
        lises = this.find_lises(decks),
        best = this.best_lise(lises),
        inverse_indices = [];
    var j = 0;
    for (var i = 0; i < best.length; i++) {
      for ( ; j < input.length; j++) {
        if (input[j] === best[i]) {
          j++;
          break;
        } else {
          inverse_indices.push(j);
        }
      }
    }
    for ( ; j < input.length; j++) {
      inverse_indices.push(j);
    }
    return inverse_indices;
  };

//This allows the current version of _ and $ to be used, even if it is later reverted
//with noConflict
})($, _);
