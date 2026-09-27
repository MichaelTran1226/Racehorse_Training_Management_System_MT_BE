import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const base=path.dirname(fileURLToPath(import.meta.url));
const ui=path.resolve(base,'../../GENERATE/ui-design/stitch-v2');
const env=Object.fromEntries((await readFile(path.join(base,'../.env.txt'),'utf8')).split(/\r?\n/).filter(l=>/^\w+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const gh=async(p,method='GET',body)=>{const r=await fetch('https://api.github.com'+p,{method,headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();if(!r.ok)throw Error(r.status+' '+j.message);return j};
const gq=async(query,variables={})=>{const r=await gh('/graphql','POST',{query,variables});if(r.errors)throw Error(JSON.stringify(r.errors));return r.data};
const tasks=JSON.parse(await readFile(path.join(base,'backlog.json'),'utf8'));
const repo='MichaelTran1226/Racehorse_Training_Management_System_MT_FE';
const branch='plan/web-flow-123';
const docBase=`https://github.com/${repo}/blob/${branch}/docs`;
const results=[];
for(const t of tasks){
 let body=await readFile(path.join(base,'issues',t.id+'.md'),'utf8');
 body=body.replace('../EquiFlow_Sprint_Plan_3_Weeks.xlsx',docBase+'/EquiFlow_Sprint_Plan_3_Weeks.xlsx').replace('../../GENERATE/ui-design/stitch-v2/SCREEN-MAP-CORE.md',docBase+'/ui/SCREEN-MAP.md');
 const [,target,number]=t.issueUrl.match(/github.com\/([^/]+\/[^/]+)\/issues\/(\d+)/);
 const old=await gh(`/repos/${target}/issues/${number}`);
 if(!old.title.includes(t.id))throw Error('Issue mapping mismatch '+t.id);
 const updated=await gh(`/repos/${target}/issues/${number}`,'PATCH',{title:t.githubTitle,body});
 results.push({id:t.id,lookup:t.lookup,title:updated.title,url:updated.html_url,nodeId:updated.node_id});
 await writeFile(path.join(base,'github-task-alignment.json'),JSON.stringify(results,null,2));
}
const q=await gq('query{user(login:"MichaelTran1226"){projectV2(number:2){id fields(first:50){nodes{... on ProjectV2Field{id name dataType} ... on ProjectV2SingleSelectField{id name options{id name}}}} items(first:100){nodes{id content{... on Issue{url}}}}}}}');
const project=q.user.projectV2;
const fields=new Map(project.fields.nodes.map(f=>[f.name,f]));
for(const [name,type] of [['Mã tra cứu','TEXT'],['Sprint','TEXT'],['Ngày bắt đầu','DATE'],['Ngày kế hoạch hoàn tất','DATE']]){
 if(fields.has(name))continue;
 const added=await gq('mutation($p:ID!,$n:String!,$t:ProjectV2CustomFieldType!){createProjectV2Field(input:{projectId:$p,name:$n,dataType:$t}){projectV2Field{... on ProjectV2Field{id name}}}}',{p:project.id,n:name,t:type});
 fields.set(name,added.createProjectV2Field.projectV2Field);
}
const date=s=>s.split('/').reverse().join('-');
for(const t of tasks){
 const item=project.items.nodes.find(i=>i.content?.url===t.issueUrl);if(!item)throw Error('Missing project item '+t.id);
 const values={'Mã tra cứu':{text:t.lookup},Sprint:{text:t.sprint},'Ngày bắt đầu':{date:date(t.start)},'Ngày kế hoạch hoàn tất':{date:date(t.targetDate)}};
 for(const [name,value] of Object.entries(values))await gq('mutation($p:ID!,$i:ID!,$f:ID!,$v:ProjectV2FieldValue!){updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:$v}){projectV2Item{id}}}',{p:project.id,i:item.id,f:fields.get(name).id,v:value});
}
await writeFile(path.join(base,'github-task-project-fields.json'),JSON.stringify({projectId:project.id,fields:[...fields.values()],updated:results.length},null,2));
console.log(JSON.stringify({updatedIssues:results.length,projectItems:project.items.nodes.length,namesMatch:results.every(i=>i.title===tasks.find(t=>t.id===i.id).githubTitle)}));
