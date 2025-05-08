class FootballMatch:
    def __init__(self, home, away):
        self.home = home
        self.away = away


class Team:
    def __init__(self, name):
        self.name = name
        self.roster = []

    def add_player(self, player):
        self.roster.append(player)

    def get_player(self, number):
        for player in self.roster:
            if player.number == number:
                return player
        return None


class Player:
    def __init__(self, name, number):
        self.name = name
        self.number = number
