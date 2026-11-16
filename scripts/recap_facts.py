#!/usr/bin/env python3
"""Print a fact sheet for one week of matchups, for writing recaps.

Usage:
    python3 scripts/recap_facts.py            # latest completed week
    python3 scripts/recap_facts.py 10         # a specific week
    python3 scripts/recap_facts.py --status   # just print which week is ready

Reads LEAGUE_ID and manager names from src/config.ts and pulls everything else
from the public Sleeper API. Output is plain text meant to be read while writing
recaps/<season>-week-<n>.md (see scripts/recap-guide.md).
"""
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://api.sleeper.app/v1"


def get(path):
    with urllib.request.urlopen(f"{API}{path}", timeout=60) as r:
        return json.load(r)


def read_config():
    src = open(os.path.join(ROOT, "src", "config.ts"), encoding="utf-8").read()
    league_id = re.search(r"LEAGUE_ID\s*=\s*'(\d+)'", src).group(1)
    block = re.search(r"MANAGERS[^{]*\{(.*?)\};", src, re.S).group(1)
    managers = {k: v for k, v in re.findall(r"(\w+):\s*'([^']*)'", block)}
    return league_id, managers


LEAGUE_ID, MANAGERS = read_config()
league = get(f"/league/{LEAGUE_ID}")
settings = league["settings"]
state = get("/state/nfl")
last_scored = settings.get("last_scored_leg") or 0
playoff_start = settings.get("playoff_week_start") or 15

if "--status" in sys.argv:
    print(f"season={league['season']} status={league['status']} nfl_week={state['week']} last_scored_week={last_scored} playoff_week_start={playoff_start}")
    sys.exit(0)

args = [a for a in sys.argv[1:] if a.isdigit()]
WEEK = int(args[0]) if args else last_scored
if WEEK < 1 or WEEK > last_scored:
    print(f"Week {WEEK} is not final yet (last scored week is {last_scored}).")
    sys.exit(2)

users = {u["user_id"]: u for u in get(f"/league/{LEAGUE_ID}/users")}
rosters = get(f"/league/{LEAGUE_ID}/rosters")
players = get("/players/nfl")
divisions = {int(k.split("_")[1]): v for k, v in (league.get("metadata") or {}).items() if re.fullmatch(r"division_\d+", k)}

T = {}
for r in rosters:
    u = users.get(r["owner_id"], {})
    name = u.get("display_name", f"Roster {r['roster_id']}")
    T[r["roster_id"]] = dict(
        user=name,
        team=((u.get("metadata") or {}).get("team_name") or "").strip() or f"Team {name}",
        manager=MANAGERS.get(name, "") or "(no first name on file)",
        div=divisions.get(r["settings"].get("division"), "-"),
    )


def pname(pid):
    if pid == "0":
        return "EMPTY SLOT"
    p = players.get(pid, {})
    n = p.get("full_name") or f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or pid
    return f"{n} ({p.get('position', '?')}, {p.get('team') or 'FA'})"


def pos(pid):
    p = players.get(pid, {})
    return set(p.get("fantasy_positions") or [p.get("position", "?")])


ELIG = {
    "QB": {"QB"}, "RB": {"RB"}, "WR": {"WR"}, "TE": {"TE"}, "K": {"K"}, "DEF": {"DEF"},
    "FLEX": {"RB", "WR", "TE"}, "WRRB_FLEX": {"RB", "WR"}, "REC_FLEX": {"WR", "TE"},
    "SUPER_FLEX": {"QB", "RB", "WR", "TE"},
}
SLOTS = [s for s in league["roster_positions"] if s in ELIG]


def optimal(points):
    """Best possible lineup score (greedy, most restrictive slots first)."""
    used, total = set(), 0.0
    for slot in sorted(SLOTS, key=lambda s: len(ELIG[s])):
        options = [(v, k) for k, v in points.items() if k not in used and pos(k) & ELIG[slot]]
        if options:
            v, k = max(options)
            used.add(k)
            total += v
    return round(total, 2)


# ── Season so far ──────────────────────────────────────────
matchups = {w: get(f"/league/{LEAGUE_ID}/matchups/{w}") for w in range(1, WEEK + 1)}
rec = {rid: dict(w=0, l=0, t=0, pf=0.0, pa=0.0, res=[]) for rid in T}
scores_hist, player_hist, bench_hist, games_by_week = [], [], [], {}

