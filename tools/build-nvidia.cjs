const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

function buildNvidiaWorker(root = path.resolve(__dirname, '..')) {
  if (process.platform !== 'win32') throw new Error('O worker NVIDIA é compilado no Windows com .NET Framework.');
  const compiler = path.join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  const source = path.join(root, 'src', 'free', 'native', 'NvidiaWorker.cs');
  const target = path.join(root, 'vendor', 'native', 'csboost-nvidia.exe');
  if (!fs.existsSync(compiler)) throw new Error('Compilador C# do .NET Framework não está disponível. Nenhum toolchain foi instalado.');
  fs.mkdirSync(path.dirname(target), {recursive: true});
  execFileSync(compiler, ['/nologo', '/optimize+', '/target:exe', '/platform:x64', '/reference:System.Web.Extensions.dll', '/reference:System.Core.dll', `/out:${target}`, source], {windowsHide: true, timeout: 30000, encoding: 'utf8', stdio: 'pipe'});
  return target;
}
module.exports = {buildNvidiaWorker};
if (require.main === module) {
  try { process.stdout.write(buildNvidiaWorker() + '\n'); }
  catch (error) { process.stderr.write((error.stdout || '') + (error.stderr || '') + error.message + '\n'); process.exitCode = 1; }
}
