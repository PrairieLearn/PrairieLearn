import math
import random


def generate(data):

    imgFile = "Picture1.png"

    nTry = 0
    done = False
    while not done:
        if nTry > 1000:
            print("number of tries exceeded")

        t = random.randint(8, 20)
        r = random.randint(15, 20) * t
        p = random.randint(1200, 1500)
        F = random.randint(10, 15)
        sigY = random.randint(150, 250)

        sigmax = (1e-3) * p * r / (2 * t) + 1000 * F / (math.pi * (2 * r * t + t * t))
        sigmay = (1e-3) * p * r / (t)
        tauxy = 0

        # Check for...something?
        sigmaApp = (1e-3) * p * r / (2 * t) + 1000 * F / (math.pi * (2 * r * t))
        error = math.fabs(100 * (sigmax - sigmaApp) / sigmax)

        nTry = nTry + 1
        if error < 1:
            done = True

    sigma_average = (sigmax + sigmay) / 2
    R = math.sqrt(math.pow((sigmax - sigmay) / 2, 2) + math.pow(tauxy, 2))

    sigma1 = sigma_average + R
    sigma2 = sigma_average - R
    thetap1Rad = 0.5 * math.atan2(tauxy, (sigmax - sigmay) / 2)
    thetap1 = math.degrees(thetap1Rad)
    # Used to use PrairieGeom.sign(), changed to division by absolute value
    thetap1_2 = -(thetap1 / math.fabs(thetap1)) * (180 - math.fabs(thetap1))

    vonMises = math.sqrt(sigma1 * sigma1 + sigma2 * sigma2 - sigma1 * sigma2)

    FS = sigY / vonMises

    data["params"]["t"] = t
    data["params"]["r"] = r
    data["params"]["p"] = p
    data["params"]["imgFile"] = imgFile
    data["params"]["sigY"] = sigY
    data["params"]["F"] = F

    data["correct_answers"]["sigmax"] = sigmax
    data["correct_answers"]["sigmay"] = sigmay
    data["correct_answers"]["tauxy"] = tauxy
    data["correct_answers"]["sigma1"] = sigma1
    data["correct_answers"]["sigma2"] = sigma2
    data["correct_answers"]["thetap1"] = thetap1
    data["correct_answers"]["thetap1_2"] = thetap1_2
    data["correct_answers"]["FS"] = FS

    return data
