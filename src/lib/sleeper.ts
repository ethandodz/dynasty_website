// Loads everything the site needs from the public Sleeper API at build time.
// Docs: https://docs.sleeper.com
import fs from 'node:fs/promises';
import path from 'node:path';
import { LEAGUE_ID, MANAGERS } from '../config';

const API = 'https://api.sleeper.app/v1';
const CACHE_DIR = path.resolve('.cache/sleeper');
// Local dev reuses responses for a while so pages load fast. CI builds start clean.
const CACHE_MINUTES = 30;

async function get<T>(url: string, cacheMinutes = CACHE_MINUTES): Promise<T> {
  const file = path.join(CACHE_DIR, url.replace(API, '').replace(/[^a-z0-9]+/gi, '_') + '.json');
  try {
    const stat = await fs.stat(file);
    if (Date.now() - stat.mtimeMs < cacheMinutes * 60_000) {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    }
  } catch {}

  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      const data = await res.json();
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.writeFile(file, JSON.stringify(data));
      return data as T;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw lastError;
}

// ── Types ────────────────────────────────────────────────────

export interface Team {
  rosterId: number;
  ownerId: string;
  username: string;
  teamName: string;
  manager: string;
  avatar: string | null;
  division: number | null;
  slug: string;
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  pa: number;
  players: string[];
  streak: string | null;
}

export interface GameSide {
  rosterId: number;
  points: number;
}

export interface Game {
  season: string;
  week: number;
  kind: 'regular' | 'playoff' | 'consolation';
  a: GameSide;
  b: GameSide;
}

export interface DraftPick {
  pickNo: number;
  round: number;
  slot: number;
  rosterId: number;
  playerId: string;
  name: string;
  position: string;
  nflTeam: string;
}

export interface Draft {
  id: string;
  season: string;
  type: string;
  rounds: number;
  isStartup: boolean;
  picks: DraftPick[];
}

export interface TradedPickRef {
  season: string;
  round: number;
  originalRosterId: number;
}

export interface TradeSide {
  rosterId: number;
  players: string[];
  picks: TradedPickRef[];
  faab: number;
}

export interface Trade {
  id: string;
  season: string;
  week: number;
  created: number;
  sides: TradeSide[];
}

export interface Season {
  season: string;
  leagueId: string;
  name: string;
  status: string;
  teams: Team[];
  divisions: Record<number, string>;
  games: Game[];
  /** Last week whose games are final. */
  lastScoredWeek: number;
  playoffWeekStart: number;
  playoffTeams: number;
  drafts: Draft[];
  trades: Trade[];
  champion: number | null;
  runnerUp: number | null;
  thirdPlace: number | null;
}

export interface Player {
  name: string;
  position: string;
  team: string;
}

// ── Raw API shapes (only the fields we use) ──────────────────

interface RawLeague {
  league_id: string;
  name: string;
  season: string;
  status: string;
  previous_league_id: string | null;
  settings: Record<string, number>;
  metadata: Record<string, string> | null;
}
interface RawUser {
  user_id: string;
  display_name: string;
  avatar: string | null;
  metadata?: { team_name?: string; avatar?: string };
}
interface RawRoster {
  roster_id: number;
  owner_id: string | null;
  players: string[] | null;
  metadata?: { streak?: string } | null;
  settings: Record<string, number>;
}
interface RawMatchup {
  roster_id: number;
  matchup_id: number | null;
  points: number;
}
interface RawBracket {
  r: number;
  m: number;
  t1: number | null;
  t2: number | null;
  w: number | null;
  l: number | null;
  p?: number;
}
interface RawTransaction {
  transaction_id: string;
  type: string;
  status: string;
  created: number;
  leg: number;
  roster_ids: number[];
  adds: Record<string, number> | null;
  draft_picks: { season: string; round: number; roster_id: number; owner_id: number; previous_owner_id: number }[];
  waiver_budget: { sender: number; receiver: number; amount: number }[];
}
interface RawDraft {
  draft_id: string;
  season: string;
  type: string;
  status: string;
  settings: { rounds: number };
  start_time: number | null;
}
interface RawPick {
  pick_no: number;
  round: number;
  draft_slot: number;
  roster_id: number;
  player_id: string;
  metadata: { first_name: string; last_name: string; position: string; team: string };
}

// ── Helpers ──────────────────────────────────────────────────

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const num = (whole?: number, dec?: number) => (whole ?? 0) + (dec ?? 0) / 100;

