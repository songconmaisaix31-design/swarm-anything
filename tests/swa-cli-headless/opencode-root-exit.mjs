import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { publicFiles, publicRevision } from '../swa-product-acceptance/public-case-definition.mjs'

let phase='preflight'
let failedClose, failedDatabaseClose, originalRoot, observedModelRequests=0
const safeCode=error=>error instanceof Error&&/^(?:native_opencode|private_opencode)_[a-z0-9_]+$/.test(error.message)?error.message:'native_opencode_root_exit_check_failed'
async function main(){
process.umask(0o077)
assert.equal(process.umask(),0o077)
const { values } = parseArgs({ options: Object.fromEntries(['candidate','data-root','project','project-id','executable','output','source-home','source-repository'].map(key => [key,{type:'string'}])),allowPositionals:false })
assert.equal(process.platform,'win32');assert.equal(process.arch,'x64')
for (const key of ['candidate','data-root','project','executable','output','source-home','source-repository']) assert.ok(values[key] && isAbsolute(values[key]))
assert.match(values['project-id'],/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i)
const candidate=await realpath(values.candidate), project=await realpath(values.project)
assert.equal((await realpath(process.execPath)).toLowerCase(),join(candidate,'node/node.exe').toLowerCase())
assert.equal(process.env.NODE_PATH,join(candidate,'runtime/node_modules'));assert.equal(process.env.NODE_OPTIONS,undefined)
const revision=(await readFile(join(candidate,'VERSION'),'utf8')).trim(),repository=await realpath(values['source-repository'])
assert.match(revision,/^[a-f0-9]{40}$/)
const sourceGit=args=>execFileSync('git',['-C',repository,...args],{windowsHide:true,timeout:30000,maxBuffer:8*1024*1024})
assert.equal(sourceGit(['rev-parse','--verify',`${revision}^{commit}`]).toString('ascii').trim(),revision)
assert.equal(fileURLToPath(import.meta.url).toLowerCase(),join(repository,'tests/swa-cli-headless/opencode-root-exit.mjs').toLowerCase())
const killScript='tests/swa-cli-headless/kill-owned-root.ps1'
for(const name of ['tests/swa-cli-headless/opencode-root-exit.mjs',killScript,'tests/swa-product-acceptance/public-case-definition.mjs','tests/swa-product-acceptance/prepare-source-observer.mjs','tests/swa-product-acceptance/extract-observer-source.py','tests/swa-product-acceptance/opencode-initialization-entry.ts'])assert.ok((await readFile(join(repository,name))).equals(sourceGit(['show',`${revision}:${name}`])))
const git=args=>execFileSync('git',['-c','core.fsmonitor=false','-c','core.hooksPath='+join(dirname(project),'empty-hooks'),'-C',project,...args],{windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:1024*1024})
assert.equal(git(['rev-parse','HEAD']).trim(),publicRevision)
assert.deepEqual(git(['ls-tree','--name-only',publicRevision]).trim().split(/\r?\n/).sort(),[...publicFiles].sort())
for(const name of publicFiles)assert.equal(await readFile(join(project,name),'utf8'),git(['show',`${publicRevision}:${name}`]))
const clientRoot=values.output+'.initialization-client'
execFileSync(process.execPath,[join(repository,'tests/swa-product-acceptance/prepare-source-observer.mjs'),'--candidate',candidate,'--source-repository',repository,'--output',clientRoot,'--profile','opencode-initialize-only'],{windowsHide:true,timeout:120000,maxBuffer:8192,env:{...process.env,NODE_OPTIONS:undefined}})
const clientManifest=JSON.parse(await readFile(join(clientRoot,'manifest.json'),'utf8'))
assert.equal(clientManifest.installed_revision,revision);assert.equal(clientManifest.profile,'opencode-initialize-only')
const verifyClient=async()=>{
  for(const source of [...clientManifest.inputs,...clientManifest.dynamic_dependencies,...clientManifest.installed_external_entries,clientManifest.process_host_package,clientManifest.observer]){
    const path=await realpath(source.path),part=relative(clientRoot,path),installedPart=relative(join(candidate,'runtime'),path)
    assert.ok((!part.startsWith('..')&&!isAbsolute(part))||(!installedPart.startsWith('..')&&!isAbsolute(installedPart)))
    const before=await lstat(path,{bigint:true}),version=info=>`${info.dev}:${info.ino}:${info.birthtimeNs}:${info.mtimeNs}:${info.size}`
    assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.size<=8n*1024n*1024n)
    assert.equal(version(before),source.version)
    assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'),source.sha256)
    assert.equal(version(await lstat(path,{bigint:true})),source.version)
  }
}
await verifyClient()
const clientRequire=createRequire(clientManifest.observer.path)
const securityEntry=await realpath(clientRequire.resolve('@orca/windows-security'))
const securityRoot=await realpath(join(candidate,'runtime/node_modules/@orca/windows-security'))
assert.ok(!relative(securityRoot,securityEntry).startsWith('..')&&!isAbsolute(relative(securityRoot,securityEntry)))
const ptyEntry=await realpath(clientRequire.resolve('node-pty/lib/utils')),ptyRoot=await realpath(join(candidate,'runtime/node_modules/node-pty'))
assert.ok(!relative(ptyRoot,ptyEntry).startsWith('..')&&!isAbsolute(relative(ptyRoot,ptyEntry)))
const processEntry=await realpath(clientRequire.resolve('@vscode/windows-process-tree')),processRoot=await realpath(join(candidate,'runtime/node_modules/@vscode/windows-process-tree'))
assert.ok(!relative(processRoot,processEntry).startsWith('..')&&!isAbsolute(relative(processRoot,processEntry)))
await mkdir(values['data-root'])
process.env.SWA_DATA_DIR=await realpath(values['data-root'])
process.env.SWA_INSTALL_ROOT=candidate
process.env.SWA_OPENCODE_API_KEY_HOME=await realpath(values['source-home'])
const requireRuntime=createRequire(join(candidate,'runtime/package.json'))
const {inspectNativeOpenCodePolicy,openCodePlugins,openCodePolicyPluginId,materializePrivateOpenCodeAccount,privateOpenCodeEnvironment,importPrivateOpenCodeCredential,assertNativeOpenCodeCurrent,readOpenCodeCredential}=clientRequire(clientManifest.observer.path)
const {createAcpAgentConnection}=requireRuntime('./acp-agent-connection.cjs')
const {z}=requireRuntime('zod')
const processAPI=requireRuntime('@vscode/windows-process-tree')
const executable=await realpath(values.executable), plugin=await realpath(join(candidate,'runtime/opencode-policy'))
const snapshot=await inspectNativeOpenCodePolicy({executable,version:'2.0.31',sourceHome:process.env.SWA_OPENCODE_API_KEY_HOME,projectId:values['project-id'],privateRoot:join(process.env.SWA_DATA_DIR,'opencode',values['project-id']),env:process.env,protectedRoots:[candidate,repository,project,process.env.SWA_DATA_DIR]})
assert.equal(snapshot.policy.account.kind,'opencode-native-stepfun-api-key')
const sessionId=randomUUID(),correlation=randomBytes(32).toString('hex')
const root=await materializePrivateOpenCodeAccount(snapshot,sessionId,plugin,correlation)
originalRoot=root
const env=privateOpenCodeEnvironment(root,process.env)
let importResource,importResult
phase='import-original-credential'
importResult=await importPrivateOpenCodeCredential({snapshot,root,plugin,correlation,node:process.execPath,entry:join(candidate,'runtime/native-cli-entry.cjs'),executable,cwd:project,inherited:process.env,observe:resource=>{importResource=resource}})
assert.ok(importResource&&importResource.tree.readFinalObservation())
const notifications=[],updates=[]
const common={type:z.literal('swa_opencode_policy'),correlation:z.string(),pid:z.number().int().positive(),root:z.string(),sequence:z.number().int().positive()}
const statusSchema=z.discriminatedUnion('state',[z.strictObject({...common,state:z.literal('active'),tools_count:z.literal(0),directory:z.string(),roots:z.record(z.string(),z.string()),plugins:z.array(z.strictObject({id:z.string(),state:z.literal('active')}))}),z.strictObject({...common,state:z.literal('inactive')})])
let connection,policyError,policySequence=0,otherStderrLines=0
let rejectPolicy
const policyFailure=new Promise((_,reject)=>{rejectPolicy=reject});void policyFailure.catch(()=>undefined)
const policyStep=promise=>Promise.race([promise,policyFailure])
const statuses=[]
connection=createAcpAgentConnection({command:process.execPath,args:[join(candidate,'runtime/native-cli-entry.cjs'),JSON.stringify({command:executable,args:['acp']})],cwd:project,env,envToDelete:Object.keys(process.env).filter(key=>!(key in env)),swaJobIPC:true},{onPermission:()=>({outcome:{outcome:'cancelled'}}),onRequest:()=>{throw new Error('Native tools are closed')},stderrLineMaxChars:32768,onStderrLine(line,cut){
  if(!line.startsWith('SWA_OPENCODE_POLICY ')){otherStderrLines++;return true}
  try{assert.equal(cut,false);const parsed=JSON.parse(line.slice('SWA_OPENCODE_POLICY '.length));if(parsed?.state==='http_request')observedModelRequests++;const row=statusSchema.parse(parsed);assert.equal(row.sequence,++policySequence);assert.equal(row.correlation,correlation);assert.equal(row.root.toLowerCase(),root.toLowerCase());assert.ok(statuses.length<16);statuses.push(row)}catch{policyError??=new Error('native_opencode_policy_status_invalid');rejectPolicy(policyError)}
  return true
},onExit:()=>notifications.push({exited:connection.exited,rootVerdict:connection.rootVerdict,processTreeUnproven:connection.processTreeUnproven,lastCloseResult:connection.lastCloseResult})})
connection.subscribe(event=>updates.push(event))
let initialized,session,observation,status,closed,primary,closeError
try {
  phase='initialize-session'
  await policyStep(connection.spawned)
  initialized=await policyStep(connection.initialize())
  session=await policyStep(connection.start({cwd:project,mcpServers:[]}))
  await policyStep(connection.setMode('build'))
  await policyStep(connection.setConfigOption('model','stepfun/step-3.5-flash'))
  const deadline=Date.now()+20000
  while(Date.now()<deadline){
    if(policyError)throw policyError
    status=statuses.find(row=>row.state==='active')
    if(status)break
    await setTimeout(50)
  }
  assert.ok(status && status.correlation===correlation && status.tools_count===0)
  assert.equal(status.root.toLowerCase(),root.toLowerCase())
  assert.deepEqual(status.plugins.map(row=>row.id).sort(),[...openCodePlugins('stepfun'),openCodePolicyPluginId].sort())
  assert.equal(status.directory.toLowerCase(),project.toLowerCase())
  assert.deepEqual(status.roots,{home:env.HOME,data:env.XDG_DATA_HOME,cache:env.XDG_CACHE_HOME,config:env.XDG_CONFIG_HOME,state:env.XDG_STATE_HOME,programdata:env.ProgramData,temp:env.TEMP,database:env.OPENCODE_DB})
  observation=connection.observeOwnedJob()
  assert.ok(observation.members.some(row=>row.pid===status.pid))
  assert.equal(observation.nativeCLI.kind,'executable')
  assert.equal(connection.exited,false);assert.equal(notifications.length,0)
  phase='actual-root-exit'
  assert.ok((await readFile(join(repository,killScript))).equals(sourceGit(['show',`${revision}:${killScript}`])))
  execFileSync('pwsh',['-NoProfile','-File',join(repository,killScript),'-TargetProcessId',String(observation.rootPid),'-CreationTimeMs',String(observation.rootCreationTimeMs),'-Executable',process.execPath],{windowsHide:true,timeout:15000})
  const exitDeadline=Date.now()+20000
  while(!notifications.length&&Date.now()<exitDeadline)await setTimeout(50)
  assert.equal(notifications.length,1)
  assert.equal(notifications[0].exited,true);assert.equal(notifications[0].rootVerdict,'exited')
  assert.equal(notifications[0].processTreeUnproven,false)
  assert.deepEqual(notifications[0].lastCloseResult,{root:'exited',tree:'exited'})
}catch(error){primary=error}finally{try{closed=await connection.close();assert.equal(closed,true)}catch{closeError=new Error('native_opencode_root_exit_close_unknown');failedClose=safeCode(closeError)}}
if(primary)throw primary
if(closeError)throw closeError
assert.equal(await connection.close(),true);assert.equal(notifications.length,1)
if(policyError)throw policyError
const independent=[]
phase='independent-original-job-exit'
for(let index=0;index<2;index++){
  if(index)await setTimeout(75)
  const processes=await new Promise((resolve,reject)=>processAPI.getAllProcesses(rows=>rows?resolve(rows):reject(new Error('Fresh process identities unavailable')),4))
  const rows=observation.members.map(expected=>({expected,observed:processes.find(row=>row.pid===expected.pid)??null}))
  assert.ok(rows.every(row=>row.observed===null||row.observed.creationTimeMs!==undefined&&row.observed.creationTimeMs!==row.expected.creationTimeMs))
  independent.push(rows)
}
const credential=readOpenCodeCredential(env.OPENCODE_DB,'stepfun')
assert.equal(credential.count,1);assert.equal(credential.id,snapshot.policy.account.credential_id);assert.ok(credential.key===snapshot.key,'native_opencode_credential_changed')
const database=new DatabaseSync(env.OPENCODE_DB,{readOnly:true,allowExtension:false})
let nativeSession,nativeMessages,databaseError
try{database.exec('PRAGMA query_only=ON');nativeSession=database.prepare('SELECT id,agent,model,directory FROM session_v2 WHERE id=?').get(session.sessionId);nativeMessages=database.prepare('SELECT id,type,data,seq,time_created FROM session_message WHERE session_id=? ORDER BY seq').all(session.sessionId)}catch(error){databaseError=error}finally{try{database.close()}catch{failedDatabaseClose='native_opencode_database_close_failed'}}
if(databaseError)throw databaseError
if(failedDatabaseClose)throw new Error(failedDatabaseClose)
assert.equal(nativeSession.agent,'build');assert.deepEqual(JSON.parse(nativeSession.model),{id:'step-3.5-flash',providerID:'stepfun'})
assert.deepEqual(nativeMessages.map(row=>row.type),['agent-switched','model-switched'])
const {correlation:_nonce,...actualStatus}=status
assertNativeOpenCodeCurrent(snapshot)
await verifyClient()
const result={candidate,source_revision:revision,scope:'actual_native_ACP_root_exit_with_owned_private_server',initialization_source:'fixed_git_source_and_declared_dependencies_single_bundle',orca_dispatch_created:false,private_root:root,initialized,session_id:session.sessionId,native_session:nativeSession,native_messages:nativeMessages,actual_policy:actualStatus,other_stderr_line_count:otherStderrLines,job:observation,notifications,independent_exit_observations:independent,closed,import_result:importResult,actual_updates:updates,prompt_calls:0,observed_model_requests:observedModelRequests,unknown_to_known_close:'NOT_RUN_no_actual_unverifiable_close_observed'}
const text=JSON.stringify(result,null,2)+'\n'
if(text.includes(snapshot.key))throw new Error('Native source result contained credential material')
await writeFile(values.output,text,{flag:'wx'})
console.log(JSON.stringify({output:values.output,actual_root_exit:true,exit_notifications:notifications.length,closed,model_calls:0}))
}
void main().catch(error=>{console.log(JSON.stringify({status:'FAIL_PRESERVE_ORIGINAL_ROOT',phase,code:safeCode(error),close_error:failedClose??null,database_close_error:failedDatabaseClose??null,private_root:originalRoot??null,model_input_sent:false,observed_model_requests:observedModelRequests}));process.exitCode=1})
