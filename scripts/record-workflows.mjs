import {spawn} from 'node:child_process';
const child=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test','tests/e2e/workspaces.spec.ts','--timeout=120000'],{stdio:'inherit',env:{...process.env,RECORD_WORKFLOWS:'1'}});
child.on('exit',code=>process.exitCode=code??1);
