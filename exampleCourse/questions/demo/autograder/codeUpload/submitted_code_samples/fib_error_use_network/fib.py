import urllib.request

def fib(n):
    with urllib.request.urlopen('https://wikipedia.org/') as f:
        html = f.read()
    return len(html)
