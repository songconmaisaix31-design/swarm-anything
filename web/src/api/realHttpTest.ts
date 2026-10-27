/// <reference types="node" />
import { startS1Server, type S1Server } from '../../../tests/s1/server.mjs';
import { createApiClient } from './transport';

/** 测试记录实际 HTTP 请求，Node cookie jar 只保存本次服务颁发的会话。 */
export function recordedClient(server: Pick<S1Server, 'apiURL'>) {
  const requests: Request[] = [], responses: Response[] = [];
  let cookie = '';
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (cookie) request.headers.set('Cookie', cookie);
    if (request.method !== 'GET') request.headers.set('Origin', server.apiURL);
    requests.push(request.clone());
    const response = await fetch(request);
    responses.push(response.clone());
    const setCookie = response.headers.getSetCookie();
    if (setCookie.length) cookie = setCookie.map(value => value.split(';')[0]).join('; ');
    return response;
  };
  return { client: createApiClient(`${server.apiURL}/api/v1`, transport), requests, responses };
}

/** 成功查询使用协调者交付的公开来源快照目录，路径必须显式提供。 */
export function cognitionTestServer(browser = false) {
  const directory = process.env.ASTROCYTE_TEST_COGNITION_LOCALAPPDATA;
  if (!directory) throw new Error('需要协调者交付本次公开来源快照的 ASTROCYTE_TEST_COGNITION_LOCALAPPDATA');
  if (!/[\\/]\.verification[\\/]/.test(directory)) throw new Error('认知验证目录必须位于明确交付的 .verification 根下');
  return startS1Server({ browser, env: { LOCALAPPDATA: directory } });
}
