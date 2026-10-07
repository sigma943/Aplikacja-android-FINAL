/** One dispatcher shared by Android, browser history and nested application views. */
export class BackStack {
  private handlers = new Map<symbol, {priority: number; run: () => boolean}>();
  private listeners = new Set<() => void>();
  register(run: () => boolean, priority = 0) {
    const id = Symbol();
    this.handlers.set(id, {run,priority});
    this.changed();
    return () => {this.handlers.delete(id);this.changed();};
  }
  get canGoBack() { return this.handlers.size > 0; }
  subscribe(listener: () => void) {this.listeners.add(listener);return () => {this.listeners.delete(listener);};}
  private changed() {for(const listener of this.listeners)listener();}
  dispatch() {
    const handlers = [...this.handlers.values()].reverse().sort((a,b)=>b.priority-a.priority);
    for(const handler of handlers) if(handler.run()) return true;
    return false;
  }
}
export const appBackStack = new BackStack();
