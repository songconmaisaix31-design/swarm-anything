import { InvalidArgumentError, ZodError, formatZodError } from './core'
import type { RpcEnvelopeMeta, RpcRequest, RpcResponse } from './core'
import { OrchestrationError } from '../orchestration/orchestration-error'
import {
  computerErrorData,
  errorResponse,
  mapBrowserError,
  mapEmulatorError,
  mapRuntimeError
} from './errors'

export function invalidArgumentResponse(
  request: RpcRequest,
  meta: RpcEnvelopeMeta,
  message: string
): RpcResponse {
  return errorResponse(
    request.id,
    meta,
    'invalid_argument',
    message,
    request.method.startsWith('computer.') ? computerErrorData('invalid_argument') : undefined
  )
}

export function mapDispatcherError(
  request: RpcRequest,
  meta: RpcEnvelopeMeta,
  error: unknown
): RpcResponse {
  // 产品方法保留真实原生拒绝；其他来源继续采用上游错误映射。
  if (request.method.startsWith('swa.') && error instanceof OrchestrationError) {
    return errorResponse(request.id, meta, error.code, error.message, error.data)
  }
  if (error instanceof ZodError) {
    return invalidArgumentResponse(request, meta, formatZodError(error))
  }
  if (error instanceof InvalidArgumentError) {
    return invalidArgumentResponse(request, meta, error.message)
  }
  if (request.method.startsWith('browser.')) {
    return mapBrowserError(request.id, meta, error)
  }
  if (request.method.startsWith('emulator.')) {
    return mapEmulatorError(request.id, meta, error)
  }
  return mapRuntimeError(request.id, meta, error)
}