for w in range(1, WEEK + 1):
    rows = matchups[w]
    pairs = {}
    for x in rows:
        if x.get("matchup_id") is not None:
            pairs.setdefault(x["matchup_id"], []).append(x)
    games = [p for p in pairs.values() if len(p) == 2]
    games_by_week[w] = games
    for x in rows:
        scores_hist.append((x["points"], w, x["roster_id"]))
        for i, s in enumerate(x.get("starters") or []):
            player_hist.append(((x.get("starters_points") or [0])[i] if i < len(x.get("starters_points") or []) else 0, w, x["roster_id"], s))
        bench_hist.append((round(optimal(x.get("players_points") or {}) - x["points"], 2), w, x["roster_id"]))
    if w == WEEK:
        before = {rid: dict(r, res=list(r["res"])) for rid, r in rec.items()}
    if w < playoff_start:
        for a, b in games:
            for me, op in ((a, b), (b, a)):
                r = rec[me["roster_id"]]
                r["pf"] += me["points"]
                r["pa"] += op["points"]
                res = "W" if me["points"] > op["points"] else "L" if me["points"] < op["points"] else "T"
                r["res"].append(res)
                r[res.lower()] += 1


def standings(recs):
    return sorted(T, key=lambda r: (-(recs[r]["w"] + recs[r]["t"] / 2), -recs[r]["pf"]))


def streak(res):
    if not res:
        return "-"
    n = 0
    for x in reversed(res):
        if x != res[-1]:
            break
        n += 1
    return f"{n}{res[-1]}"


def div_rank(recs, rid):
    lst = [r for r in standings(recs) if T[r]["div"] == T[rid]["div"]]
    return lst.index(rid) + 1


def recstr(r):
    return f"{r['w']}-{r['l']}" + (f"-{r['t']}" if r["t"] else "")


st_before, st_after = standings(before), standings(rec)
playoff_teams = settings.get("playoff_teams", 0)
rows = matchups[WEEK]
pts = {x["roster_id"]: x["points"] for x in rows}
order = sorted(pts, key=lambda r: -pts[r])

# ── Power rankings ─────────────────────────────────────────
rank_dir = os.path.join(ROOT, "rankings")
prior = []
for f in os.listdir(rank_dir) if os.path.isdir(rank_dir) else []:
    m = re.match(rf"{league['season']}-week-(\d+)\.(md|txt)$", f)
    if m and int(m.group(1)) < WEEK:
        prior.append((int(m.group(1)), f))
prior.sort()

out = []
P = out.append
P(f"===== {league['name']} {league['season']} WEEK {WEEK} FACT SHEET =====")
if WEEK >= playoff_start:
    P(f"PLAYOFFS: week {WEEK} is a playoff week (playoffs started week {playoff_start}). Check winners_bracket for which games are for the title.")
P(f"Regular season: weeks 1-{playoff_start - 1}. Weeks left after this one: {max(0, playoff_start - 1 - WEEK)}. Top {playoff_teams} make the playoffs (Sleeper seeding/division winners are official).")
P("Commish's latest power rankings before this week: " + (f"rankings/{prior[-1][1]} (read it for the 'vibe going in')" if prior else "none"))
P("\nWEEK SCORES high->low: " + ", ".join(f"{T[r]['team']} {pts[r]:.2f}" for r in order))

top_players = sorted(((v, rid, pid, "start" if pid in (x.get("starters") or []) else "BENCH") for x in rows for rid in [x["roster_id"]] for pid, v in (x.get("players_points") or {}).items()), reverse=True)[:8]
P("TOP PLAYERS THIS WEEK (any roster spot): " + "; ".join(f"{pname(p)} {v:.1f} [{T[r]['user']}, {s}]" for v, r, p, s in top_players))
wk_bench = sorted(((b, r) for b, w, r in bench_hist if w == WEEK), reverse=True)
P("MOST POINTS LEFT ON BENCH THIS WEEK: " + ", ".join(f"{T[r]['user']} {b:.2f}" for b, r in wk_bench[:4]))
margins = sorted(((abs(a["points"] - b["points"]), a, b) for a, b in games_by_week[WEEK]), key=lambda z: -z[0])
P("MARGINS THIS WEEK: " + ", ".join(f"{T[a['roster_id']]['user']}-{T[b['roster_id']]['user']} {m:.2f}" for m, a, b in margins))

# season records and whether this week set them
def flag(cond):
    return "  <-- SET THIS WEEK" if cond else ""

