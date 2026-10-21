import path from 'node:path'
import { fileURLToPath } from 'node:url'
const here=path.dirname(fileURLToPath(import.meta.url))
const root=path.resolve(here,'../..')
const app=process.env.TCS_HOMO_APP_BINARY || path.join(root,'target/release/tcs-mail')
export const config={
  runner:'local', specs:['./specs/**/*.e2e.mjs'], maxInstances:1,
  services:[['@wdio/tauri-service',{appBinaryPath:app,autoInstallTauriDriver:true,captureBackendLogs:true,captureFrontendLogs:true,startTimeout:45000,commandTimeout:30000}]],
  capabilities:[{browserName:'tauri','tauri:options':{application:app}}],
  logLevel:'warn', framework:'mocha', reporters:['spec'],
  waitforTimeout:12000, connectionRetryTimeout:90000, connectionRetryCount:1,
  mochaOpts:{ui:'bdd',timeout:90000},
  screenshotPath:process.env.TCS_HOMO_SCREENSHOTS || path.join(root,'homologation-output/screenshots')
}
