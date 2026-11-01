import path from 'path';

// Resolve @shared relative to this file so it works from src/ (dev), dist/<service>/src/ (build) and the Docker image alike
// eslint-disable-next-line @typescript-eslint/no-var-requires
const moduleAlias: { addAlias(alias: string, target: string): void } = require('module-alias');
moduleAlias.addAlias('@shared', path.join(__dirname, '../../shared/src'));
