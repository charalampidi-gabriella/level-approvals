// Edit these as the roster / level bands change.

// Rhea and Dean removed (no longer with us). Keep alphabetical.
export const COACHES = [
  "Aaron",
  "Alex",
  "Augusto",
  "Carlos",
  "Chelsea",
  "Chris Mc",
  "Davin",
  "Eli",
  "Evan",
  "Evie",
  "Geronimo",
  "Hemanshu",
  "James",
  "Jason",
  "Jorge",
  "Kent",
  "Kevin",
  "Kolton",
  "Mark",
  "Mateo",
  "Natalie",
  "Nick",
  "Nolan",
  "Oleg",
  "Shawn",
  "Tim",
  "Tom",
  "Val",
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
