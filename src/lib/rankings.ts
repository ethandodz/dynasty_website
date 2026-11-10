// Power rankings live as plain text files in the /rankings folder at the top of the repo.
// File name: <season>-week-<week>.md   e.g. rankings/2026-week-5.md
// Contents: paste straight from your notes. Each team starts with "1.", "2.", ...
//
//   1. BangUpBobby (4-1). Puka is balling...
//   2. Marsolo (4-1). Another 4 game win streak...
//
// Arrows (⬆️9️⃣ / ⬇️3️⃣ / 🟰) and records are optional. The site works out the
// movement and pulls each team's record from Sleeper itself.
import { TEAM_ALIASES } from '../config';
import { getSeasons, type Season, type Team } from './sleeper';
import { recordThroughWeek, recordStr } from './stats';

export interface RankingEntry {
  rank: number;
  /** Name exactly as written. */
  name: string;
  team: Team | null;
  /** Record written in the note, if any. Sleeper's record is preferred. */
  writtenRecord: string | null;
  record: string | null;
  pf: number | null;
  /** Positive = moved up since the previous ranking. null = no previous ranking. */
  change: number | null;
  paragraphs: string[];
}

export interface Ranking {
  slug: string;
  season: string;
  week: number;
  title: string;
  intro: string[];
  entries: RankingEntry[];
}

