import { lstatSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'

export function requirePosixPrivatePath(path: string, directory: boolean) {
  if (process.platform !== 'linux' || !process.getuid || !isAbsolute(path) || realpathSync(path) !== resolve(path)) throw new Error('The native private POSIX path is unavailable')
  const actual = lstatSync(path)
  if (actual.isSymbolicLink() || (directory ? !actual.isDirectory() : !actual.isFile()) || actual.uid !== process.getuid() || (actual.mode & 0o7777) !== (directory ? 0o700 : 0o600)) throw new Error('The native private POSIX permissions changed')
  for (let ancestor = dirname(resolve(path)); ; ancestor = dirname(ancestor)) {
    const info = lstatSync(ancestor)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('The native private POSIX ancestor is redirected')
    if (dirname(ancestor) === ancestor) break
  }
}

export function createPosixPrivateFile(path: string, data: Uint8Array) {
  requirePosixPrivatePath(dirname(path), true)
  writeFileSync(path, data, { flag: 'wx', mode: 0o600 })
  requirePosixPrivatePath(path, false)
}
