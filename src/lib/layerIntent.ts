/** Only the latest user intent may publish an asynchronous layer result. */
export class LayerIntentTracker {
  private readonly generations = new Map<string, number>();

  begin(id: string): number {
    const generation = (this.generations.get(id) ?? 0) + 1;
    this.generations.set(id, generation);
    return generation;
  }

  isCurrent(id: string, generation: number): boolean {
    return this.generations.get(id) === generation;
  }
}
