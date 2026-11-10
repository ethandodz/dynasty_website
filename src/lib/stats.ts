import type { Game, Season, Team } from './sleeper';

export const fmt = (n: number, digits = 2) => n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function recordStr(w: number, l: number, t = 0) {
  return t ? `${w}-${l}-${t}` : `${w}-${l}`;
}

export function teamByRoster(season: Season, rosterId: number): Team | undefined {
  return season.teams.find((t) => t.rosterId === rosterId);
}

/** Regular-season standings: wins, then points for. */
export function standings(season: Season, teams = season.teams): Team[] {
  return [...teams].sort((a, b) => b.wins + b.ties / 2 - (a.wins + a.ties / 2) || b.pf - a.pf);
}

export interface WeeklyRecord {
  wins: number;
  losses: number;
  ties: number;
  pf: number;
}

/** A team's regular-season record through a given week. */
export function recordThroughWeek(season: Season, rosterId: number, week: number): WeeklyRecord {
  const r: WeeklyRecord = { wins: 0, losses: 0, ties: 0, pf: 0 };
  for (const g of season.games) {
    if (g.kind !== 'regular' || g.week > week) continue;
    const me = g.a.rosterId === rosterId ? g.a : g.b.rosterId === rosterId ? g.b : null;
    if (!me) continue;
    const opp = me === g.a ? g.b : g.a;
    r.pf += me.points;
    if (me.points > opp.points) r.wins++;
    else if (me.points < opp.points) r.losses++;
    else r.ties++;
  }
  return r;
}

export interface TeamGame {
  game: Game;
  week: number;
  kind: Game['kind'];
  points: number;
  oppPoints: number;
  oppRosterId: number;
  result: 'W' | 'L' | 'T';
}

export function teamGames(season: Season, rosterId: number): TeamGame[] {
  const out: TeamGame[] = [];
  for (const g of season.games) {
    const me = g.a.rosterId === rosterId ? g.a : g.b.rosterId === rosterId ? g.b : null;
    if (!me) continue;
    const opp = me === g.a ? g.b : g.a;
    out.push({
      game: g,
      week: g.week,
      kind: g.kind,
      points: me.points,
      oppPoints: opp.points,
      oppRosterId: opp.rosterId,
      result: me.points > opp.points ? 'W' : me.points < opp.points ? 'L' : 'T',
    });
  }
  return out.sort((a, b) => a.week - b.week);
}

/** One row per team score, across every season, for record-book style lists. */
export interface Score {
  season: string;
  week: number;
  kind: Game['kind'];
  ownerId: string;
  rosterId: number;
  points: number;
  oppOwnerId: string;
  oppPoints: number;
}

export function allScores(seasons: Season[]): Score[] {
  const out: Score[] = [];
  for (const s of seasons) {
    const owner = (rid: number) => teamByRoster(s, rid)?.ownerId ?? '';
    for (const g of s.games) {
      if (g.kind === 'consolation') continue;
      out.push({ season: s.season, week: g.week, kind: g.kind, ownerId: owner(g.a.rosterId), rosterId: g.a.rosterId, points: g.a.points, oppOwnerId: owner(g.b.rosterId), oppPoints: g.b.points });
      out.push({ season: s.season, week: g.week, kind: g.kind, ownerId: owner(g.b.rosterId), rosterId: g.b.rosterId, points: g.b.points, oppOwnerId: owner(g.a.rosterId), oppPoints: g.a.points });
    }
  }
  return out;
}

/** Head-to-head record keyed by `${ownerA}|${ownerB}` (regular season + playoffs). */
export function headToHead(seasons: Season[]) {
  const map = new Map<string, { wins: number; losses: number; ties: number; pf: number; pa: number }>();
  for (const sc of allScores(seasons)) {
    const key = `${sc.ownerId}|${sc.oppOwnerId}`;
    const r = map.get(key) ?? { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 };
    if (sc.points > sc.oppPoints) r.wins++;
    else if (sc.points < sc.oppPoints) r.losses++;
    else r.ties++;
    r.pf += sc.points;
    r.pa += sc.oppPoints;
    map.set(key, r);
  }
  return map;
}

export interface Manager {
  ownerId: string;
  /** Most recent team info for this manager. */
  team: Team;
  seasons: number;
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  pa: number;
  playoffWins: number;
  playoffLosses: number;
  titles: string[];
  finals: string[];
}

/** All-time regular-season totals for every manager, keyed by Sleeper user id. */
export function managers(seasons: Season[]): Manager[] {
  const map = new Map<string, Manager>();
  // seasons are newest first, so the first team we see is the current one
  for (const s of seasons) {
    for (const t of s.teams) {
      const m = map.get(t.ownerId) ?? {
        ownerId: t.ownerId,
        team: t,
        seasons: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        pf: 0,
        pa: 0,
        playoffWins: 0,
        playoffLosses: 0,
        titles: [],
        finals: [],
      };
      m.seasons++;
      m.wins += t.wins;
      m.losses += t.losses;
      m.ties += t.ties;
      m.pf += t.pf;
      m.pa += t.pa;
      if (s.champion === t.rosterId) m.titles.push(s.season);
      if (s.champion === t.rosterId || s.runnerUp === t.rosterId) m.finals.push(s.season);
      for (const g of teamGames(s, t.rosterId)) {
        if (g.kind !== 'playoff') continue;
        if (g.result === 'W') m.playoffWins++;
        else if (g.result === 'L') m.playoffLosses++;
      }
      map.set(t.ownerId, m);
    }
  }
  return [...map.values()].sort((a, b) => b.titles.length - a.titles.length || b.wins - a.wins || b.pf - a.pf);
}

const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 >= 11 && n % 100 <= 13 ? 0 : n % 10] ?? 'th'}`;

/** "2029 3rd (Throwsa Parks)" */
export function pickLabel(season: Season, pick: { season: string; round: number; originalRosterId: number }) {
  const original = teamByRoster(season, pick.originalRosterId);
  return `${pick.season} ${ordinal(pick.round)}${original ? ` (${original.teamName})` : ''}`;
}

export { ordinal };
