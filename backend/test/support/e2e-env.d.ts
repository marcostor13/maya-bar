/** Tipos de `e2e-env.js` (CommonJS, lo cargan también global-setup y Playwright). */
export declare const ADMIN: { email: string; password: string };
export declare function isolateEnv(overrides?: Record<string, string>): void;
export declare function assertLocalMongo(uri: string): void;
export declare function startMongo(): Promise<unknown>;
