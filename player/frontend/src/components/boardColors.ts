// Shared board colors.
//
// ROOM_SHADE is the fill for a player-shaded cell on any board whose grid is divided
// into rooms by thick black borders (LITS, Nuritwin, Nurimaze, Heyawake, Norinori, ...).
// A near-black fill like #333 swallows those borders wherever two shaded cells meet
// across a room boundary, so the room layout disappears exactly where the player needs
// it. A medium gray keeps the shade obvious while the black borders still read through.
// Every room-bordered board must use this rather than its own dark fill; matches
// BoardColors.ROOM_SHADE on Android.
export const ROOM_SHADE = "#9e9e9e";

// Text drawn on top of a ROOM_SHADE cell (e.g. a clue in a shaded cell). Black keeps
// strong contrast on the medium gray; white, which suited the old dark fill, does not.
export const ON_ROOM_SHADE_TEXT = "black";
