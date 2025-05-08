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

        if not hasattr(match, "get_home_team"):
            Feedback.add_feedback("FootballMatch class does not have home attribute")
            correct = False
        elif not callable(match.get_home_team):
            Feedback.add_feedback("FootballMatch class home attribute is not callable")
            correct = False
        elif match.get_home_team() is not home_team:
            Feedback.add_feedback("Home team was not returned correctly")
            correct = False

        if not hasattr(match, "get_away_team"):
            Feedback.add_feedback("FootballMatch class does not have away attribute")
            correct = False
        elif not callable(match.get_away_team):
            Feedback.add_feedback("FootballMatch class away attribute is not callable")
            correct = False
        elif match.get_away_team() is not away_team:
            Feedback.add_feedback("Away team was not returned correctly")
            correct = False

        if correct:
            Feedback.add_feedback("FootballMatch class is implemented correctly")
            Feedback.set_score(1)
        else:
            Feedback.set_score(0)
