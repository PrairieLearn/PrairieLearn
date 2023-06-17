import math
import random


def generate(data):

    true_ans = random.choice(
        [
            "Strain is a measure of deformation.",
            "In isotropic materials, the shear modulus can be represented as a function of the elastic modulus and the Poisson ratio.",
            "In a tension test, a specimen will experience permanent deformation if the axial stress exceeds the yielding stress of the material.",
            "Engineering stress and strain are evaluated based on the original cross-sectional area and length of the specimen.",
            "Ductile materials undergo large strain before fracture.",
            "Materials loaded in the elastic region regain its original shape once the load is removed.",
        ]
    )

    falseAnswers = [
        "Isotropic materials are characterized by 3 independent linear elastic material properties.",
        "For typical materials with positive Poisson ratio, the engineering stress is greater than the true stress.",
        "In tension, axial engineering strain is less than true strain",
        "The more compliant a material is, the higher the elastic modulus.",
        "A brittle material will experience large plastic deformation before failure occurs.",
        "If a specimen is reloaded after permanent deformation has occured, it will have a higher elastic modulus.",
        "Brittle materials have very distinct yield and rupture strength.",
    ]

    selFalseAnswers = random.sample(falseAnswers, 3)

    data["params"]["true_ans"] = true_ans

    data["params"]["false_ans1"] = selFalseAnswers[0]
    data["params"]["false_ans2"] = selFalseAnswers[1]
    data["params"]["false_ans3"] = selFalseAnswers[2]

    return data
