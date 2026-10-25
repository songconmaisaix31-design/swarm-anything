import type { components } from '../../api/schema';
import { modelCLIAllowed } from './modelCLIPermission';

type Agent = components['schemas']['LocalAgentV1'];
type Settings = components['schemas']['LocalProjectSettingsV1'];
type Action = keyof Agent['capabilities'];

/** 原生能力未知时可由人工明确核查；项目登记不会改变能力观察值。 */
export function nativeActionAllowed(settings: Settings, agent: Agent | undefined, cli: string, action: Action, unavailable: boolean): boolean {
  if (!modelCLIAllowed(settings, cli) || agent?.id !== cli || !settings.allowed_actions.includes(action)) return false;
  if (unavailable && action !== 'stop') return false;
  const status = agent.capabilities[action].status;
  return status === 'supported' || (status === 'unknown' && agent.native_adapter_registered === true);
}
