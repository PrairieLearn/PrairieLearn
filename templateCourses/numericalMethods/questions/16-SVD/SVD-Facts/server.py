import random


def generate(data):

    ans = []
    tag = []

    number_of_correct = 0

    if random.choice([0, 1]):
        ans.append(
            "${\mathbf \Sigma}$ is a diagonal matrix of the singular values of ${\mathbf A}$"
        )
        tag.append("true")
        number_of_correct += 1
    else:
        ans.append(
            "${\mathbf \Sigma}$ is a diagonal matrix of the squared-root singular values of ${\mathbf A}$"
        )
        tag.append("false")

    if random.choice([0, 1]):
        ans.append(
            "${\mathbf U}$ is an orthogonal matrix of the left singular vectors of ${\mathbf A}$"
        )
        tag.append("true")
        number_of_correct += 1
    else:
        ans.append(
            "${\mathbf U}$ is an orthogonal matrix of the right singular vectors of ${\mathbf A}$"
        )
        tag.append("false")

    if random.choice([0, 1]):
        ans.append(
            "${\mathbf V}$ is a matrix containing the eigenvectors of ${\mathbf A}$"
        )
        tag.append("false")
    else:
        ans.append(
            "${\mathbf V}$ is a matrix containing the eigenvectors of ${\mathbf A}^T {\mathbf A}$"
        )
        tag.append("true")
        number_of_correct += 1

    if random.choice([0, 1]):
        ans.append(
            "${\mathbf \Sigma}$ is a diagonal matrix of the eigenvalues of ${\mathbf A}$"
        )
        tag.append("false")
    else:
        ans.append(
            "${\mathbf \Sigma}$ is a diagonal matrix of the squared-root eigenvalues ${\mathbf A}^T {\mathbf A}$"
        )
        tag.append("true")
        number_of_correct += 1

    if number_of_correct == 0 or random.choice([0, 1]) == 0:
        ans.append(
            "An $m \\times n$ matrix ${\mathbf A}$ where $m > n$ has at most $n$ singular values"
        )
        tag.append("true")
    else:
        ans.append(
            "An $m \\times n$ matrix ${\mathbf A}$ where $m > n$ has at most $m$ singular values"
        )
        tag.append("false")

    for i in range(5):
        data["params"]["ans" + str(i + 1)] = ans[i]
        data["params"]["tag" + str(i + 1)] = tag[i]
