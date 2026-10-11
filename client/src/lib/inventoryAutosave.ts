// One request at a time; keep newer local edits while an earlier snapshot is saving.
export class InventoryAutosave<T> {
  private latest: T | null = null;
  private revision = 0;
  private savedRevision = 0;
  private active: Promise<void> | null = null;
  private failed: { payload: T; revision: number; key: string } | null = null;
  private stopped = false;
  constructor(
    public version: number,
    private send: (
      payload: T,
      version: number,
      key: string
    ) => Promise<{ version: number }>,
    private saved: (version: number, clean: boolean) => void,
    private error: (error: unknown) => void
  ) {}
  update(payload: T) {
    this.latest = payload;
    this.revision++;
  }
  get dirty() {
    return this.revision !== this.savedRevision;
  }
  get blocked() {
    return !!this.failed;
  }
  dispose() {
    this.stopped = true;
  }
  flush(retry = false): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.active) return this.active;
    if (this.failed && !retry) return Promise.resolve();
    this.active = this.drain().finally(() => {
      this.active = null;
    });
    return this.active;
  }
  private async drain() {
    while (!this.stopped && (this.failed || this.dirty)) {
      const request = this.failed || {
        payload: this.latest!,
        revision: this.revision,
        key: crypto.randomUUID(),
      };
      try {
        const result = await this.send(
          request.payload,
          this.version,
          request.key
        );
        this.version = result.version;
        this.savedRevision = request.revision;
        this.failed = null;
        if (!this.stopped) this.saved(this.version, !this.dirty);
      } catch (error) {
        this.failed = request;
        if (!this.stopped) this.error(error);
        return;
      }
    }
  }
}
