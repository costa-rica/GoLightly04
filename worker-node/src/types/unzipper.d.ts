declare module "unzipper" {
  import type { Transform } from "node:stream";

  export interface ParseOptions {
    forceStream?: boolean;
  }

  export interface Entry extends Transform {
    path: string;
    type: string;
    autodrain(): void;
  }

  export function Parse(options?: ParseOptions): Transform;
}
