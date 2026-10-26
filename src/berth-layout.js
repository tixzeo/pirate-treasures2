// Keep the entire hull alongside the pier. If land blocks the berth, extend the
// pier by whole model segments rather than sliding the ship beyond its end.
export function planBerth({ length, shipLength, pitch, blocked = () => false }) {
  const margin = .5;
  length = Math.max(length, Math.ceil((shipLength + 2 * margin) / pitch) * pitch);
  let along = length / 2;
  for (let i=0;blocked(along);i++) {
    if(i>=400)throw new Error('No clear berth within 200m of the pier');
    along += .5;
  }
  length = Math.max(length, Math.ceil((along + shipLength/2 + margin) / pitch) * pitch);
  return { along, length, segments: Math.round(length/pitch) };
}
