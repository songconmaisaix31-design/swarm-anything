if (process.platform === 'linux') await import('./build-swa-linux.mjs')
else if (process.platform === 'win32') await import('./build-swa-package.mjs')
else throw new Error('SWA packaging currently supports Windows x64 and Linux x64 glibc')
