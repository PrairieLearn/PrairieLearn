import io

import matplotlib.pyplot as plt


def file(data):
    if data["filename"] == "data.txt":
        return "This data is generated by code."
    if data["filename"] == "figure.png":
        plt.plot([1, 2, 3], [3, 4, -2])
        buf = io.BytesIO()
        plt.savefig(buf, format="png")
        return buf
