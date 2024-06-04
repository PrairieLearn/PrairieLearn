import random

COUNTRIES = {
    "United States": ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix"],
    "Canada": ["Toronto", "Vancouver", "Montreal", "Calgary", "Ottawa"],
    "United Kingdom": ["London", "Manchester", "Birmingham", "Glasgow", "Liverpool"],
    "Australia": ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide"],
    "Germany": ["Berlin", "Munich", "Frankfurt", "Hamburg", "Cologne"],
    "France": ["Paris", "Marseille", "Lyon", "Toulouse", "Nice"],
    "Italy": ["Rome", "Milan", "Naples", "Turin", "Palermo"],
    "Japan": ["Tokyo", "Osaka", "Nagoya", "Sapporo", "Fukuoka"],
    "Brazil": ["São Paulo", "Rio de Janeiro", "Brasília", "Salvador", "Fortaleza"],
    "India": ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai"],
}


def generate(data):
    # Select a random country for the prompt.
    prompt_country = random.choice(list(COUNTRIES.keys()))

    # Select 5 random distractors. Each item is a (city, country) tuple.
    distractors = random.sample(
        [
            {"city": city, "country": country}
            for country, cities in COUNTRIES.items()
            for city in cities
            if country != prompt_country
        ],
        5,
    )

    data["params"]["country"] = prompt_country
    data["params"]["correct_cities"] = COUNTRIES[prompt_country]
    data["params"]["distractor_cities"] = distractors
