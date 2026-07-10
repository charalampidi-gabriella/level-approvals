// Edit these as the roster / level bands change.

// Rhea and Dean removed (no longer with us). Keep alphabetical.
export const COACHES = [
  "Aaron",
  "Alex",
  "Augusto",
  "Carlos",
  "Davin",
  "Eli",
  "Evan",
  "Gaby",
  "Geronimo",
  "Hemanshu",
  "James",
  "Kevin",
  "Mark",
  "Mateo",
  "Nick",
  "Nolan",
  "Oleg",
  "Tim",
  "Val",
];

// Players we emailed inviting them to be evaluated. Pre-seeded so coaches can
// click a name instead of retyping it (avoids typo-split history). A name drops
// off the pending list once a *confident* decision is logged for that player —
// see getPendingPlayers() in app/actions.ts. Edit this list as invites change.
export const PENDING_EVALUATION = [
  "Kausik Kannan",
  "Bredt Norwood",
  "Mikael Gonzales",
  "William Marshall",
  "Casey King",
  "David Burton",
  "Shane Tanner",
  "Scott Stein",
  "Oliver Yu",
  "Bob Rayburn",
  "Eddie Adair",
  "Patrick Gallagher",
  "Todd Kurio",
  "Aaron Myers",
  "Christin Evans",
  "Christy Schrader",
  "Jeremy Wright",
  "Gaby Charalampidi",
  "Andrea Martinez Swanson",
  "Matthew Giovanoni",
  "Michael DeLoach",
  "Stanley Alan Williams",
  "Tyler Warren",
  "Ningwei L",
  "Miguel Borrero",
  "Sergey Eguy",
  "Laura Mossing",
  "Abhijith Ravinutala",
  "James Han",
  "Ted Schweinfurth",
  "Zarek Merchant",
  "Laura Kostelny",
  "Bryan Porter",
  "Bowman Hall",
  "Jack Carolan",
  "Chris Long",
];

// Players carrying the elite "4.5–5.0" designation. Shown as a discreet badge
// next to their name wherever it appears in the app (feed, look-up, history).
// This is a label only — separate from the logged 4.5 approval entries.
export const LEVEL_475 = [
  "Matt Alderson",
  "Zuka Bakradze",
  "Mark Begert",
  "Nik Bhattacharya",
  "Bobby Blanchard",
  "Lucas Bombonatti",
  "James Boriack",
  "Raymond Borjas",
  "Christopher Bunker",
  "Gaby Charalampidi",
  "Johnathan Chen",
  "Kieran Cronin",
  "Raul De La Torre",
  "Alex Johns",
  "Victoria Kareh",
  "Jon Kaufman",
  "Jacques Klick",
  "Aldo Mell",
  "Dillon Meyer",
  "Mehdi Miremadi",
  "Ryan Mullins",
  "Aidan Peeples",
  "Evan Pena",
  "Mark Prettyman",
  "Charles Sylvetsky",
  "Julie Thu",
  "Colin Thurmond",
  "Christina Tollemache",
  "Ian Vaisman",
  "Zaid Vakil",
  "Robert Valashinas",
  "Bianca Vitale",
  "Tim Walsh",
  "Whitney Wofford",
  "Anastasia Zavgorodni",
];

// Ordered low -> high. Drives dropdowns and the player summary ordering.
export const LEVELS = [
  "Beginner",
  "Advanced Beginner",
  "2.0–2.5",
  "2.5–3.0",
  "3.0",
  "3.0–3.5",
  "3.5",
  "3.5–4.0",
  "4.0",
  "4.0–4.5",
  "4.5",
];

// What a coach is logging about a player. The level is baked into the type.
export const OUTCOMES = [
  "Approved for 4.0–4.5",
  "Approved for 4.5",
  "Denied for 4.0–4.5",
  "Denied for 4.5",
  "Showed up at wrong class",
] as const;

export type Outcome = (typeof OUTCOMES)[number];

// Feedback is mandatory when a coach denies or flags a wrong-class placement.
export function feedbackRequired(outcome: string) {
  return outcome.startsWith("Denied") || outcome === "Showed up at wrong class";
}

// Wrong-class entries also capture which level they attended vs. should be in.
export const WRONG_CLASS = "Showed up at wrong class";
export function isWrongClass(outcome: string) {
  return outcome === WRONG_CLASS;
}
