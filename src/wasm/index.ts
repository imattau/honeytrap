export interface WasmModule {
  init(): Promise<void>;
  isReady(): boolean;
}

export class WasmBridge implements WasmModule {
  private ready = false;

  async init(): Promise<void> {
    // Placeholder for future WASM init.
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }
}
