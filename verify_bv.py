import json, re, sys, urllib.request

BVS = """BV1XUn66WExx
BV1iUnH6rEwe
BV1g1nL6nESW
BV1mJgd6AEm5
BV1uPnm6BE15
BV1Jenb6NE2M
BV19Qnk6FEMw
BV1wpnP6iEzW
BV1Tvnt61Eco
BV1BEnE6vEnY
BV1Ymnb6xEdQ
BV1Jonn67E1t
BV1q7nz6dEKK
BV17vn46dEFq
BV1iVnN6hEbn
BV1SunB63Etp
BV1kJpq6eE9j""".split()

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"

def get(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Referer": "https://www.bilibili.com/",
        "Accept": "application/json,text/plain,*/*",
    })
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode("utf-8", "replace")

out = []
for bv in BVS:
    row = {"bv": bv}
    try:
        d = json.loads(get(f"https://api.bilibili.com/x/web-interface/view?bvid={bv}"))
        if d.get("code") != 0:
            row["error"] = f"view code={d.get('code')} {d.get('message')}"
        else:
            v = d["data"]
            row["title"] = v.get("title")
            row["pubdate"] = v.get("pubdate")
            row["pub_ts"] = __import__("datetime").datetime.fromtimestamp(
                v.get("pubdate", 0)).strftime("%Y-%m-%d %H:%M")
            row["ctime"] = v.get("ctime")
            row["owner"] = v.get("owner", {}).get("name")
            row["desc"] = (v.get("desc") or "")[:400]
            row["tname"] = v.get("tname")
            season = v.get("ugc_season") or {}
            row["season"] = season.get("title")
            row["season_id"] = season.get("id")
            row["ep_count"] = len(season.get("sections", [{}])[0].get("episodes", [])) if season else 0
            row["tags"] = [t.get("tag_name") for t in (v.get("tag") or [])]
    except Exception as e:
        row["error"] = f"view EXC {type(e).__name__}: {e}"

    # tag api fallback
    try:
        t = json.loads(get(f"https://api.bilibili.com/x/tag/archive/tags?bvid={bv}"))
        if t.get("code") == 0:
            row["api_tags"] = [x.get("tag_name") for x in t["data"]]
    except Exception as e:
        row["api_tags_err"] = str(e)[:80]

    out.append(row)
    print(json.dumps(row, ensure_ascii=False))

with open(r"E:\Deepseek\ss14_verify.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print("SAVED", len(out))
