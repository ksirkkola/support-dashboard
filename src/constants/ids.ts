// Workflow IDs
export const WORKFLOW_OPPORTUNITY = '6a041734fc4db70b8339a63e';
export const WORKFLOW_TRIPS_IHS = '6a211715b129621437c16b03';
export const WORKFLOW_SUPPORT_TICKETS = '6a06e492112c3668ef86bbd6';
export const WORKFLOW_TIME_TRACKING = '6a06e492112c3668ef86bbdf';

// Saved insight IDs for the dashboard
export const INSIGHT_OPPORTUNITIES = '6a425d91199ea621d7fc4eb9';
export const INSIGHT_SUPPORT_TICKETS = '6a425d9c199ea621d7fc4ed6';
export const INSIGHT_THERMDAC_VERSIONS = '6aa727cd70ee49861ac0d68c';
export const INSIGHT_THERMDAC_SETTINGS = '6aa72918fe11781c0e7e6033';
export const INSIGHT_TIME_TRACKING = '6aa79da3da23a46b38d2f0cb';

// Support Ticket fields used for the "+ Support Ticket" quick action (ThermDAC tab)
// and the "+ Trip" quick action (Support Tickets tab)
export const ST_PHASE_NEW_TICKET = '6a06e492112c3668ef86bbea';
export const ST_FIELD_COMPANY = '6a0d63719de2da901759c2ab'; // freeform textarea mirror
export const ST_FIELD_ASSET_LINK = '6a16d8cb36f4aee2608ab792'; // activitylink → Assets
export const ST_FIELD_CUSTOMER_LINK = '6a06e492112c3668ef86bbd7'; // activitylink → Customers

// TRIPS/IHS ↔ Support Tickets linkage (added back after the app fell out of sync
// with its git repo — see versionDescription history)
export const TRIPS_FIELD_SOURCE_SUPPORT_TICKET = '6aa7a8f1da23a46b38d34fe5';

// Time tracking phase colors (Reported → Invoiced → Paid)
export const TT_PHASE_COLOR: Record<string, string> = {
  Reported: 'blue',
  Invoiced: 'orange',
  Paid: 'green',
};

// Note: Trips/IHS has THREE separate insights in this workspace, each shaped for
// its own view — none of them is "the" canonical one, so don't consolidate blindly:
//   - '6a4ba677a218e0e0d33b0017' "SupportDashboard - Trips" — rich per-case fields,
//     used by TripsPanel.tsx. No arrivalDate filter (list view needs every case).
//   - '6a4b93ac98da2dba3ba0bbf2' "Dashboard - Calendar (TRIPS IHS)" — minimal fields,
//     used by CalendarPanel.tsx. Filters to arrivalDate IS NOT NULL on purpose
//     (dateless trips can't render on a calendar) — also used by Operations Dashboard.
//   - '6a425d97f150c40eb342bf59' "Dashboard - Open TRIPS IHS" — cost-breakdown fields,
//     used by Operations Dashboard's own TripsPanel, NOT by this app. Kept out of
//     this file since nothing here references it — re-add if this app ever needs it.

// Support Ticket phase display colors
export const ST_PHASE_COLOR: Record<string, string> = {
  'New Ticket': 'blue',
  'Triage': 'yellow',
  'Working with Client': 'green',
  'Software Upgrade': 'cyan',
  'Follow-Up Activities': 'purple',
  'Waiting on Billing': 'orange',
};

export const OPP_PHASE_COLOR: Record<string, string> = {
  Discovery: 'blue',
  Proposal: 'purple',
  Negotiations: 'orange',
};

export const TRIPS_PHASE_COLOR: Record<string, string> = {
  'Triage from Support Tickets': 'blue',
  'Pre-Travel Activities': 'cyan',
  'In Progress': 'green',
  'Follow-Up Activities': 'purple',
  'Waiting on PO': 'yellow',
  'Waiting on Dates': 'orange',
};
