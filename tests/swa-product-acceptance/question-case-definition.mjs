import { publicFiles, publicRevision, publicSource } from './public-case-definition.mjs'

export { publicFiles, publicRevision, publicSource }

export function questionCase(originals) {
  if (!Array.isArray(originals) || originals.length !== publicFiles.length || originals.some((original, index) => original.path !== publicFiles[index] || original.source_revision !== publicRevision || typeof original.text !== 'string' || !original.text)) throw new Error('The question case requires the four fixed public originals in source order')
  const context = JSON.stringify({ source: publicSource, revision: publicRevision, originals: originals.map(({ path, source_revision, text }) => ({ path, source_revision, text })) })
  const question = 'Median 接收偶数个样本时，是否返回两个中间值的平均数；是否必须保持调用方切片的原始顺序？'
  const boundaries = '只依据下列四份固定原文和本次任务要求分析。原生文件与命令工具关闭，不读写文件，不访问其他资料，不声称运行过测试。'
  const ask = `请为此项目提出与现有 Mean API 兼容的 Median 实现建议。以下业务条件尚未确定，必须先通过实际可用的 swa_ask 工具询问一次：“${question}”不要自行假定答案；不要用文字或代码块表示工具调用。收到真实工具返回的答案后，再给出有原文依据的方案，覆盖偶数、奇数、空切片和输入顺序，并区分现有实现、建议与尚未运行的检查。`
  const paused = '若这一次工具等待超时、取消或连接丢失，停止本轮并报告工具返回的原问题 ID 和仍需回答的状态，保留该问题；不要新建问题、自动重问或自行重复 resume。只有后续收到明确继续原问题的输入时，才通过 swa_ask 的 resume 参数读取该原问题的答案；读取成功后完成原任务。'
  const spec = (goal, workers, success) => ({
    goal, source_repo: publicSource, source_revision: publicRevision, max_workers: workers, initial_workers: workers,
    success_criteria: success,
    context: { references: [], files: publicFiles },
  })
  const reviewCriteria = [
    '依据四份固定原文准确说明现有 Mean API、实现与测试覆盖，引用对应文件并保留未知。',
    'Median 业务条件通过原问题的真实回答确认；方案覆盖偶数、奇数、空切片与输入顺序，明确建议尚未实现或运行验证。',
    '未取得原问题答案时保持未解决状态；不以自行假定或文字工具调用代替真实问答。',
  ]
  const input = (name, instruction, index = 1) => ({ name, file: `input-${index}.txt`, body: `${boundaries}\n${instruction}\n${context}\n` })
  return {
    stages: [
      { name: 'a', spec: spec('审阅固定公开 stats 项目，经真实业务澄清后给出 Median 兼容实现建议。', 1, reviewCriteria), inputs: [input('lead-a', ask + paused)] },
      { name: 'b', spec: spec('在同一 Run 中分别完成 Median 业务澄清与独立原文事实审阅；等待原问题回答后完成建议。', 2, [...reviewCriteria, '独立事实审阅仅说明四原文已有行为与证据，不依赖另一 Task 的待答问题。']), inputs: [
        input('lead-b', '你是本 Run 的 lead，负责 Median 业务澄清。' + ask + paused),
        input('independent-a', '你负责独立的事实审阅 Task。请简短核对四份原文的模块组织、现有 Mean API、实现及测试实际覆盖，按文件引用事实，明确未知与未执行检查。本 Task 无需业务澄清；不要调用 swa_ask，不等待其他 Task 的问题，完成你的事实审阅即可。', 2),
      ] },
      { name: 'c', spec: spec('审阅固定公开 stats 项目并提出一次 Median 业务澄清；未回答或任务被停止时保留真实未解决状态。', 1, ['准确引用四份原文，明确 Median 的偶数样本与输入顺序条件仍待回答。', '只创建一次真实业务问题；没有真实回答时不形成已确认的实现结论，不声称执行文件或测试。']), inputs: [input('lead-c', ask + paused)] },
    ],
    answer: { file: 'answer.txt', body: '  偶数样本返回两个中间值的平均数。\n必须保持调用方切片的原始顺序；请先复制后排序。\n  ' },
  }
}
