/**
 * The first-run language card's record that this device has chosen (PRD A01).
 *
 * Its own module because both sides read it: Home on the server, to decide whether the card
 * is part of the first paint, and the card on the device, to write it. A constant exported
 * from a "use client" file reaches a server component as a client reference, not a string.
 */
export const LANGUAGE_CHOSEN_COOKIE = "mandhira-language-chosen";