function avatarUrl(user?: RawUser): string | null {
  if (!user) return null;
  if (user.metadata?.avatar) return user.metadata.avatar;
  if (user.avatar) return `https://sleepercdn.com/avatars/thumbs/${user.avatar}`;
  return null;
}

// ── Loading one season ───────────────────────────────────────

async function loadSeason(league: RawLeague, isCurrent: boolean): Promise<Season> {
  const id = league.league_id;
  const [users, rosters, winners, drafts] = await Promise.all([
    get<RawUser[]>(`${API}/league/${id}/users`),
    get<RawRoster[]>(`${API}/league/${id}/rosters`),
    get<RawBracket[] | null>(`${API}/league/${id}/winners_bracket`).catch(() => null),
    get<RawDraft[]>(`${API}/league/${id}/drafts`).catch(() => [] as RawDraft[]),
  ]);

  const s = league.settings;
  const usersById = new Map(users.map((u) => [u.user_id, u]));
  const playoffWeekStart = s.playoff_week_start || 15;
  // Finished seasons are cached much longer: their data never changes.
  const done = league.status === 'complete';
  const lastScoredWeek = done ? playoffWeekStart + 3 : s.last_scored_leg ?? 0;

  const teams: Team[] = rosters.map((r) => {
    const user = r.owner_id ? usersById.get(r.owner_id) : undefined;
    const username = user?.display_name ?? `Team ${r.roster_id}`;
    const teamName = user?.metadata?.team_name?.trim() || `Team ${username}`;
    return {
      rosterId: r.roster_id,
      ownerId: r.owner_id ?? `roster-${r.roster_id}`,
      username,
      teamName,
      manager: MANAGERS[username] ?? '',
      avatar: avatarUrl(user),
      division: r.settings.division ?? null,
      slug: slugify(username),
      wins: r.settings.wins ?? 0,
      losses: r.settings.losses ?? 0,
      ties: r.settings.ties ?? 0,
      pf: num(r.settings.fpts, r.settings.fpts_decimal),
      pa: num(r.settings.fpts_against, r.settings.fpts_against_decimal),
      players: r.players ?? [],
      streak: r.metadata?.streak ?? null,
    };
  });

  const divisions: Record<number, string> = {};
  for (let d = 1; d <= (s.divisions ?? 0); d++) {
    divisions[d] = league.metadata?.[`division_${d}`] ?? `Division ${d}`;
  }

  // Which rosters are in the winners bracket in each playoff round.
  const bracketTeamsByWeek = new Map<number, Set<number>>();
  for (const b of winners ?? []) {
    const week = playoffWeekStart + b.r - 1;
    const set = bracketTeamsByWeek.get(week) ?? new Set();
    if (b.t1) set.add(b.t1);
    if (b.t2) set.add(b.t2);
    bracketTeamsByWeek.set(week, set);
  }

  const weeks = Array.from({ length: lastScoredWeek }, (_, i) => i + 1);
  const matchupWeeks = await Promise.all(
    weeks.map((w) => get<RawMatchup[]>(`${API}/league/${id}/matchups/${w}`, done ? 60 * 24 * 30 : CACHE_MINUTES).catch(() => []))
  );
  const games: Game[] = [];
  matchupWeeks.forEach((rows, i) => {
    const week = i + 1;
    const byMatchup = new Map<number, RawMatchup[]>();
    for (const row of rows ?? []) {
      if (row.matchup_id == null) continue;
      const list = byMatchup.get(row.matchup_id) ?? [];
      list.push(row);
      byMatchup.set(row.matchup_id, list);
    }
    for (const pair of byMatchup.values()) {
      if (pair.length !== 2) continue;
      const [x, y] = pair;
      if (!x.points && !y.points) continue;
      let kind: Game['kind'] = 'regular';
      if (week >= playoffWeekStart) {
        const inBracket = bracketTeamsByWeek.get(week);
        kind = inBracket?.has(x.roster_id) && inBracket?.has(y.roster_id) ? 'playoff' : 'consolation';
      }
      games.push({
        season: league.season,
        week,
        kind,
        a: { rosterId: x.roster_id, points: x.points },
        b: { rosterId: y.roster_id, points: y.points },
      });
    }
  });

  // Champion / runner-up / third from the winners bracket.
  const final = winners?.find((b) => b.p === 1);
  const third = winners?.find((b) => b.p === 3);

  // Drafts
  const draftList: Draft[] = [];
  const sortedDrafts = [...drafts].sort((a, b) => (a.start_time ?? 0) - (b.start_time ?? 0));
  for (const d of sortedDrafts) {
    if (d.status !== 'complete') continue;
    const picks = await get<RawPick[]>(`${API}/draft/${d.draft_id}/picks`, 60 * 24);
    draftList.push({
      id: d.draft_id,
      season: d.season,
      type: d.type,
      rounds: d.settings.rounds,
      isStartup: d.settings.rounds > 6,
      picks: picks
        .map((p) => ({
          pickNo: p.pick_no,
          round: p.round,
          slot: p.draft_slot,
          rosterId: p.roster_id,
          playerId: p.player_id,
          name: `${p.metadata.first_name} ${p.metadata.last_name}`.trim(),
          position: p.metadata.position,
          nflTeam: p.metadata.team || 'FA',
        }))
        .sort((a, b) => a.pickNo - b.pickNo),
    });
  }

  // Trades (week 0 covers the offseason)
  const txWeeks = Array.from({ length: Math.max(lastScoredWeek + 1, 1) + 1 }, (_, i) => i);
  const txLists = await Promise.all(
    txWeeks.map((w) => get<RawTransaction[]>(`${API}/league/${id}/transactions/${w}`, done ? 60 * 24 * 30 : CACHE_MINUTES).catch(() => []))
  );
  const seen = new Set<string>();
  const trades: Trade[] = [];
  for (const t of txLists.flat()) {
    if (!t || t.type !== 'trade' || t.status !== 'complete' || seen.has(t.transaction_id)) continue;
    seen.add(t.transaction_id);
    const sides: TradeSide[] = t.roster_ids.map((rid) => ({
      rosterId: rid,
      players: Object.entries(t.adds ?? {})
        .filter(([, to]) => to === rid)
        .map(([pid]) => pid),
      picks: (t.draft_picks ?? [])
        .filter((p) => p.owner_id === rid)
        .map((p) => ({ season: p.season, round: p.round, originalRosterId: p.roster_id })),
      faab: (t.waiver_budget ?? []).filter((w) => w.receiver === rid).reduce((sum, w) => sum + w.amount, 0),
    }));
    trades.push({ id: t.transaction_id, season: league.season, week: t.leg, created: t.created, sides });
  }
  trades.sort((a, b) => b.created - a.created);

  return {
    season: league.season,
    leagueId: id,
    name: league.name,
    status: league.status,
    teams,
    divisions,
    games,
    lastScoredWeek: isCurrent || !done ? lastScoredWeek : Math.max(0, ...games.map((g) => g.week)),
    playoffWeekStart,
    playoffTeams: s.playoff_teams ?? 0,
    drafts: draftList,
    trades,
    champion: final?.w ?? null,
    runnerUp: final?.l ?? null,
    thirdPlace: third?.w ?? null,
  };
}

