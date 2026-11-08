import { ApiError } from '../api/transport';

const guidance: Record<string, string> = {
  scope_denied: '当前项目未允许此操作，请检查项目权限后再提交。',
  approval_required: '此操作需要你明确批准项目范围，请先设置操作许可。',
  approval_revoked: '操作许可已撤销，请核对项目当前授权。',
  version_conflict: '记录已更新，请刷新并核对最新版本；当前输入已保留。',
  context_stale: '来源或上下文已更新，请核对所选版本后再提交。',
  unsupported_capability: '当前客户端或服务暂不支持此操作，请选择已支持的方式。',
  budget_exhausted: '本次处理已达到大小、次数或时限限制。请减少单次选择或核对原作业后决定下一步。',
  evidence_missing: '暂未取得所需资料，请检查公开来源或补充正文。',
  validation_failed: '请检查填写内容与所选范围后再提交。',
  provider_unavailable: '处理服务暂不可用，请检查服务或来源后再尝试。',
  not_found: '记录暂时无法找到，请刷新列表并核对所选项目或资料。',
};
const actions: Record<string, string> = {
  provide_public_profile_or_folder: '请提供平台正式的公开 HTTPS 主页或收藏夹链接。',
  choose_public_folder_or_profile: '请填写公开 UID 或一个明确的公开收藏夹链接。',
  correct_public_source_identity: '账号 / 收藏夹 ID 与链接不一致，请核对公开页面中的身份。',
  provide_public_douyin_profile: '抖音 self 地址需要登录，请提供可公开访问的抖音主页链接。',
  provide_supported_public_collection: '此收藏来源暂不支持匿名读取，请提供可公开访问且已支持的收藏夹。',
  choose_supported_public_platform: '此平台暂未接入，请选择已支持的公开来源。',
  wait_for_source_job: '此来源仍在处理，请先查看队列或重载已保存清单，不重复创建作业。',
  refresh_listing_or_choose_available_item: '此标题版本已过期或内容不可用，请同步核对后重新选择。',
  select_configured_project_cli: '请在共同工作区配置此项目允许使用的模型 CLI 后再请求建议。',
  select_permitted_project_cli: '请选择已明确许可模型处理的项目和对应 CLI。',
  recommend_current_metadata_first: '请先完成当前标题版本的 Agent 建议，再选择获取正文。',
  check_native_session_and_project_settings: '请在共同工作区核对所选客户端的实际状态与本项目许可；配置未核实时，可明确验证连接后再决定是否提交。',
};

export function commandError(error: unknown) {
  if (error instanceof ApiError) {
    const unknown = error.code === 'delivery_unknown';
    const action = error.detail.error.required_action;
    const message = unknown ? '提交结果未知，请先刷新核对原记录；不要重复创建作业。'
      : error.code === 'budget_exhausted' && action === 'check_native_session_and_project_settings' ? guidance.budget_exhausted
        : actions[action] ?? (/\p{Script=Han}/u.test(action) ? action : guidance[error.code] ?? '暂未完成，请核对服务状态；原因可在处理详情查看。');
    return { message, detail: `${error.message} · ${action}（请求 ${error.requestId}）` };
  }
  return { message: '暂未收到服务确认，请先刷新核对原记录。当前输入已保留，不会自动重发。', detail: error instanceof Error ? error.message : '未知错误' };
}
