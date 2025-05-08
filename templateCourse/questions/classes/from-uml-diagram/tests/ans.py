class FootballMatch:
    def __init__(self, home, away):
        self.home = home
        self.away = away

    def get_home_team(self):
        return self.home

    def get_away_team(self):
        return self.away


class Team:
    def __init__(self, name):
        self.name = name
        self.players = []

    def add_player(self, player):
        self.players.append(player)

    def get_player(self, number):
        for player in self.players:
            if player.number == number:
                return player
        return None


class Player:
    def __init__(self, name, number):
        self.name = name
        self.number = number
