import Runtime "mo:core/Runtime";

actor {
  var highScore = 0;

  public query ({ caller }) func getHighScore() : async Nat {
    highScore;
  };

  public shared ({ caller }) func submitScore(newScore : Nat) : async Nat {
    if (newScore <= highScore) { Runtime.trap("Not a high score, try harder next time.") };
    highScore := newScore;
    highScore;
  };
};
