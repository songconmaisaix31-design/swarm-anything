import {
  isLegacyAgentSessionAccountHome,
  type OpenCodeAgentSessionAccountHome
} from '../../shared/agent-session-account-home'
import {
  getManagedDataAccountService,
  type ManagedDataAccountService
} from '../managed-data-accounts/service'
import type { AcpAccountBinding } from '../acp/acp-account-binding'
import { isAbsolute, join } from 'node:path'

type AccountReader = Pick<
  ManagedDataAccountService,
  'list' | 'restoreOriginalEnvironment' | 'environmentForAccount'
>

function restoredEnvironment(
  environment: NodeJS.ProcessEnv,
  managedAccounts: Pick<AccountReader, 'restoreOriginalEnvironment'>
): Record<string, string | undefined> {
  const copy = { ...environment }
  managedAccounts.restoreOriginalEnvironment(copy)
  delete copy.ORCA_DATA_ACCOUNT_PROVIDER
  delete copy.ORCA_DATA_ACCOUNT_DATA_HOME
  delete copy.ORCA_DATA_ACCOUNT_STATE_HOME
  delete copy.ORCA_DATA_ACCOUNT_ORIGINAL_ENV
  return copy
}

function definedEnvironment(
  environment: Record<string, string | undefined>
): Record<string, string> {
  const defined: Record<string, string> = {}
  for (const [key, value] of Object.entries(environment)) {
    if (value !== undefined) {
      defined[key] = value
    }
  }
  return defined
}

/** Resolve the current selection on the execution host when creating a chat. */
export function resolveStructuredOpenCodeAccountHome(input: {
  managedAccounts: AccountReader
}): OpenCodeAgentSessionAccountHome {
  const selected = input.managedAccounts.list('opencode').activeAccountId
  if (selected) {
    input.managedAccounts.environmentForAccount('opencode', selected)
    return { kind: 'opencode', locator: { kind: 'managed', managedProfileId: selected } }
  }
  return { kind: 'opencode', locator: { kind: 'unmanaged' } }
}

/** Resolve a saved binding against the current host, then apply it after inherited overlays. */
export function environmentForStructuredOpenCodeAccountHome(
  binding: OpenCodeAgentSessionAccountHome,
  input: {
    managedAccounts: Pick<AccountReader, 'environmentForAccount' | 'restoreOriginalEnvironment'>
    baseEnvironment: NodeJS.ProcessEnv
  }
): Record<string, string> {
  if (binding.locator.kind === 'private') return privateStructuredOpenCodeEnvironment(binding.locator.root, definedEnvironment(input.baseEnvironment))
  const environment = restoredEnvironment(input.baseEnvironment, input.managedAccounts)
  const locator = binding.locator
  // Unmanaged: the user's own environment reaches OpenCode as-is.
  if (locator.kind === 'unmanaged') {
    return definedEnvironment(environment)
  }
  delete environment.XDG_DATA_HOME
  delete environment.XDG_STATE_HOME
  delete environment.OPENCODE_DB
  delete environment.OPENCODE_AUTH_CONTENT
  return {
    ...definedEnvironment(environment),
    ...input.managedAccounts.environmentForAccount('opencode', locator.managedProfileId)
  }
}

export function privateStructuredOpenCodeEnvironment(root: string, inherited: Readonly<Record<string, string>>) {
  if (!isAbsolute(root)) throw new Error('OpenCode private account root must be absolute')
  const allowed = new Set(['SYSTEMROOT', 'WINDIR', 'SYSTEMDRIVE', 'COMSPEC', 'PATHEXT', 'PATH', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER', 'OS', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'COLORTERM', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY'])
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(inherited)) {
    const name = key.toUpperCase()
    if (!allowed.has(name)) continue
    if (env[name] !== undefined && env[name] !== value) throw new Error('native_environment_case_collision')
    env[name] = value
  }
  return Object.assign(env, {
    HOME: join(root, 'home'), USERPROFILE: join(root, 'home'), XDG_DATA_HOME: join(root, 'data'), XDG_CACHE_HOME: join(root, 'cache'),
    XDG_CONFIG_HOME: join(root, 'config'), XDG_STATE_HOME: join(root, 'state'), OPENCODE_CONFIG_DIR: join(root, 'config/opencode'),
    OPENCODE_DB: join(root, 'data/opencode/opencode.db'), ProgramData: join(root, 'programdata'), APPDATA: join(root, 'appdata'),
    LOCALAPPDATA: join(root, 'localappdata'), TEMP: join(root, 'temp'), TMP: join(root, 'temp'), TMPDIR: join(root, 'temp'),
    OPENCODE_CONFIG_PROJECT_DISABLE: '1', OPENCODE_DISABLE_CLAUDE_CODE: '1', OPENCODE_DISABLE_MODELS_FETCH: '1',
    OPENCODE_DISABLE_FILEWATCHER: '1', OPENCODE_DISABLE_FFF: '1', OPENCODE_PRINT_LOGS: '1'
  })
}

/** OpenCode's account over ACP: a managed profile, or the user's own environment. */
export function openCodeAcpAccountBinding(
  managedAccounts: () => AccountReader = getManagedDataAccountService
): AcpAccountBinding {
  return {
    pin: { accountLocatorKind: 'opencode' },
    resolve: async () =>
      resolveStructuredOpenCodeAccountHome({ managedAccounts: managedAccounts() }),
    environment: (home, env) => {
      if (isLegacyAgentSessionAccountHome(home)) {
        throw new Error('OpenCode chat requires a pinned data account')
      }
      return environmentForStructuredOpenCodeAccountHome(home, {
        managedAccounts: managedAccounts(),
        baseEnvironment: env
      })
    }
  }
}
