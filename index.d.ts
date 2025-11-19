declare module 'obcachejs' {
  export interface CacheOptions {
    max?: number;
    maxSize?: number;
    maxAge?: number;
    dispose?: (key: string, value: any) => void;
    queueEnabled?: boolean;
    reset?: {
      interval: number;
      firstReset?: number | Date;
    };
    redis?: {
      host?: string;
      port?: number;
      url?: string;
      database?: number;
      twemproxy?: boolean;
      connectTimeout?: number;
    };
    id?: number;
  }

  export interface CacheStats {
    hit: number;
    miss: number;
    reset: number;
    pending: number;
  }

  export interface CachedFunction<T extends (...args: any[]) => any> {
    (...args: Parameters<T>): ReturnType<T>;
    cacheName: string;
  }

  export interface Cache {
    stats: CacheStats;
    wrap<T extends (...args: any[]) => any>(
      fn: T,
      thisobj?: any,
      skipArgs?: number[]
    ): CachedFunction<T> & ((...args: any[]) => Promise<any>);
    warmup(fn: CachedFunction<any>, ...args: any[]): void;
    invalidate(fn: CachedFunction<any>, ...args: any[]): void;
    isReady(): boolean;
  }

  export function Create(options?: CacheOptions): Cache;

  export class CacheError extends Error {}

  export const debug: {
    register(cache: Cache, name: string): void;
    view(req: any, res: any, next: () => void): void;
    log(callback: (err: any, data: any) => void): void;
  };
}
