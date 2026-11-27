/** Seat maths shared by capacity indicators. Seats are taken by confirmed participants only. */
export function seatStats(confirmed: number, capacity: number) {
  const cap = Math.max(0, capacity), taken = Math.max(0, Math.min(confirmed, cap))
  const pct = cap === 0 ? 100 : Math.round((taken / cap) * 100)
  return { pct, left: cap - taken, full: taken >= cap }
}
