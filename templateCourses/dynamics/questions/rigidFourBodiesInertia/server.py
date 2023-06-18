import random

import numpy as np
import prairielearn as pl


def generate(data):
    radius = random.randint(1, 2)
    length = random.randint(4, 5)
    width = random.randint(2, 4)
    height = random.randint(2, 4)
    m1 = random.randint(1, 4)
    m2 = random.randint(1, 4)
    m3 = random.randint(1, 4)
    m4 = random.randint(1, 4)

    diskOffset = random.choice([[0, 0], [radius, radius], [radius, -radius]])
    rectOffset = random.choice([[0, 0], [0, height / 2], [0, height]])

    if diskOffset[0] == 0:
        edgeOffsets = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]]
    else:
        edgeOffsets = [[-1, 0]]

    PList = [
        {
            "P": rectOffset,
            "desr": "one corner of the rectangle",
            "offsets": [[1, 0], [-1, 0], [0, -1]],
        },
        {
            "P": [rectOffset[0] + width, rectOffset[1]],
            "desr": "one corner of the rectangle",
            "offsets": [[0, -1]],
        },
        {
            "P": [rectOffset[0] + width, rectOffset[1] - height],
            "desr": "one corner of the rectangle",
            "offsets": [[0, 1]],
        },
        {
            "P": [rectOffset[0], rectOffset[1] - height],
            "desr": "one corner of the rectangle",
            "offsets": [[1, 0], [-1, 0], [0, 1]],
        },
        {
            "P": [diskOffset[0] - length, diskOffset[1]],
            "desr": "the edge of the disk",
            "offsets": edgeOffsets,
        },
        {
            "P": [diskOffset[0] - length - radius, diskOffset[1] + radius],
            "desr": "the edge of the disk",
            "offsets": [[0, -1]],
        },
        {
            "P": [diskOffset[0] - length - radius, diskOffset[1] - radius],
            "desr": "the edge of the disk",
            "offsets": [[0, 1]],
        },
        {
            "P": [diskOffset[0] - length - 2 * radius, diskOffset[1]],
            "desr": "the edge of the disk",
            "offsets": [[1, 0]],
        },
    ]

    PElem = random.choice(PList)
    P = np.array(PElem["P"])

    CDisk = np.array([-length - radius, 0]) + np.array(diskOffset)
    CRod = np.array([-length / 2, 0])
    CRect = np.array([width / 2, -height / 2]) + np.array(rectOffset)
    CPoint = P

    m = m1 + m2 + m3 + m4
    C = (m1 * CDisk + m2 * CRod + m3 * CRect + m4 * CPoint) / m
    rPC = np.linalg.norm(C - P)

    IDisk = 1 / 2 * m1 * radius**2
    IRod = 1 / 12 * m2 * length**2
    IRect = 1 / 12 * m3 * (width**2 + height**2)
    IPoint = 0

    IDiskP = IDisk + m1 * np.dot(CDisk - P, CDisk - P)
    IRodP = IRod + m2 * np.dot(CRod - P, CRod - P)
    IRectP = IRect + m3 * np.dot(CRect - P, CRect - P)

    IP = IDiskP + IRodP + IRectP

    IDiskC = IDisk + m1 * np.dot(CDisk - C, CDisk - C)
    IRodC = IRod + m2 * np.dot(CRod - C, CRod - C)
    IRectC = IRect + m3 * np.dot(CRect - C, CRect - C)
    IPointC = IPoint + m4 * np.dot(CPoint - C, CPoint - C)

    IC = IDiskC + IRodC + IRectC + IPointC

    answerDesc = "moment of inertia $I_{P,\\hat{k}}$ about the $\\hat{k}$ axis through the point $P$"
    answerExp = "I_{P,\\hat{k}}"
    answerUnits = "kg \\ m^2"

    angleFactor = random.randint(0, 3)

    # Rotation matrix to account for angleFactor

    c = np.cos(angleFactor * np.pi / 2)
    s = np.sin(angleFactor * np.pi / 2)

    R = np.array([[c, -s], [s, c]])

    data["params"]["PDesr"] = PElem["desr"]
    data["params"]["radius"] = float(radius)
    data["params"]["m1"] = float(m1)
    data["params"]["length"] = float(length)
    data["params"]["m2"] = float(m2)
    data["params"]["width"] = float(width)
    data["params"]["height"] = float(height)
    data["params"]["m3"] = float(m3)
    data["params"]["m4"] = float(m4)
    data["params"]["answerDesc"] = answerDesc
    data["params"]["answerExp"] = answerExp
    data["params"]["answerUnits"] = answerUnits

    # pl-drawing

    [bottomLeft, bottomRight, topLeft, topRight, center, extent] = boundingBox2D(
        [
            CDisk + np.array([-radius, 0]),
            CDisk + np.array([radius, 0]),
            CDisk + np.array([0, -radius]),
            CDisk + np.array([0, radius]),
            CRect + np.array([-width / 2, -height / 2]),
            CRect + np.array([-width / 2, height / 2]),
            CRect + np.array([width / 2, -height / 2]),
            CRect + np.array([width / 2, height / 2]),
        ]
    )

    C = center

    C = (R @ (C[0:-1].reshape(2, 1))).reshape(
        2,
    )
    O = np.zeros(2)

    # Disk
    CDisk = (R @ CDisk.reshape(2, 1)).reshape(
        2,
    )
    CDiskx = 250 + 35 * (CDisk[0] - C[0])
    CDisky = 250 - 35 * (CDisk[1] - C[1])

    data["params"]["CDiskx"] = CDiskx
    data["params"]["CDisky"] = CDisky
    data["params"]["radius_pl"] = 35 * radius

    # Line
    linex1 = 250 + 35 * (O[0] - C[0])
    liney1 = 250 - 35 * (O[1] - C[1])

    line_2 = np.array([-length, 0])

    line_2 = (R @ line_2.reshape(2, 1)).reshape(
        2,
    )

    linex2 = 250 + 35 * (line_2[0] - C[0])
    liney2 = 250 - 35 * (line_2[1] - C[1])

    data["params"]["linex1"] = linex1
    data["params"]["liney1"] = liney1
    data["params"]["linex2"] = linex2
    data["params"]["liney2"] = liney2

    CLine = line_2 / 2

    CLinex = 250 + 35 * (CLine[0] - C[0]) + 5
    CLiney = 250 - 35 * (CLine[1] - C[1]) + 5

    data["params"]["CLinex"] = CLinex
    data["params"]["CLiney"] = CLiney

    # Rectangle
    CRect = (R @ CRect.reshape(2, 1)).reshape(
        2,
    )
    CRectx = 250 + 35 * (CRect[0] - C[0])
    CRecty = 250 - 35 * (CRect[1] - C[1])

    data["params"]["CRectx"] = CRectx
    data["params"]["CRecty"] = CRecty
    if angleFactor == 0 or angleFactor == 2:
        data["params"]["width_pl"] = 35 * width
        data["params"]["height_pl"] = 35 * height
    else:
        data["params"]["width_pl"] = 35 * height
        data["params"]["height_pl"] = 35 * width

    # Point
    P = (R @ P.reshape(2, 1)).reshape(
        2,
    )
    Px = 250 + 35 * (P[0] - C[0])
    Py = 250 - 35 * (P[1] - C[1])

    data["params"]["Px"] = Px
    data["params"]["Py"] = Py

    data["correct_answers"]["IP"] = IP
    data["params"]["angleFactor"] = float(angleFactor)

    return data


def boundingBox2D(points):
    xMin = points[0][0]
    xMax = points[0][0]
    yMin = points[0][1]
    yMax = points[0][1]
    for i in range(1, len(points)):
        xMin = min(xMin, points[i][0])
        xMax = max(xMax, points[i][0])
        yMin = min(yMin, points[i][1])
        yMax = max(yMax, points[i][1])

    bottomLeft = np.array([xMin, yMin, 0])
    bottomRight = np.array([xMax, yMin, 0])
    topLeft = np.array([xMin, yMax, 0])
    topRight = np.array([xMax, yMax, 0])
    center = np.array([(xMin + xMax) / 2, (yMin + yMax) / 2, 0])
    extent = np.array([xMax - xMin, yMax - yMin])

    return bottomLeft, bottomRight, topLeft, topRight, center, extent
