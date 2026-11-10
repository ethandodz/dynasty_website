// ─────────────────────────────────────────────────────────────
//  League settings. This is the only file you should need to edit.
// ─────────────────────────────────────────────────────────────

export const LEAGUE_NAME = 'Ball Knowers';

/**
 * The CURRENT season's Sleeper league ID (the number in the URL on sleeper.com).
 * Sleeper makes a new league ID every season when the league renews.
 * When that happens, paste the new ID here. Older seasons are found
 * automatically, so all-time history keeps working.
 */
export const LEAGUE_ID = '1390038557707476992';

/**
 * Real first names for each manager, keyed by their Sleeper username.
 * Shown next to team names. Leave a name blank to just show the username.
 */
export const MANAGERS: Record<string, string> = {
  WoahItsKyle: 'Kyle',
  lorc: 'Lorcan',
  bradleyweik: '',
  Squallie: 'Walter',
  Merc16: 'Logan',
  Flxsh98: 'Maurice',
  iTzWilberto: 'Wilberto',
  dodz: 'Ethan',
  beniquez: 'Garry',
  BangUpBobby: 'Brian',
  marsolo: 'Marshall',
  juebelacker: 'Justin',
  carbyy: 'David',
  rtuebe: 'Ryan',
  TheBastardInTheNorth: 'Jaime',
  muebe5: 'Mark',
};

/**
 * Extra nicknames for matching power-ranking entries to teams. The site already
 * matches team names, usernames and first names loosely (it ignores spaces,
 * capitals and a leading "Team"), so you only need this if a name doesn't match.
 * Format: 'nickname you write': 'sleeper username'
 */
export const TEAM_ALIASES: Record<string, string> = {
  Bobby: 'BangUpBobby',
  Merc: 'Merc16',
};
