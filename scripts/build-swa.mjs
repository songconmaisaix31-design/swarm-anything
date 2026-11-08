if (process.platform === 'linux') await import('./build-swa-linux.mjs')
else if (process.platform === 'win32') await import('./build-swa-package.mjs')
else if (process.platform === 'darwin') await import('./build-swa-darwin.mjs')
else throw new Error('SWA packaging currently supports Windows x64, Linux x64 glibc and macOS arm64')