hi = max(scores_hist)
lo = min(s for s in scores_hist if s[0] > 0)
best_player = max(player_hist)
all_margins = [(abs(a["points"] - b["points"]), w, a["roster_id"], b["roster_id"]) for w, gs in games_by_week.items() for a, b in gs]
big = max(all_margins)
close = min(all_margins)
mbench = max(bench_hist)
P("\nSEASON RECORDS THROUGH THIS WEEK:")
P(f"  Highest team score: {T[hi[2]]['team']} {hi[0]:.2f} (wk {hi[1]}){flag(hi[1] == WEEK)}")
P(f"  Lowest team score: {T[lo[2]]['team']} {lo[0]:.2f} (wk {lo[1]}){flag(lo[1] == WEEK)}")
P(f"  Best single player game (starters): {pname(best_player[3])} {best_player[0]:.1f} for {T[best_player[2]]['user']} (wk {best_player[1]}){flag(best_player[1] == WEEK)}")
P(f"  Biggest blowout: {big[0]:.2f} (wk {big[1]}){flag(big[1] == WEEK)}")
P(f"  Closest game: {close[0]:.2f} (wk {close[1]}){flag(close[1] == WEEK)}")
P(f"  Most points left on a bench: {T[mbench[2]]['user']} {mbench[0]:.2f} (wk {mbench[1]}){flag(mbench[1] == WEEK)}")

txs = [t for t in get(f"/league/{LEAGUE_ID}/transactions/{WEEK}") if t["type"] == "trade" and t["status"] == "complete"]
for t in txs:
    P("\nTRADE THIS WEEK: " + " | ".join(
        f"{T[rid]['user']} gets " + ", ".join([pname(p) for p, to in (t.get("adds") or {}).items() if to == rid] + [f"{d['season']} rd {d['round']} pick" for d in t.get("draft_picks") or [] if d["owner_id"] == rid])
        for rid in t["roster_ids"]))

for a, b in sorted(games_by_week[WEEK], key=lambda g: -max(g[0]["points"], g[1]["points"])):
    if a["points"] < b["points"]:
        a, b = b, a
    ta, tb = T[a["roster_id"]], T[b["roster_id"]]
    P(f"\n=== MATCHUP: {ta['user']} vs {tb['user']}  (use '## {ta['user']} vs {tb['user']} | Headline') ===")
    if ta["div"] == tb["div"]:
        P(f"Division game ({ta['div']})")
    earlier = [w for w in range(1, WEEK) for x, y in games_by_week[w] if {x["roster_id"], y["roster_id"]} == {a["roster_id"], b["roster_id"]}]
    if earlier:
        P(f"Rematch: also played in week(s) {earlier}")
    for label, x, y in (("WINNER", a, b), ("LOSER", b, a)):
        rid, t = x["roster_id"], T[x["roster_id"]]
        bf, af = before[rid], rec[rid]
        P(f"-- {label}: {t['team']} [@{t['user']}, {t['manager']}], {t['div']} division")
        P(f"   Going in: {recstr(bf)}, {bf['pf']:.1f} PF, league #{st_before.index(rid) + 1}, div #{div_rank(before, rid)}, streak {streak(bf['res'])}, results {''.join(bf['res']) or 'none'}")
        P(f"   Score {x['points']:.2f} (week rank {order.index(rid) + 1}/{len(order)}; all-play {len(order) - 1 - order.index(rid)}-{order.index(rid)})")
        sp = sorted(((pname(s), (x.get("starters_points") or [0] * 99)[i]) for i, s in enumerate(x.get("starters") or [])), key=lambda z: -z[1])
        P("   Starters: " + "; ".join(f"{n} {v:.1f}" for n, v in sp))
        bench = sorted(((k, v) for k, v in (x.get("players_points") or {}).items() if k not in (x.get("starters") or [])), key=lambda z: -z[1])[:4]
        P("   Top bench: " + "; ".join(f"{pname(k)} {v:.1f}" for k, v in bench))
        opt = optimal(x.get("players_points") or {})
        note = f"  <-- OPTIMAL LINEUP WOULD HAVE WON (opp {y['points']:.2f})" if label == "LOSER" and opt > y["points"] else ""
        P(f"   Optimal lineup {opt:.2f} (left {opt - x['points']:.2f} on bench){note}")
        P(f"   After: {recstr(af)}, {af['pf']:.1f} PF, league #{st_after.index(rid) + 1}, div #{div_rank(rec, rid)}, streak {streak(af['res'])}")
    P(f"Margin: {a['points'] - b['points']:.2f}")

cut = st_after[playoff_teams - 1] if playoff_teams else None
P(f"\nSTANDINGS AFTER WEEK {WEEK} (by record, then PF; line = top {playoff_teams}):")
for i, r in enumerate(st_after):
    gb = ""
    if cut is not None and i >= playoff_teams:
        games_back = ((rec[cut]["w"] - rec[r]["w"]) + (rec[r]["l"] - rec[cut]["l"])) / 2
        gb = f"  ({games_back:g} GB of #{playoff_teams})"
    P(f"  {i + 1}. {T[r]['team']} [@{T[r]['user']}] {recstr(rec[r])}, {rec[r]['pf']:.1f} PF, {T[r]['div']}{gb}")
    if i + 1 == playoff_teams:
        P("  ---------------- playoff line ----------------")

print("\n".join(out))
