import random

# List of countries with some sample cities
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
    "Argentina": ["Buenos Aires", "Córdoba", "Rosario", "Mendoza", "La Plata"],
    # Added the new "country" 5 with some cities
    "5": ["Five City One", "Five City Two", "Five City Three", "Five City Four", "Five City Five"],
}

def generate(data):
    # Randomly select a country
    country = random.choice(list(COUNTRIES.keys()))

    # Determine correct and incorrect cities
    correct_cities = random.sample(COUNTRIES[country], random.randint(2, 4))
    distractors = random.sample(
        [
            {"city": city, "country": other_country}
            for other_country, cities in COUNTRIES.items()
            for city in cities
            if other_country != country
        ],
        8 - len(correct_cities),
    )

    # Create full list of options
    options = [
        {"city": city, "correct": True, "feedback": ""}
        for city in correct_cities
    ] + [
        {"city": distractor["city"], "correct": False, "feedback": f"{distractor['city']} is in {distractor['country']}."}
        for distractor in distractors
    ]

    random.shuffle(options)

    data["params"]["country"] = country
    data["params"]["options"] = options
