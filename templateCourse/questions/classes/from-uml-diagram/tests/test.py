from code_feedback import Feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCase


class Test(PLTestCase):
    @points(1)
    @name("Check FootballMatch class")
    def test_1(self):
        home_team = self.ref.Team("Home team")
        away_team = self.ref.Team("Away team")
        match = self.st.FootballMatch(home_team, away_team)

        correct = True

        if not hasattr(match, "home"):
            Feedback.add_feedback("FootballMatch class does not have home attribute")
            correct = False
        elif match.home is not home_team:
            Feedback.add_feedback("Home team was not set correctly")
            correct = False

        if not hasattr(match, "away"):
            Feedback.add_feedback("FootballMatch class does not have away attribute")
            correct = False
        elif match.away is not away_team:
            Feedback.add_feedback("Away team was not set correctly")
            correct = False

        if correct:
            Feedback.add_feedback("FootballMatch class is implemented correctly")
            Feedback.set_score(1)
        else:
            Feedback.set_score(0)

    @points(3)
    @name("Check Team class")
    def test_2(self):
        team = self.st.Team("Test Team")
        player1 = self.ref.Player("Player 1", 10)
        player2 = self.ref.Player("Player 2", 20)

        correct = True

        if not hasattr(team, "name") or team.name != "Test Team":
            Feedback.add_feedback(
                "Team class does not have name attribute or it's not set correctly"
            )
            correct = False

        if not hasattr(team, "add_player"):
            Feedback.add_feedback("Team class does not have add_player method")
            correct = False
        elif not callable(team.add_player):
            Feedback.add_feedback("Team class add_player method is not callable")
            correct = False
        else:
            team.add_player(player1)
            team.add_player(player2)

        if not hasattr(team, "get_player"):
            Feedback.add_feedback("Team class does not have get_player method")
            correct = False
        elif not callable(team.get_player):
            Feedback.add_feedback("Team class get_player method is not callable")
            correct = False
        else:
            if team.get_player(10) is not player1:
                Feedback.add_feedback(
                    "get_player did not return first player correctly"
                )
                correct = False
            if team.get_player(20) is not player2:
                Feedback.add_feedback(
                    "get_player did not return second player correctly"
                )
                correct = False
            if team.get_player(30) is not None:
                Feedback.add_feedback(
                    "get_player did not return None for a non-existent player"
                )
                correct = False

        if correct:
            Feedback.add_feedback("Team class is implemented correctly")
            Feedback.set_score(1)
        else:
            Feedback.set_score(0)

    @points(1)
    @name("Check Player class")
    def test_3(self):
        player = self.st.Player("Test Player", 7)
        correct = True

        if not hasattr(player, "name") or player.name != "Test Player":
            Feedback.add_feedback(
                "Player class does not have name attribute or it's not set correctly"
            )
            correct = False

        if not hasattr(player, "number") or player.number != 7:
            Feedback.add_feedback(
                "Player class does not have number attribute or it's not set correctly"
            )
            correct = False

        if not hasattr(player, "__str__") or not callable(player.__str__):
            Feedback.add_feedback(
                "Player class does not have __str__ method or it's not callable"
            )
            correct = False

        if correct:
            Feedback.add_feedback("Player class is implemented correctly")
            Feedback.set_score(1)
        else:
            Feedback.set_score(0)
