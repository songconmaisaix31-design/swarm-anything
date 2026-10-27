import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SwaQuestionAnswerForm, SwaQuestionHistory, SwaQuestionModeField } from './SwaRunWorkspace';
import { readQuestionContinuation, type SwaQuestionReadState } from './swaRunView';

// 纯表单边界；生产 SQLite 问题/答复与恢复器另由 question-answer.test.mjs 直接验证。
const question = { id: 'form-question', taskID: 'form-task', dispatchID: 'form-dispatch', question: '按哪个公开要求继续？' };
const onChange = () => { throw new Error('静态呈现不能改写用户回答'); };
const onSubmit = () => { throw new Error('静态呈现不能提交请求'); };
const render = (text: string, disabled = false) => renderToStaticMarkup(createElement(SwaQuestionAnswerForm, { question, text, disabled, onChange, onSubmit }));

describe('同 Run 问题回答表单', () => {
  it('保留正文空白与换行，展示实际问题身份和 UTF-8 字节数', () => {
    const body = '  按原公开要求继续。\n保留正文与换行。 \n';
    const html = render(body);
    expect(html).toContain(body);
    expect(html).toContain(question.id);
    expect(html).toContain(question.dispatchID);
    expect(html).toContain(`${new TextEncoder().encode(body).length}/32000`);
    expect(html).not.toContain('disabled=""');
  });

  it('旧权限、未知请求、空白及多字节越界时禁止提交，禁用不会丢弃正文', () => {
    const body = '需要用户确认的原回答';
    const locked = render(body, true);
    expect(locked).toContain(body);
    expect(locked).toContain('<textarea required="" disabled="">');
    expect(locked).toMatch(/<button[^>]*disabled=""/);
    for (const invalid of ['', ' \n\t', '界'.repeat(10667)]) expect(render(invalid)).toMatch(/<button[^>]*disabled=""/);
    expect(render('界'.repeat(10666) + 'ab')).not.toContain('disabled=""');
  });

  it('问题模式选择保留用户选择，当前能力不可用时明确禁用 native 选项', () => {
    const mode = (value: 'disabled' | 'native', nativeAvailable: boolean, disabled = false) => renderToStaticMarkup(createElement(SwaQuestionModeField, { value, nativeAvailable, disabled, onChange }));
    expect(mode('disabled', false)).toContain('<option value="disabled" selected="">');
    const unavailable = mode('native', false);
    expect(unavailable).toContain('<option value="native" disabled="" selected="">');
    expect(unavailable).toContain('已选模式保留');
    expect(mode('native', true)).toContain('<option value="native" selected="">');
    expect(mode('native', true, true)).toContain('<select disabled="">');
  });

  it('只有明确的继续状态提供按钮，未知、已读与中断不产生继续操作', () => {
    const saved = { ...question, answer: '  原答案\n', answerID: 'form-answer', answeredAt: '2026-10-23T00:00:00.000Z' };
    const history = (readState: SwaQuestionReadState, disabled = false) => renderToStaticMarkup(createElement(SwaQuestionHistory, { question: { ...saved, ...readQuestionContinuation({ read_state: readState, continuation_required: readState === 'continuation_required' }) }, disabled, onResume: onSubmit }));
    for (const state of ['answer_saved', 'read_unconfirmed', 'read_observed', 'interrupted'] as const) expect(history(state)).not.toContain('<button');
    const ready = history('continuation_required');
    expect(ready).toContain(saved.answer);
    expect(ready).toContain(question.id);
    expect(ready).toContain(question.dispatchID);
    expect(ready).toContain('继续此问题');
    expect(ready).not.toContain('disabled=""');
    expect(history('continuation_required', true)).toMatch(/<button[^>]*disabled=""/);
    expect(history('read_observed')).toContain('原工具已读取答案');
    expect(history('interrupted')).toContain('原 Worker 已中断');
  });

  it('答案状态缺失、非法值或继续布尔不一致时保持未确认', () => {
    for (const invalid of [{}, { read_state: 'pending', continuation_required: false }, { read_state: 'read_observed', continuation_required: true }, { read_state: 'continuation_required', continuation_required: false }, { read_state: 'answer_saved', continuation_required: 'false' }]) expect(() => readQuestionContinuation(invalid)).toThrow('无法确认');
  });
});
