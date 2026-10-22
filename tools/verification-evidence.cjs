const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function fingerprint(directory=root){
  const files=[];
  function walk(relative){const absolute=path.join(directory,relative);for(const entry of fs.readdirSync(absolute,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const name=path.join(relative,entry.name);if(entry.isSymbolicLink())throw Error('Linked verification input: '+name);if(entry.isDirectory())walk(name);else if(entry.isFile())files.push({path:name.replaceAll('\\','/'),sha256:sha(path.join(directory,name))});}}
  for(const folder of ['src','tests','tools'])walk(folder);
  files.push({path:'package.json',sha256:sha(path.join(directory,'package.json'))});
  files.sort((a,b)=>a.path.localeCompare(b.path));return crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');
}
function requireCurrent(evidence,expected,kind){if(!evidence||evidence.schema!==1||evidence.kind!==kind||evidence.fingerprint!==expected||evidence.exitCode!==0)throw Error('Missing, failed or stale '+kind+' evidence; rerun verification for the current source.');}
module.exports={fingerprint,requireCurrent,sha};
