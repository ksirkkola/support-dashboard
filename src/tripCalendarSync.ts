import { HailerApi } from '@hailer/app-sdk';

// ✈️ Field Service Trips calendar — created for this sync specifically.
const CALENDAR_ID = '6aa14f4001361eeab85408f1';
// "Dashboard - Calendar (TRIPS IHS)" — already exposes arrivalDate + daysOnsite.
const INSIGHT_TRIPS_CALENDAR = '6a4b93ac98da2dba3ba0bbf2';
// Marks events this sync owns, so re-running only ever touches its own events
// — never anything manually added to the same calendar.
const SYNC_MARKER = '[trip-sync]';

interface TripCalRow {
  id: string;
  name: string;
  phase: string;
  arrivalDate: number | null; // seconds
  daysOnsite: number | null;
  company: string | null;
  ticketCode: string | null;
  serviceType: string | null;
  assignedTraveler: string | null;
}

function parseInsight(data: { headers: string[]; rows: unknown[][] }): Record<string, unknown>[] {
  return data.rows.map((row) => {
    const r: Record<string, unknown> = {};
    data.headers.forEach((h, i) => { r[h] = row[i]; });
    return r;
  });
}

// Most of the Hailer API is RPC-only, reachable over plain HTTP as
// POST /api/<operator with '.' replaced by '/'>, body = JSON array of args
// (see docs.hailer.com/api — "Under the hood: the HTTP path"). Calendar
// create/update/remove/load_events have no app-sdk module, so this is the
// only way to drive them from inside an app. hailer.http.fetch proxies the
// request through the parent frame, which attaches the session cookie
// automatically — no manual auth header needed.
async function callRpc(hailer: HailerApi, operator: string, args: unknown[]): Promise<any> {
  const res = await hailer.http.fetch(`https://api.hailer.com/api/${operator.split('.').join('/')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`${operator} failed (${res.status}): ${res.body}`);
  }
  try { return JSON.parse(res.body); } catch { return res.body; }
}

export interface TripSyncResult {
  created: number;
  removed: number;
  skipped: { name: string; reason: string }[];
}

// Full wipe-and-rebuild: removes every event this sync previously created on
// the Field Service Trips calendar, then recreates one per open trip that has
// both an Arrival Date and Days Onsite set. Closed trips are skipped — they've
// already happened and aren't useful on a forward-looking calendar.
export async function syncTripsToCalendar(hailer: HailerApi): Promise<TripSyncResult> {
  const now = Date.now();
  const windowStart = now - 365 * 86400000;
  const windowEnd = now + 3 * 365 * 86400000;

  const existing = await callRpc(hailer, 'calendar.load_events', [{
    calendars: [CALENDAR_ID], start: windowStart, end: windowEnd,
  }]);
  const toRemove = (Array.isArray(existing) ? existing : [])
    .filter((e: any) => typeof e?.notes === 'string' && e.notes.includes(SYNC_MARKER));
  let removed = 0;
  for (const ev of toRemove) {
    await callRpc(hailer, 'calendar.remove_event', [ev._id]);
    removed++;
  }

  const data = await hailer.insight.data(INSIGHT_TRIPS_CALENDAR, { update: true });
  const rows = parseInsight(data) as unknown as TripCalRow[];

  let created = 0;
  const skipped: { name: string; reason: string }[] = [];

  for (const t of rows) {
    if (t.phase.trim() === 'Closed') continue;
    if (!t.arrivalDate) { skipped.push({ name: t.name, reason: 'No Arrival Date set' }); continue; }
    if (!t.daysOnsite) { skipped.push({ name: t.name, reason: 'No Days Onsite set' }); continue; }

    const start = t.arrivalDate * 1000;
    // Hailer's calendar displays both the start AND end date as occupied days
    // (not the iCal-standard exclusive end) — so a 5-day trip needs end =
    // start + 4 days to display as exactly 5 days, not 6.
    const end = start + Math.max(0, t.daysOnsite - 1) * 86400000;
    const attendees: Record<string, boolean> = {};
    if (t.assignedTraveler) attendees[t.assignedTraveler] = true;

    await callRpc(hailer, 'calendar.create_event', [{
      calendar_id: CALENDAR_ID,
      title: `${t.name} (${t.company || 'Unknown'}, ${t.daysOnsite} day${t.daysOnsite === 1 ? '' : 's'} onsite)`,
      start,
      end,
      allDay: true,
      notes: `${SYNC_MARKER} tripId:${t.id}`,
      attendees,
    }]);
    created++;
  }

  return { created, removed, skipped };
}
