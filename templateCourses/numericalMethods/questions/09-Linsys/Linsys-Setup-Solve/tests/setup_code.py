from random import shuffle

import numpy as np

components = [
    "Microphone",
    "Screen",
    "FPU",
    "LED0",
    "LED1",
    "Converter",
    "Speaker",
    "Buzzer",
    "Microchip0",
    "Microchip1",
]
n = len(components)

rawdata = np.random.rand(n, n + 1)
Araw = rawdata[:, :-1]
rawx = np.random.rand(
    n,
)
rawdata[:, -1] = Araw.dot(rawx)
test_data = {}

for i in range(n):
    some_data = rawdata[i, :]
    test_measurements = []
    for j, component in enumerate(components):
        test_measurements.append((component, some_data[j]))
    test_measurements.append(("EnergyConsumed", rawdata[i, -1]))
    shuffle(test_measurements)
    test_data["Test" + str(i)] = test_measurements
