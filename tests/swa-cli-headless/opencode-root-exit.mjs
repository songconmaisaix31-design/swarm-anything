import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: Object.fromEntries(['candidate','data-root','project','project-id','executable','output'].map(key => [key,{type:'string'}])),allowPositionals:false })
for (const key of ['candidate','data-root','project','executable','output']) assert.ok(values[key] && isAbsolute(values[key]))
const candidate=await realpath(values.candidate), project=await realpath(values.project)
assert.equal((await realpath(process.execPath)).toLowerCase(),join(candidate,'node/node.exe').toLowerCase())
await mkdir(values['data-root'])
process.env.SWA_DATA_DIR=await realpath(values['data-root'])
process.env.SWA_INSTALL_ROOT=candidate
const requireRuntime=createRequire(join(candidate,'runtime/package.json'))
const {inspectNativeOpenCodePolicy,openCodeBuiltinPlugins,openCodePolicyPluginId}=requireRuntime('./native-opencode-policy.cjs')
const {materializePrivateOpenCodeAccount,privateOpenCodeEnvironment}=requireRuntime('./private-opencode-account.cjs')
const {createAcpAgentConnection}=requireRuntime('./acp-agent-connection.cjs')
const {importPrivateOpenCodeCredential}=requireRuntime('./native-opencode-import.cjs')
const processAPI=requireRuntime('@vscode/windows-process-tree')
const executable=await realpath(values.executable), plugin=await realpath(join(candidate,'runtime/opencode-policy'))
const snapshot=await inspectNativeOpenCodePolicy({executable,version:'2.0.31',sourceHome:'C:/Users/DW',projectId:values['project-id'],privateRoot:join(process.env.SWA_DATA_DIR,'opencode',values['project-id'])})
const sessionId=randomUUID(),correlation=randomBytes(32).toString('hex')
const root=await materializePrivateOpenCodeAccount(snapshot,sessionId,plugin,correlation)
const env=privateOpenCodeEnvironment(root,process.env)
let importResource,importResult
try { importResult=await importPrivateOpenCodeCredential({snapshot,root,plugin,correlation,node:process.execPath,entry:join(candidate,'runtime/native-cli-entry.cjs'),executable,cwd:project,inherited:process.env,observe:resource=>{importResource=resource}}) }
finally { if(importResource){const result=await importResource.managed.close(importResource.tree);assert.equal(result.root,'exited');assert.equal(result.tree,'exited')} }
const notifications=[],updates=[]
let connection
connection=createAcpAgentConnection({command:process.execPath,args:[join(candidate,'runtime/native-cli-entry.cjs'),JSON.stringify({command:executable,args:['acp']})],cwd:project,env,envToDelete:Object.keys(process.env).filter(key=>!(key in env)),swaJobIPC:true},{onPermission:()=>({outcome:{outcome:'cancelled'}}),onRequest:()=>{throw new Error('Native tools are closed')},onExit:()=>notifications.push({exited:connection.exited,rootVerdict:connection.rootVerdict,processTreeUnproven:connection.processTreeUnproven,lastCloseResult:connection.lastCloseResult})})
connection.subscribe(event=>updates.push(event))
let initialized,session,observation,status,closed
try {
  await connection.spawned
  initialized=await connection.initialize()
  session=await connection.start({cwd:project,mcpServers:[]})
  await connection.setMode('build')
  await connection.setConfigOption('model','deepseek/deepseek-v4-pro')
  const deadline=Date.now()+20000
  while(Date.now()<deadline){
    const lines=connection.stderrTail().split(/\r?\n/).filter(line=>line.startsWith('SWA_OPENCODE_POLICY '))
    const statuses=lines.map(line=>JSON.parse(line.slice('SWA_OPENCODE_POLICY '.length)))
    assert.ok(!statuses.some(row=>row.state==='failed'||row.state==='http_request'))
    status=statuses.find(row=>row.state==='active')
    if(status)break
    await setTimeout(50)
  }
  assert.ok(status && status.correlation===correlation && status.tools_count===0)
  assert.equal(status.root.toLowerCase(),root.toLowerCase())
  assert.deepEqual(status.plugins.map(row=>row.id).sort(),[...openCodeBuiltinPlugins,openCodePolicyPluginId].sort())
  observation=connection.observeOwnedJob()
  assert.ok(observation.members.some(row=>row.pid===status.pid))
  assert.equal(observation.nativeCLI.kind,'executable')
  assert.equal(connection.exited,false);assert.equal(notifications.length,0)
  execFileSync('pwsh',['-NoProfile','-File',join(dirname(import.meta.filename),'kill-owned-root.ps1'),'-TargetProcessId',String(observation.rootPid),'-CreationTimeMs',String(observation.rootCreationTimeMs),'-Executable',process.execPath],{windowsHide:true,timeout:15000})
  const exitDeadline=Date.now()+20000
  while(!notifications.length&&Date.now()<exitDeadline)await setTimeout(50)
  assert.equal(notifications.length,1)
  assert.equal(notifications[0].exited,true);assert.equal(notifications[0].rootVerdict,'exited')
  assert.equal(notifications[0].processTreeUnproven,false)
  assert.deepEqual(notifications[0].lastCloseResult,{root:'exited',tree:'exited'})
}finally{closed=await connection.close();assert.equal(closed,true)}
assert.equal(await connection.close(),true);assert.equal(notifications.length,1)
const independent=[]
for(let index=0;index<2;index++){
  if(index)await setTimeout(75)
  const processes=await new Promise((resolve,reject)=>processAPI.getAllProcesses(rows=>rows?resolve(rows):reject(new Error('Fresh process identities unavailable')),4))
  const rows=observation.members.map(expected=>({expected,observed:processes.find(row=>row.pid===expected.pid)??null}))
  assert.ok(rows.every(row=>row.observed===null||row.observed.creationTimeMs!==undefined&&row.observed.creationTimeMs!==row.expected.creationTimeMs))
  independent.push(rows)
}
const database=new DatabaseSync(env.OPENCODE_DB,{readOnly:true})
let nativeSession,nativeMessages
try{database.exec('PRAGMA query_only=ON');nativeSession=database.prepare('SELECT id,agent,model,directory FROM session_v2 WHERE id=?').get(session.sessionId);nativeMessages=database.prepare('SELECT id,type,data,seq,time_created FROM session_message WHERE session_id=? ORDER BY seq').all(session.sessionId)}finally{database.close()}
assert.equal(nativeSession.agent,'build');assert.deepEqual(JSON.parse(nativeSession.model),{id:'deepseek-v4-pro',providerID:'deepseek'})
assert.deepEqual(nativeMessages.map(row=>row.type),['agent-switched','model-switched'])
const {correlation:_nonce,...actualStatus}=status
const result={candidate,source_revision:(await readFile(join(candidate,'VERSION'),'utf8')).trim(),scope:'actual_native_ACP_root_exit_with_owned_private_server',orca_dispatch_created:false,private_root:root,initialized,session_id:session.sessionId,native_session:nativeSession,native_messages:nativeMessages,actual_policy:actualStatus,job:observation,notifications,independent_exit_observations:independent,closed,import_result:importResult,actual_updates:updates,model_calls:0,unknown_to_known_close:'NOT_RUN_no_actual_unverifiable_close_observed'}
const text=JSON.stringify(result,null,2)+'\n'
if(text.includes(snapshot.key))throw new Error('Native source result contained credential material')
await writeFile(values.output,text,{flag:'wx'})
console.log(JSON.stringify({output:values.output,actual_root_exit:true,exit_notifications:notifications.length,closed,model_calls:0}))
