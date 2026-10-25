import readline from 'node:readline';
import fs from 'node:fs/promises';
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
const mode=process.argv[2];
for await(const line of readline.createInterface({input:process.stdin})){
 const request=JSON.parse(line),reply=result=>send({jsonrpc:'2.0',id:request.id,result});
 if(request.method==='initialize'){reply({protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'owned-round2-fixture',version:'1'}});continue;}
 if(request.method==='tools/list'){reply({tools:['binary_session','close_binary','inspect_fixture','second_fixture'].map(name=>({name,inputSchema:{type:'object',properties:{}}}))});continue;}
 if(request.method!=='tools/call')continue;
 const {name,arguments:args}=request.params;
 if(name==='binary_session'||name==='close_binary'){reply({content:[{type:'text',text:'{"open":false,"tool_availability":{"groups":[]}}'}]});continue;}
 if(name==='second_fixture'&&mode==='truncated'){
  process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result:{content:[{type:'text',text:'incomplete owned output'}]}}).slice(0,-15),()=>process.exit(0));continue;
 }
 if(name==='second_fixture'&&mode==='invalid-envelope'){reply({structuredContent:'incompatible scalar',content:[]});continue;}
 if(name==='second_fixture'&&mode==='invalid-evidence'){reply({structuredContent:{evidence_id:42,normalized_result:{observed:'Untrusted result'},limitations:{invalid:'not a list'}}});continue;}
 if(name==='second_fixture'&&mode==='partial-failure'){reply({isError:true,content:[{type:'text',text:JSON.stringify({error:{code:'owned_failure_after_observation',message:'Owned tool failed after producing a partial observation'},partial:{observed:'A partial owned observation',complete:false}})}]});continue;}
 if(args.plain){reply({content:[{type:'text',text:'Legitimate plain text inspection'}]});continue;}
 if(mode==='mutate')await fs.appendFile(args.target,' changed during request');
 const result={content:[{type:'text',text:JSON.stringify({result:{observed:args.label||'Completed owned observation',added_vendor_field:{future:true}}})}],extra_vendor_envelope_field:'compatible addition'};
 if(mode==='out-of-order')setTimeout(()=>reply(result),args.label==='first'?70:5);else reply(result);
}
