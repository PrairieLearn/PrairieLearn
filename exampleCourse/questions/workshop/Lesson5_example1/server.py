def generate(data):
    graph1 = "digraph G {"
    graph1 += '"Parents Visiting?" -> "Go to movie theater" [label=" YES"]'
    graph1 += '"Parents Visiting?" -> "Check the weather" [label=" NO"]'
    graph1 += '"Check the weather" -> "Play tennis" [label=" Sunny"]'
    graph1 += '"Check the weather" -> "Check the wallet" [label=" Windy"]'
    graph1 += '"Check the weather" -> "Watch TV at home" [label=" Rainy"]'
    graph1 += '"Check the wallet" -> "Shopping"[label=" Extra cash"]'
    graph1 += '"Check the wallet" -> "Go to coffee shop"[label=" Broke"]'
    graph1 += "}"

    data["params"]["graph1"] = graph1
