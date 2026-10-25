// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Small, bounded ZIP container for portable research. Stored entries are written;
// stored/deflated regular files are read. No archive path is ever extracted.
import {inflateRawSync} from 'node:zlib';
export const ZIP_LIMITS={archive:128*1024*1024,total:256*1024*1024,entry:32*1024*1024,entries:4096};
const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(data){let n=0xffffffff;for(const b of data)n=table[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
export function safePackagePath(name){
  if(typeof name!=='string'||name.length>240||!/^[a-zA-Z0-9_.\/-]+$/.test(name)||name.startsWith('/')||name.includes('\\'))return false;
  return name.split('/').every(p=>p&&p!=='.'&&p!=='..'&&!/[. ]$/.test(p)&&! /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p));
}
export function writeZip(entries,limits=ZIP_LIMITS){
  if(entries.size>limits.entries)throw new Error('Too many document attachments.');
  const local=[],central=[],seen=new Set();let offset=0,total=0;
  for(const [name,value]of entries){
    if(!safePackagePath(name)||seen.has(name.toLowerCase()))throw new Error('Unsafe or duplicate document entry.');seen.add(name.toLowerCase());
    const data=Buffer.isBuffer(value)?value:Buffer.from(value),file=Buffer.from(name);total+=data.length;
    if(data.length>limits.entry||total>limits.total)throw new Error('Document exceeds its attachment size limit.');
    const crc=crc32(data),head=Buffer.alloc(30);head.writeUInt32LE(0x04034b50);head.writeUInt16LE(20,4);head.writeUInt16LE(0x800,6);head.writeUInt16LE(33,12);head.writeUInt32LE(crc,14);head.writeUInt32LE(data.length,18);head.writeUInt32LE(data.length,22);head.writeUInt16LE(file.length,26);
    const dir=Buffer.alloc(46);dir.writeUInt32LE(0x02014b50);dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);dir.writeUInt16LE(0x800,8);dir.writeUInt16LE(33,14);dir.writeUInt32LE(crc,16);dir.writeUInt32LE(data.length,20);dir.writeUInt32LE(data.length,24);dir.writeUInt16LE(file.length,28);dir.writeUInt32LE(offset,42);
    local.push(head,file,data);central.push(dir,file);offset+=head.length+file.length+data.length;
  }
  const size=central.reduce((n,b)=>n+b.length,0),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.size,8);end.writeUInt16LE(entries.size,10);end.writeUInt32LE(size,12);end.writeUInt32LE(offset,16);
  if(offset+size+22>limits.archive)throw new Error('Document exceeds 128 MiB. Exclude large evidence from a shared copy.');
  return Buffer.concat([...local,...central,end]);
}
export function readZip(raw,limits=ZIP_LIMITS){
  if(!Buffer.isBuffer(raw)||raw.length<22||raw.length>limits.archive)throw new Error('Invalid or excessive investigation package size.');
  let eocd=-1;for(let i=raw.length-22;i>=Math.max(0,raw.length-65557);i--)if(raw.readUInt32LE(i)===0x06054b50&&i+22+raw.readUInt16LE(i+20)===raw.length){eocd=i;break;}
  if(eocd<0)throw new Error('Damaged ZIP document directory.');
  const count=raw.readUInt16LE(eocd+10),size=raw.readUInt32LE(eocd+12),start=raw.readUInt32LE(eocd+16);
  if(raw.readUInt16LE(eocd+4)||raw.readUInt16LE(eocd+6)||raw.readUInt16LE(eocd+8)!==count||count===65535||count>limits.entries||start+size!==eocd)throw new Error('Unsupported or excessive ZIP directory (ZIP64/multi-volume is not supported).');
  const entries=[],names=new Set();let pos=start,total=0;
  for(let i=0;i<count;i++){
    if(pos+46>eocd||raw.readUInt32LE(pos)!==0x02014b50)throw new Error('Damaged ZIP entry.');
    const flags=raw.readUInt16LE(pos+8),method=raw.readUInt16LE(pos+10),crc=raw.readUInt32LE(pos+16),compressed=raw.readUInt32LE(pos+20),length=raw.readUInt32LE(pos+24),n=raw.readUInt16LE(pos+28),extra=raw.readUInt16LE(pos+30),comment=raw.readUInt16LE(pos+32),mode=raw.readUInt32LE(pos+38)>>>16,offset=raw.readUInt32LE(pos+42);
    if(flags&~0x808||![0,8].includes(method)||raw.readUInt16LE(pos+34)||mode&&![0,0x8000].includes(mode&0xf000))throw new Error('Encrypted, linked or unsupported ZIP entry.');
    if(pos+46+n+extra+comment>eocd)throw new Error('Damaged ZIP entry name.');
    const name=raw.subarray(pos+46,pos+46+n).toString('utf8');if(!safePackagePath(name)||names.has(name.toLowerCase()))throw new Error('Unsafe or duplicate ZIP path.');names.add(name.toLowerCase());
    total+=length;if(length>limits.entry||total>limits.total||compressed>limits.archive)throw new Error('Excessive uncompressed document size.');
    if(offset+30>start||raw.readUInt32LE(offset)!==0x04034b50||raw.readUInt16LE(offset+6)!==flags||raw.readUInt16LE(offset+8)!==method)throw new Error('Damaged local ZIP entry.');
    const localName=raw.readUInt16LE(offset+26),localExtra=raw.readUInt16LE(offset+28),dataStart=offset+30+localName+localExtra,dataEnd=dataStart+compressed;
    if(dataEnd>start||raw.subarray(offset+30,offset+30+localName).toString('utf8')!==name||(!(flags&8)&&(raw.readUInt32LE(offset+14)!==crc||raw.readUInt32LE(offset+18)!==compressed||raw.readUInt32LE(offset+22)!==length)))throw new Error('ZIP entry metadata does not match.');
    entries.push({name,offset,dataStart,dataEnd,length,crc,method});pos+=46+n+extra+comment;
  }
  if(pos!==eocd)throw new Error('Unexpected ZIP directory content.');
  const ranges=[...entries].sort((a,b)=>a.offset-b.offset);for(let i=1;i<ranges.length;i++)if(ranges[i].offset<ranges[i-1].dataEnd)throw new Error('Overlapping ZIP entries.');
  const files=new Map();for(const e of entries){let data;try{data=e.method===0?raw.subarray(e.dataStart,e.dataEnd):inflateRawSync(raw.subarray(e.dataStart,e.dataEnd),{maxOutputLength:Math.max(1,e.length)});}catch{throw new Error('Damaged or excessive compressed attachment.');}if(data.length!==e.length||crc32(data)!==e.crc)throw new Error('Attachment ZIP checksum failed.');files.set(e.name,Buffer.from(data));}return files;
}
