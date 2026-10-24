#!/usr/bin/env python3
"""Vercel usage monitor for the marathon map (Hobby plan).

Usage: python3 scripts/monitor.py            # one snapshot
       python3 scripts/monitor.py --loop 300 # every 5 min
"""
import json, subprocess, sys, time
from datetime import datetime, timezone, timedelta

PROJECT = "dublin-marathon-closures"
LIMIT_GB, LIMIT_REQ = 100, 1_000_000
MB_PER_VISIT = 2.0  # measured with scripts/measure.mjs


def api(path):
    out = subprocess.run(["vercel", "api", path], capture_output=True, text=True).stdout
    return json.loads(out[out.index("{"):])


def usage(frm, to):
    q = f"/v2/usage?type=requests&from={frm:%Y-%m-%dT%H:%M:%S.000Z}&to={to:%Y-%m-%dT%H:%M:%S.000Z}"
    return api(q)["data"]


def share(row, kind):
    for b in row.get("breakdown", {}).get(kind, []):
        if b.get("name") == PROJECT:
            return b["percent"] / 100
    return 0.0


def snapshot():
    now = datetime.now(timezone.utc)
    month = usage(now.replace(day=1, hour=0, minute=0, second=0, microsecond=0), now)
    today = usage(now - timedelta(hours=12), now)

    gb = sum(r["bandwidth_outgoing_bytes"] for r in month) / 1e9
    req = sum(r["request_hit_count"] + r["request_miss_count"] for r in month)

    print(f"\n=== {datetime.now():%a %H:%M:%S}  (Vercel data as of {today[-1]['date'][11:16] if today else '?'} UTC, lags a few min)")
    print(f"Team month-to-date: {gb:6.2f} GB / {LIMIT_GB} GB ({gb / LIMIT_GB:5.1%})   "
          f"{req:,} / {LIMIT_REQ:,} requests ({req / LIMIT_REQ:5.1%})")
    print(f"{'hour (Dublin)':<14}{'team MB':>9}{'map MB':>9}{'map reqs':>10}{'~visits':>9}")
    tot_mb = tot_req = 0
    for r in today:
        h = datetime.fromisoformat(r["date"].replace("Z", "+00:00")) + timedelta(hours=1)  # IST
        mb = r["bandwidth_outgoing_bytes"] / 1e6
        reqs = r["request_hit_count"] + r["request_miss_count"]
        mmb, mreq = mb * share(r, "bandwidth"), reqs * share(r, "requests")
        tot_mb += mmb; tot_req += mreq
        if mb or reqs:
            print(f"{h:%H:00}{'':<9}{mb:9.1f}{mmb:9.1f}{mreq:10.0f}{mmb / MB_PER_VISIT:9.0f}")
    print(f"map last 12h: {tot_mb / 1000:.2f} GB, ~{tot_req:,.0f} requests, ~{tot_mb / MB_PER_VISIT:,.0f} visits")
    left_gb = LIMIT_GB - gb
    print(f"headroom: {left_gb:.1f} GB = ~{left_gb * 1000 / MB_PER_VISIT:,.0f} more visits before Hobby limit")
    pct = max(gb / LIMIT_GB, req / LIMIT_REQ)
    if pct > 0.6:
        print("!!! OVER 60% OF HOBBY LIMIT: upgrade to Pro now")
    sys.stdout.flush()


if __name__ == "__main__":
    if "--loop" in sys.argv:
        every = int(sys.argv[sys.argv.index("--loop") + 1])
        while True:
            try:
                snapshot()
            except Exception as e:
                print("error:", e)
            time.sleep(every)
    else:
        snapshot()
