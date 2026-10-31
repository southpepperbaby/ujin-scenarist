/** Сколько событий пришлось на каждый из последних hours часов (старые слева). */
export function hourlyBuckets(timestamps: number[], hours = 24, now = Date.now() / 1000): number[] {
  const buckets = new Array<number>(hours).fill(0)
  for (const ts of timestamps) {
    const age = Math.floor((now - ts) / 3600)
    if (age >= 0 && age < hours) buckets[hours - 1 - age] = (buckets[hours - 1 - age] ?? 0) + 1
  }
  return buckets
}
