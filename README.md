# Ball Knowers: League Hub

The website for the Ball Knowers dynasty league: power rankings, standings, team pages,
the record book, draft boards, trades and the trophy room.

Scores, standings, rosters, drafts and trades come straight from Sleeper and refresh every
6 hours. The only thing you write by hand is the power rankings.

**Live site:** https://ethandodz.github.io/dynasty_website/ (once GitHub Pages is turned on, see below)

---

## Posting new power rankings (works from your phone)

1. On GitHub, open the [`rankings`](rankings/) folder.
2. Tap **Add file → Create new file**.
3. Name it `<season>-week-<number>.md`, for example **`2026-week-9.md`**.
4. Paste your rankings straight from Notes. Each team starts with its number:

   ```
   Week 9 Power Rankings

   1. BangUpBobby (7-1). Puka is balling...
   2. Marsolo (6-2). Another win streak...
   ```

   - Team names don't have to be exact. "Rtuebe", "Team rtuebe" and "Ryan" all work.
   - Arrows (⬆️3️⃣ ⬇️2️⃣ 🟰) and records are optional. The site works out movement from your
     last ranking and pulls each team's record and points from Sleeper.
   - Anything you write above "1." shows up as an intro paragraph.
   - A summary list repeated at the bottom is ignored.
5. Tap **Commit changes** on the `main` branch. The site updates in about a minute.

To fix a typo later, open the file, tap the pencil icon, edit and commit.

If a team name ever doesn't match, the page still shows the name you wrote, just without
the team's logo and link. Add the nickname to `TEAM_ALIASES` in [`src/config.ts`](src/config.ts).

## Weekly matchup recaps

Recaps live in the [`recaps`](recaps/) folder, one file per week: `2026-week-9.md`.
Write an optional intro, then one section per matchup:

```
## BangUpBobby vs juebelacker | Headline goes here
The article...
```

Use usernames, team names or first names for the two teams. The site finds the game and
adds the scoreboard, records and top performers from Sleeper automatically.

Recaps are written automatically every Tuesday morning by a scheduled Claude session.
It follows [`scripts/recap-guide.md`](scripts/recap-guide.md) and uses
`python3 scripts/recap_facts.py <week>` to pull each week's box scores.

## Each new season

When the league renews on Sleeper it gets a **new league ID**. Paste the new ID into
`LEAGUE_ID` in [`src/config.ts`](src/config.ts). Past seasons are found automatically,
so champions, all-time records and head-to-head history carry over.

Manager first names also live in `src/config.ts`.

## One-time setup: turning the site on

1. In the repo on GitHub go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Merge this code into `main`. The site builds and goes live at the link above.

To rebuild right away (say, after Monday night), go to **Actions → Deploy site → Run workflow**.

## Running it on a computer (optional)

```sh
npm install
npm run dev      # http://localhost:4321/dynasty_website/
npm run build    # production build into dist/
```

Built with [Astro](https://astro.build). League data from the public [Sleeper API](https://docs.sleeper.com).
