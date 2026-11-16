# How to write the weekly matchup recaps

This guide is for whoever writes `recaps/<season>-week-<n>.md`, including the automated
Tuesday run. The recaps are separate from the commish's power rankings, which he writes himself.

## Steps

1. `python3 scripts/recap_facts.py --status` shows the last week that's final.
   `python3 scripts/recap_facts.py <week>` prints the fact sheet for that week.
2. Read the fact sheet, the commish's latest power rankings in `rankings/` (for the vibe going in),
   and the previous two weeks of `recaps/` (so running jokes and storylines carry on).
3. Write `recaps/<season>-week-<week>.md`: a 2–3 sentence intro for the week, then one section
   per matchup, biggest storyline first:

   ```
   ## winnerUsername vs loserUsername | Headline With Some Personality
   Article...
   ```

   Use the Sleeper usernames exactly as the fact sheet prints them in the `##` line.
4. Run `npm run build`. Every matchup must render (8 per regular-season week). The build
   prints a `[recaps]` warning if a heading doesn't match a game.
5. Fact-check before publishing (see below), then commit, open a PR and merge it.

## What each recap covers (about 150–250 words)

- **What happened:** the score, who won, and how close it was.
- **Who went off and who flopped:** name players and their points.
- **Lineup decisions:** points left on the bench, the wrong QB started, zeroes and empty slots
  in the lineup, and whether the optimal lineup would have won.
- **Vibe going in:** records, streaks and the commish's latest power-ranking take on each team.
- **Playoff implications:** record and league position afterward, division lead, distance from
  the playoff line, and how many weeks are left.
- **Anything else noteworthy:** season records (the fact sheet flags anything set this week),
  rematches, trades, and the highest or lowest score of the week.

## Voice

Write like a league mate in the group chat, in the style of the commish's power rankings.
Be funny and roast bad lineup decisions and collapses, but keep it friendly and never mean
about anything off the field. Use plain sentences, not robot-speak or sportscaster clichés.

- Call managers by first name (see `MANAGERS` in `src/config.ts`). For someone with no first
  name on file, use their username.
- Don't write as the commish. He's `dodz` / Ethan. Write about him in the third person and
  roast him like everyone else ("the commish").
- No em dashes. Use periods, commas, colons or parentheses.

## Accuracy rules (important)

- Every number has to come from the fact sheet. Never estimate.
- Before claiming "best", "most", "lowest", "first time" or "Nth straight", check it against
  the fact sheet's week-wide lists, season records and results strings, or against earlier recaps.
- Don't invent real-world news (injuries, suspensions, trades in the NFL, quotes). If a starter
  scored 0, say so without guessing why, unless the commish's rankings say why.
- Rank wording: "the third-best score of the week" means third out of 16 scores.
  "Third-lowest" means 14th of 16.
- Double-check the winner and loser, records and league positions against the `After:` lines.

## Playoffs (week 15 onward)

The fact sheet flags playoff weeks. Cover the bracket games as the main event, and keep
consolation games short and funny. When the title game is final, write the champion's recap
like it's going in the trophy room.
