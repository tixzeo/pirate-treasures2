// The schooner's last minutes, as numbers the world, the victory story and the tests share.
export const BOSS_REWARD = 500;
export const SINK_SECONDS = 9;  // last hit to last bubble
export const VICTORY_AT = .55;  // the hull is under water: the victory story need not wait for the masts

export const advanceSinking = (s, dt) => Math.min(1, s + dt / SINK_SECONDS);
export const crossed = (before, after, mark) => before < mark && after >= mark;

