// Weekly matchup recaps live in the /recaps folder at the top of the repo.
// File name: <season>-week-<week>.md   e.g. recaps/2026-week-3.md
//
// Optional intro paragraph(s) at the top, then one section per matchup:
//
//   ## dodz vs muebe5 | Headline goes here
//   The article...
//
// The two names can be usernames, team names or first names (same matching as power rankings).
// The scoreboard and top performers are filled in from Sleeper automatically.
import { getSeasons, type Game, type Season, type Team } from './sleeper';
import { matchTeam, toParagraphs } from './rankings';

export interface Recap {
  game: Game;
  winner: Team;
  loser: Team;
  headline: string;
  paragraphs: string[];
  anchor: string;
}

export interface RecapWeek {
  slug: string;
  season: Season;
  week: number;
  intro: string[];
  recaps: Recap[];
}

const files = import.meta.glob('/recaps/*.{md,txt}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

let promise: Promise<RecapWeek[]> | null = null;

/** All recap weeks, newest first. */
export function getRecapWeeks(): Promise<RecapWeek[]> {
  promise ??= (async () => {
    const seasons = await getSeasons();
    const weeks: RecapWeek[] = [];
    for (const [file, raw] of Object.entries(files)) {
      const base = file.split('/').pop()!.replace(/\.(md|txt)$/, '');
      const seasonStr = base.match(/(\d{4})/)?.[1];
      const week = Number(base.match(/week[-_ ]?(\d{1,2})/i)?.[1] ?? 0);
      const season = seasons.find((s) => s.season === seasonStr);
      if (!season || !week) {
        console.warn(`[recaps] ${file}: name it like 2026-week-3.md`);
        continue;
      }
      const intro: string[] = [];
      const recaps: Recap[] = [];
      let cur: { head: string; lines: string[] } | null = null;
      const flush = () => {
        if (!cur) return;
        const m = cur.head.match(/^(.+?)\s+(?:vs\.?|v\.?|def\.?|over)\s+(.+?)(?:\s*[|:]\s*(.+))?$/i);
        const a = m && matchTeam(m[1], season.teams, null);
        const b = m && matchTeam(m[2], season.teams, null);
        const game = a && b && season.games.find((g) => g.week === week && [g.a.rosterId, g.b.rosterId].sort().join() === [a.rosterId, b.rosterId].sort().join());
        if (!game || !a || !b) {
          console.warn(`[recaps] ${file}: couldn't find the week ${week} game for "${cur.head}"`);
        } else {
          const aWon = (game.a.rosterId === a.rosterId ? game.a.points : game.b.points) >= (game.a.rosterId === b.rosterId ? game.a.points : game.b.points);
          const [winner, loser] = aWon ? [a, b] : [b, a];
          recaps.push({ game, winner, loser, headline: m![3]?.trim() ?? `${winner.teamName} beat ${loser.teamName}`, paragraphs: toParagraphs(cur.lines), anchor: `${winner.slug}-${loser.slug}` });
        }
        cur = null;
      };
      for (const line of raw.replace(/\r\n?/g, '\n').split('\n')) {
        const h = line.match(/^##\s+(.+)$/);
        if (h) {
          flush();
          cur = { head: h[1].trim(), lines: [] };
        } else if (cur) cur.lines.push(line);
        else if (!/^#\s/.test(line)) intro.push(line);
      }
      flush();
      // biggest games first: closest to the top of the standings? keep file order
      weeks.push({ slug: base, season, week, intro: toParagraphs(intro), recaps });
    }
    return weeks.sort((x, y) => Number(y.season.season) - Number(x.season.season) || y.week - x.week);
  })();
  return promise;
}

/** Recap for a given game, if one was written. */
export async function findRecap(season: string, week: number, rosterId: number) {
  const w = (await getRecapWeeks()).find((x) => x.season.season === season && x.week === week);
  const r = w?.recaps.find((r) => r.game.a.rosterId === rosterId || r.game.b.rosterId === rosterId);
  return w && r ? { week: w, recap: r } : null;
}
