import urllib.request, ssl, sys
url = "https://raw.githubusercontent.com/chlzhang/table-skills/main/README.md"
try:
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(url, timeout=25, context=ctx) as r:
        data = r.read()
    print("OK", r.status, "len", len(data))
    open(r"E:\Deepseek\.tmp-table-skills\readme_test.md","wb").write(data)
except Exception as e:
    print("FAIL", type(e).__name__, e)