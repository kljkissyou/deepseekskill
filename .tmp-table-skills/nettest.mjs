const urls = [
  "https://raw.githubusercontent.com/chlzhang/table-skills/main/README.md",
  "https://cdn.jsdelivr.net/gh/chlzhang/table-skills@main/README.md",
  "https://tbtk.asia/v1/models"
];
for (const u of urls) {
  try {
    const r = await fetch(u, { method: "GET" });
    const t = await r.text();
    console.log("OK", r.status, u, "len=" + t.length);
  } catch (e) {
    console.log("FAIL", u, e && e.message, e && e.cause && e.cause.code);
  }
}
