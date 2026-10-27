import type { components } from '../../api/schema';

type Settings = components['schemas']['LocalProjectSettingsV1'];
type ModelPermission = Pick<Settings, 'external_model_cli' | 'external_model_clis'>;

/** 旧配置只许可原默认 CLI；目录或能力清单不会增加模型许可。 */
export function allowedModelCLIs(settings: ModelPermission): string[] {
  if (!settings.external_model_cli) return [];
  const selected = settings.external_model_clis;
  if (!selected?.length) return [settings.external_model_cli];
  return selected.includes(settings.external_model_cli) ? selected : [];
}

export function modelCLIAllowed(settings: ModelPermission, cli: string): boolean {
  return !!cli && allowedModelCLIs(settings).includes(cli);
}

export function selectDefaultModelCLI<T extends ModelPermission>(settings: T, value: string): T {
  const cli = value.trim();
  return { ...settings, external_model_cli: cli, external_model_clis: cli ? [...new Set([...allowedModelCLIs(settings), cli])] : [] };
}