const files = import.meta.glob('/rankings/*.{md,txt}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

// Arrow and keycap emoji people use for movement: ⬆️ ⬇️ 🟰 🔼 🔽 ➡️ 9️⃣ 🔟 etc.
const MOVEMENT = /(?:[0-9#*]️?⃣|[⬆⬇⬅➡↔↕\u{1F51F}\u{1F7F0}\u{1F53C}\u{1F53D}\u{1F51D}↑↓→]️?|️)/gu;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '')
    .replace(/^(team|the|los|las|el)/, '');
}

function matchTeam(name: string, teams: Team[], manager: string | null): Team | null {
  const n = normalize(name);
  const alias = Object.entries(TEAM_ALIASES).find(([k]) => normalize(k) === n);
  if (alias) {
    const t = teams.find((t) => t.username.toLowerCase() === alias[1].toLowerCase());
    if (t) return t;
  }
  const candidates = (t: Team) => [t.teamName, t.username, t.manager].filter(Boolean).map(normalize).filter((c) => c.length > 0);
  // 1) exact match on team name, username or manager first name
  let hit = teams.find((t) => candidates(t).includes(n));
  if (hit) return hit;
  // 2) one contains the other ("Conejos malos" vs "Los Conejos Malos")
  if (n.length >= 4) {
    const loose = teams.filter((t) => candidates(t).some((c) => c.length >= 4 && (c.includes(n) || n.includes(c))));
    if (loose.length === 1) return loose[0];
  }
  // 3) manager name written in brackets, e.g. "Team Lorc [Lorcan]"
  if (manager) {
    const m = normalize(manager);
    hit = teams.find((t) => t.manager && normalize(t.manager) === m);
    if (hit) return hit;
  }
  return null;
}

interface ParsedEntry {
  rank: number;
  name: string;
  manager: string | null;
  writtenRecord: string | null;
  lines: string[];
}

export function parseRankingText(raw: string) {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const entries: ParsedEntry[] = [];
  const pre: string[] = [];
  let title: string | null = null;
  let current: ParsedEntry | null = null;
  let done = false; // set when a rank number repeats (e.g. a summary list at the bottom)

  // skip a frontmatter block if someone adds one
  if (lines[0]?.trim() === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) lines.splice(0, end + 1);
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const m = line.match(/^#*\s*(\d{1,2})\s*[.)]\s+(.+)$/);
    if (m) {
      const rank = Number(m[1]);
      if (entries.some((e) => e.rank === rank)) done = true;
      if (done) continue;
      current = parseHeader(rank, m[2]);
      entries.push(current);
      continue;
    }
    if (done) continue;
    if (!current) {
      if (!line) {
        pre.push('');
        continue;
      }
      const heading = line.replace(/^#+\s*/, '');
      if (/power\s*rank/i.test(heading)) {
        if (/week|preseason|playoff|final|offseason/i.test(heading) || !title) title = heading;
      } else pre.push(heading);
      continue;
    }
    current.lines.push(line);
  }

  return { title, intro: toParagraphs(pre), entries };
}

function parseHeader(rank: number, header: string): ParsedEntry {
  const manager = header.match(/\[([^\]]+)\]/)?.[1]?.trim() ?? null;
  const recMatch = header.match(/\(\s*(\d{1,2}\s*-\s*\d{1,2}(?:\s*-\s*\d{1,2})?)\s*\)/);
  const writtenRecord = recMatch ? recMatch[1].replace(/\s/g, '') : null;

  // The name is everything before the first "[", "(" or movement emoji.
  const cleaned = header.replace(MOVEMENT, '\u0000');
  let cut = cleaned.search(/[\[(\u0000]|\s=\s|\s[-–—]\s|:\s/);
  // "Team Name. Write-up..." with no record or emoji
  if (cut < 0 && cleaned.length > 40) cut = cleaned.search(/\.\s/);
  let name = (cut >= 0 ? cleaned.slice(0, cut) : cleaned).replace(/\u0000/g, '').trim();
  let rest = '';

  if (recMatch) {
    rest = header.slice(header.indexOf(recMatch[0]) + recMatch[0].length);
  } else if (cut >= 0) {
    // "Team Name ⬆️2️⃣ Write-up" or "Team Name - Write-up"
    rest = cleaned.slice(cut).replace(/\[[^\]]*\]/, '').replace(/\u0000/g, '');
  }
  rest = rest.replace(/^[\s.:\-–—=]+/, '').trim();
  name = name.replace(/[.,:;\-–—]+$/, '').trim();

  return { rank, name, manager, writtenRecord, lines: rest ? [rest] : [] };
}

function toParagraphs(lines: string[]): string[] {
  const out: string[] = [];
  let buf: string[] = [];
  for (const l of lines) {
    if (!l.trim()) {
      if (buf.length) out.push(buf.join(' '));
      buf = [];
    } else buf.push(l.trim());
  }
  if (buf.length) out.push(buf.join(' '));
  return out;
}

function parseFileName(file: string) {
  const base = file.split('/').pop()!.replace(/\.(md|txt)$/, '');
  const season = base.match(/(\d{4})/)?.[1] ?? null;
  const week = base.match(/(?:week|wk|w)[-_ ]?(\d{1,2})/i)?.[1] ?? null;
  return { base, season, week: week ? Number(week) : null };
}

let rankingsPromise: Promise<Ranking[]> | null = null;

/** All power rankings, newest first. */
export function getRankings(): Promise<Ranking[]> {
  rankingsPromise ??= (async () => {
    const seasons = await getSeasons();
    const list: Ranking[] = [];

    for (const [file, raw] of Object.entries(files)) {
      const parsed = parseRankingText(raw);
      const fromName = parseFileName(file);
      const week = fromName.week ?? Number(parsed.title?.match(/week\s*(\d+)/i)?.[1] ?? 0);
      const seasonStr = fromName.season ?? seasons[0].season;
      const season: Season | undefined = seasons.find((s) => s.season === seasonStr);

      const entries: RankingEntry[] = parsed.entries.map((e) => {
        const team = season ? matchTeam(e.name, season.teams, e.manager) : null;
        if (!team) console.warn(`[rankings] ${file}: couldn't match "${e.name}" to a Sleeper team. Add it to TEAM_ALIASES in src/config.ts.`);
        let record: string | null = e.writtenRecord;
        let pf: number | null = null;
        if (team && season && week && week <= season.lastScoredWeek) {
          const r = recordThroughWeek(season, team.rosterId, week);
          record = recordStr(r.wins, r.losses, r.ties);
          pf = r.pf;
        }
        return { rank: e.rank, name: e.name, team, writtenRecord: e.writtenRecord, record, pf, change: null, paragraphs: toParagraphs(e.lines) };
      });
      entries.sort((a, b) => a.rank - b.rank);

      list.push({
        slug: fromName.base,
        season: seasonStr,
        week,
        title: week ? `Week ${week} Power Rankings` : parsed.title ?? 'Power Rankings',
        intro: parsed.intro,
        entries,
      });
    }

    list.sort((a, b) => Number(b.season) - Number(a.season) || b.week - a.week);

    // Movement vs the previous ranking in the same season.
    for (let i = 0; i < list.length; i++) {
      const cur = list[i];
      const prev = list.slice(i + 1).find((r) => r.season === cur.season);
      if (!prev) continue;
      for (const e of cur.entries) {
        const before = e.team && prev.entries.find((p) => p.team?.ownerId === e.team!.ownerId);
        if (before) e.change = before.rank - e.rank;
      }
    }
    return list;
  })();
  return rankingsPromise;
}