// ── Public API ───────────────────────────────────────────────

let seasonsPromise: Promise<Season[]> | null = null;

/** All seasons, newest first, following Sleeper's previous_league_id chain. */
export function getSeasons(): Promise<Season[]> {
  seasonsPromise ??= (async () => {
    const leagues: RawLeague[] = [];
    let id: string | null = LEAGUE_ID;
    while (id && id !== '0' && leagues.length < 30) {
      const league: RawLeague = await get<RawLeague>(`${API}/league/${id}`);
      leagues.push(league);
      id = league.previous_league_id;
    }
    return Promise.all(leagues.map((l, i) => loadSeason(l, i === 0)));
  })();
  return seasonsPromise;
}

export async function getCurrentSeason(): Promise<Season> {
  return (await getSeasons())[0];
}

let playersPromise: Promise<Record<string, Player>> | null = null;

/** NFL player names, used to label trades and rosters. */
export function getPlayers(): Promise<Record<string, Player>> {
  playersPromise ??= (async () => {
    const raw = await get<Record<string, { full_name?: string; first_name?: string; last_name?: string; position?: string; team?: string | null }>>(
      `${API}/players/nfl`,
      60 * 24
    );
    const out: Record<string, Player> = {};
    for (const [id, p] of Object.entries(raw)) {
      out[id] = {
        name: p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || id,
        position: p.position ?? '',
        team: p.team ?? 'FA',
      };
    }
    return out;
  })();
  return playersPromise;
}
