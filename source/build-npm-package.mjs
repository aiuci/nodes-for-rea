import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(process.argv[2]||path.join(source,'qa-output/npm-desktop/package'));
const version=process.argv[3]||'0.3.0-preview.20261025.2';
if(!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version))throw new Error('Pass a valid release version.');
await fs.mkdir(path.dirname(output),{recursive:true});
// Never overlay a previous staging folder or copy ignored state/dependencies.
await fs.mkdir(output);
const files=execFileSync('git',['ls-files','--','main.cjs','preload.cjs','lib','ui','assets'],{cwd:source,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim();
const committed=relative=>execFileSync('git',['show',`${sourceCommit}:${relative}`],{cwd:source,maxBuffer:16*1024*1024});
for(const relative of files){
  if(!/^(?:main\.cjs|preload\.cjs|(?:lib|ui|assets)\/.+)$/.test(relative)||/(?:^|\/)(?:data|settings|node_modules|qa-output|auth\.json)(?:\/|$)/i.test(relative))throw new Error(`Unexpected package entry: ${relative}`);
  const from=path.join(source,relative);if(!(await fs.lstat(from)).isFile())throw new Error(`Expected plain source file: ${relative}`);
  await fs.mkdir(path.dirname(path.join(output,relative)),{recursive:true});await fs.writeFile(path.join(output,relative),committed(relative));
}
await fs.mkdir(path.join(output,'bin'));
await fs.writeFile(path.join(output,'bin/nodes-for-rea.cjs'),committed('packaging/npm/launcher.cjs'));
await fs.writeFile(path.join(output,'README.md'),committed('packaging/npm/README.md'));
const publicFiles=['LICENSE','NOTICE.md','TRADEMARKS.md','CONTRIBUTING.md','SOURCE.md','THIRD-PARTY-NOTICES.md'];
for(const relative of publicFiles)await fs.writeFile(path.join(output,relative),committed(relative));
for(const relative of execFileSync('git',['ls-files','--','LICENSES'],{cwd:source,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean)){
  await fs.mkdir(path.dirname(path.join(output,relative)),{recursive:true});await fs.writeFile(path.join(output,relative),committed(relative));
}
await fs.mkdir(path.join(output,'source'));
await fs.writeFile(path.join(output,'source/build-npm-package.mjs'),committed('scripts/build-npm-package.mjs'));
const manifest={name:'nodes-for-rea',version,description:'A persistent visual workspace for exploring software with REA and your connected AI agent.',private:false,license:'AGPL-3.0-only',author:'Jeremy Opio (Gorgeous Systems)',homepage:'https://gorgeous.systems/nodes-for-rea/',repository:{type:'git',url:'git+https://github.com/aiuci/nodes-for-rea.git'},bugs:{url:'https://github.com/aiuci/nodes-for-rea/issues'},type:'module',main:'main.cjs',productName:'Nodes for REA',bin:{'nodes-for-rea':'bin/nodes-for-rea.cjs'},os:['win32'],cpu:['x64'],engines:{node:'^22.19.0 || ^24.11.0 || >=26.0.0'},files:['main.cjs','preload.cjs','lib/','ui/','assets/','bin/','npm-release.json','npm-shrinkwrap.json',...publicFiles,'LICENSES/','DEPENDENCY-LICENSES.json','source/'],publishConfig:{registry:'https://registry.npmjs.org/',access:'public'},dependencies:{cheerio:'1.2.0',electron:'44.7.2','rea-agents':'6.5.0','@openai/codex':'0.149.0'}};
await fs.writeFile(path.join(output,'package.json'),JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(path.join(output,'npm-release.json'),JSON.stringify({version:1,releaseVersion:version,platform:'win32-x64',sourceCommit},null,2)+'\n');
const npmCli=process.env.npm_execpath||path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
await fs.access(npmCli);
const npm=args=>execFileSync(process.execPath,[npmCli,...args],{cwd:output,encoding:'utf8',maxBuffer:8*1024*1024});
// Preserve the exact tested dependency graph; only this package's root metadata changes.
const lock=JSON.parse(committed('packaging/npm/npm-shrinkwrap.json').toString('utf8'));
lock.name=manifest.name;lock.version=version;lock.packages['']={...lock.packages[''],name:manifest.name,version,license:manifest.license};delete lock.packages[''].private;
const sortedDependencies=value=>JSON.stringify(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)));
if(sortedDependencies(lock.packages[''].dependencies)!==sortedDependencies(manifest.dependencies))throw new Error('Locked direct dependencies differ from manifest');
await fs.writeFile(path.join(output,'npm-shrinkwrap.json'),JSON.stringify(lock,null,2)+'\n');
const inventory=Object.entries(lock.packages).filter(([relative])=>relative).map(([relative,entry])=>({path:relative,version:entry.version,license:entry.license,archive:entry.resolved,integrity:entry.integrity}));
await fs.writeFile(path.join(output,'DEPENDENCY-LICENSES.json'),JSON.stringify({note:'Upstream licenses retained; see THIRD-PARTY-NOTICES.md',dependencies:inventory},null,2)+'\n');
const pack=JSON.parse(npm(['pack','--ignore-scripts','--json']))[0];
await fs.writeFile(`${output}-pack.json`,JSON.stringify(pack,null,2)+'\n');
console.log(JSON.stringify({output,tarball:path.join(output,pack.filename),version,sourceCommit,size:pack.size,unpackedSize:pack.unpackedSize,files:pack.entryCount,license:manifest.license,publicationBlocked:false},null,2));
