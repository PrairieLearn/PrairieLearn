import random

# List of countries and their corresponding cities
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
    # Select a random country
    selected_country = random.choice(list(COUNTRIES.keys()))

    # Select a random number of correct cities from 1 to all the cities available for that country
    num_correct_cities = random.randint(1, len(COUNTRIES[selected_country]))
    correct_cities = random.sample(COUNTRIES[selected_country], num_correct_cities)

    # Create a list of distractor cities by selecting cities from other countries
    distractor_cities = [
        city for country, cities in COUNTRIES.items() if country != selected_country for city in cities
    ]

    # Make a random selection of distractors to make a total of 8 options
    total_options = 8
    num_distractors = total_options - num_correct_cities
    distractors = random.sample(distractor_cities, num_distractors)

    # Combine and shuffle the correct cities and distractors
    all_options = correct_cities + distractors
    random.shuffle(all_options)

    # Store the parameters for rendering in the question.html file
    data["params"]["country"] = selected_country
    data["params"]["options"] = [{"city": city, "correct": city in correct_cities} for city in all_options]
