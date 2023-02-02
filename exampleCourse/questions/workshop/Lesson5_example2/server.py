import random

import numpy as np
import numpy.linalg as la
import prairielearn as pl


def generate(data):
    website_list = [
        "Google",
        "Wikipedia",
        "YouTube",
        "Instagram",
        "Stackoverflow",
        "Twitter",
        "NYTimes",
        "The Guardian",
        "taobao",
        "Amazon",
        "Reddit",
        "Netflix",
        "Linkedin",
        "Ebay",
        "GitHub",
    ]
    npages = 4
    max_n_links = 3
    min_n_links = 1

    # Getting the Markov matrix
    M, page_names = create_markov_matrix(website_list, npages, max_n_links, min_n_links)
    data["params"]["M"] = pl.to_json(M)
    data["params"]["page_names"] = page_names

    # Getting the eigenvector
    G = 0.85 * M + (0.15 / npages) * np.ones((npages, npages))
    xstar = power_iteration(G, 1e-8)
    x_index_sorted = np.argsort(xstar)[::-1]
    first = page_names[x_index_sorted[0]]

    # Setting up the dropdown list
    dropdown_list = []
    for name in page_names:
        if name != first:
            dropdown_list.append({"tag": "false", "ans": name})
        else:
            dropdown_list.append({"tag": "true", "ans": name})
    data["params"]["sites"] = dropdown_list


# Helper functions
# -----------------
def create_markov_matrix(website_list, npages, max_n_links, min_n_links=0):
    Nsite = len(website_list)
    if npages > Nsite:
        npages = Nsite
    if max_n_links > npages:
        max_n_links = npages - 1

    A = np.zeros((npages, npages))
    page_names = random.sample(website_list, npages)

    for i in range(npages):
        nlinks = random.randint(min_n_links, max_n_links)
        list_links = random.sample(list(range(0, npages)), nlinks)
        for j in list_links:
            if i != j:
                A[j, i] = 1

    # Making the Markov matrix
    M = np.zeros((npages, npages))
    colsum = A.sum(axis=0)
    for i in range(npages):
        if colsum[i] == 0:
            M[:, i] = 1 / npages
        else:
            M[:, i] = A[:, i] / colsum[i]

    return M, page_names


def power_iteration(H, tol):
    x0 = np.random.rand(H.shape[0])
    xnorm = la.norm(x0, 1)
    x0 = x0 / xnorm
    iter = 0
    prev_vect = np.copy(x0) - 2 * np.ones(x0.shape[0])
    curr_vect = np.copy(x0)
    while la.norm((prev_vect - curr_vect), 2) > tol and iter < 200:
        iter += 1
        prev_vect = curr_vect
        curr_vect = H.dot(curr_vect)
        curr_vect = curr_vect / la.norm(curr_vect, 1)
    return curr_vect
