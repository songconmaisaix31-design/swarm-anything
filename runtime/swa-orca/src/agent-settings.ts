import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'
import { JSONParser } from '@streamparser/json'
import { z } from 'zod'
import { getDefaultPersistedState } from '../../../third_party/orca-v1.4.230/src/shared/constants'
import type { GlobalSettings } from '../../../third_party/orca-v1.4.230/src/shared/global-settings-types'
import { projectAgentLaunchSettings, type AgentLaunchSettings } from '../../../third_party/orca-v1.4.230/src/shared/agent-launch-settings'
import { profileStateDatabaseFile } from '../../../third_party/orca-v1.4.230/src/shared/profile-state-storage-paths'
import { classifyProfileStateStorage } from '../../../third_party/orca-v1.4.230/src/main/persistence/profile-state/profile-state-storage-classification'
import { openProfileStateDatabaseReadOnly } from '../../../third_party/orca-v1.4.230/src/main/persistence/profile-state/profile-state-database'
import { readProfileStateDomainsWithRevisionFromDatabase } from '../../../third_party/orca-v1.4.230/src/main/persistence/profile-state/profile-state-domain-reader'
import { readProfileStateJsonAcceptance } from '../../../third_party/orca-v1.4.230/src/main/persistence/profile-state/legacy-json/profile-state-json-acceptance'
import { withProfileStateReadSnapshot } from '../../../third_party/orca-v1.4.230/src/main/persistence/profile-state/profile-state-read-snapshot'
import type { AgentSelection } from './contracts'

export type AgentSettingsSnapshot = {
  settings: Partial<GlobalSettings>
  launch: AgentLaunchSettings
  source: AgentSelection['settings_source']
  revision: number
  version: string
  home: string
}

const launchSourceSchema = z.looseObject({
  disabledTuiAgents: z.array(z.string()).optional(),
  agentCmdOverrides: z.record(z.string(), z.string()).optional(),
  agentDefaultArgs: z.record(z.string(), z.string()).optional(),
  agentDefaultEnv: z.record(z.string(), z.record(z.string(), z.string())).optional()
})

function settingsSnapshot(value: unknown, source: AgentSettingsSnapshot['source'], revision: number, version: string, home: string): AgentSettingsSnapshot {
  const settings = launchSourceSchema.parse(value) as Partial<GlobalSettings>
  return { settings, launch: projectAgentLaunchSettings(settings), source, revision, version, home }
}

// 只保留 settings；其余 JSON 域经过成熟流解析器后立即丢弃。
async function readLegacySettings(file: string) {
  const before = await stat(file, { bigint: true })
  const parser = new JSONParser({ paths: ['$.settings'], keepStack: false })
  const digest = createHash('sha256')
  let settings: unknown
  let matches = 0
  parser.onValue = ({ value }) => { settings = value; matches++ }
  for await (const chunk of createReadStream(file)) {
    digest.update(chunk)
    parser.write(chunk)
  }
  if (!parser.isEnded) parser.end()
  const after = await stat(file, { bigint: true })
  if (before.dev !== after.dev || before.ino !== after.ino || before.mtimeNs !== after.mtimeNs || before.size !== after.size) throw new Error('The explicit Agent settings source changed during reading')
  if (matches !== 1) throw new Error('The explicit Agent profile must contain one settings object')
  return { settings: z.record(z.string(), z.unknown()).parse(settings) as Partial<GlobalSettings>, hash: digest.digest('hex'), version: `${after.dev}:${after.ino}:${after.mtimeNs}:${after.size}` }
}

export async function readAgentSettings(): Promise<AgentSettingsSnapshot> {
  const home = process.env.SWA_DISCOVERY_HOME
  if (!home || !isAbsolute(home)) throw new Error('The original local Agent discovery home must be explicit')
  const profile = process.env.SWA_AGENT_PROFILE
  if (!profile) return settingsSnapshot(getDefaultPersistedState(home).settings, { kind: 'native' }, 0, 'orca-1.4.230-native-defaults', home)
  if (!isAbsolute(profile)) throw new Error('The explicit read-only Orca profile must be absolute')
  const directory = await realpath(profile)
  if (!(await stat(directory)).isDirectory()) throw new Error('The explicit read-only Orca profile must exist')
  const dataFile = join(directory, 'orca-data.json'), databaseFile = profileStateDatabaseFile(directory)
  const classification = classifyProfileStateStorage(dataFile, databaseFile)
  if (classification === 'neither') throw new Error('The explicit Orca profile has no settings authority')
  const legacy = classification === 'json-only' || classification === 'both' ? await readLegacySettings(dataFile) : undefined
  if (classification === 'json-only') return settingsSnapshot(legacy!.settings, { kind: 'orca-profile', path: directory }, 0, legacy!.version, home)
  const opened = openProfileStateDatabaseReadOnly(databaseFile, basename(directory))
  try {
    return withProfileStateReadSnapshot(opened.db, () => {
      const result = readProfileStateDomainsWithRevisionFromDatabase(opened.db, ['settings'])
      if (result.kind === 'unreadable') throw result.error
      if (!result.values.has('settings')) throw new Error('The explicit Orca profile settings domain is missing')
      if (legacy) {
        const marker = readProfileStateJsonAcceptance(opened.db)
        if (!marker || marker.jsonHash !== legacy.hash && marker.pending?.jsonHash !== legacy.hash || result.revision < (marker.pending?.acceptedRevision ?? marker.acceptedRevision)) throw new Error('The explicit Orca profile legacy JSON does not match its native acceptance marker')
      }
      return settingsSnapshot(result.values.get('settings'), { kind: 'orca-profile', path: directory, revision: result.revision }, result.revision, `sqlite:${result.revision}`, home)
    })
  } finally {
    opened.db.close()
  }
}
