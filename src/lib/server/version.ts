import pkg from '../../../package.json';

/** The version reported by `GET /healthz`. */
export const version: string = pkg.version;
