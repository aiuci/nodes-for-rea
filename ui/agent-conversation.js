// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {AGENT_MESSAGE_LIMIT} from '../lib/agent-control-input.js';
const element=(tag,text,className)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};
const labels={queued:'Queued — after the current inspection',applying:'Considering your message',applied:'Applied',answered:'Answered','needs-clarification':'Needs clarification','not-applied':'Not applied'};

// One investigation-owned feed. The existing dynamic text-dictation installer
// attaches the same local microphone controller to this new editable textarea.
export function installAgentConversation({api,getState,panel,notify,onChange=()=>{}}){
  const section=element('section',null,'agent-conversation');section.id='agent-conversation';section.setAttribute('aria-label','Conversation with this investigation');
  const heading=element('h3','Conversation'),activity=element('p',null,'agent-note');activity.id='agent-conversation-activity';activity.setAttribute('role','status');
  const feed=element('div',null,'agent-conversation-feed');feed.id='agent-conversation-feed';feed.setAttribute('role','log');feed.setAttribute('aria-label','Investigation conversation');feed.setAttribute('aria-live','polite');feed.tabIndex=0;
  const hint=element('p','Tell the agent something…','agent-message-label');hint.id='agent-message-label';
  const input=element('textarea');input.id='agent-message';input.rows=3;input.maxLength=AGENT_MESSAGE_LIMIT;input.placeholder='Ask about the investigation or point it somewhere next.';input.setAttribute('aria-labelledby',hint.id);
  const actions=element('div',null,'agent-message-actions'),send=element('button','Send');send.id='agent-message-send';send.type='button';
  const status=element('p','Conversation stays with this investigation.','agent-note');status.id='agent-conversation-status';status.setAttribute('role','status');
  actions.append(send);section.append(heading,activity,feed,hint,input,actions,status);
  panel.querySelector('.agent-goal-composer').after(section);
  let control=null,session=null,loadedId=null,loading=0,sending=false,pendingSend=null,lastContent='',working=false;
  const drafts=new Map();
  const activeId=()=>getState()?.id;
  const remember=()=>{if(activeId())drafts.set(activeId(),input.value);};input.addEventListener('input',remember);
  const render=()=>{
    const id=activeId();section.hidden=!id||!api.agentMessage;
    const messages=control?.investigationId===id?control.messages||[]:[];
    const before=feed.scrollHeight-feed.scrollTop-feed.clientHeight,selection=globalThis.getSelection?.(),readingSelection=selection&&!selection.isCollapsed&&feed.contains(selection.anchorNode),atEnd=before<35&&!readingSelection&&document.activeElement!==feed;
    const content=JSON.stringify(messages);
    if(content!==lastContent){
      const scrollTop=feed.scrollTop;lastContent=content;
      const existing=new Map([...feed.querySelectorAll('[data-message-id]')].map(node=>[node.dataset.messageId,node]));
      feed.querySelector('.agent-conversation-empty')?.remove();
      for(const message of messages){
        let article=existing.get(message.id);
        if(!article){article=element('article',null,`agent-conversation-message agent-conversation-${message.role}`);article.dataset.messageId=message.id;article.append(element('strong',message.role==='user'?'You':message.role==='agent'?'Agent':'Investigation'),element('p',message.text,'agent-conversation-text'));feed.append(article);}
        const text=article.querySelector('.agent-conversation-text');if(text.textContent!==message.text)text.textContent=message.text;
        if(message.role==='user'&&message.status){let state=article.querySelector('.agent-message-state');if(!state){state=element('p',null,'agent-message-state');article.append(state);}const label=message.status==='queued'&&session?.status!=='running'?'Queued':message.status==='applying'&&message.kind==='direction'?(session?.status!=='running'?'Ready — resume to begin':'Applying your direction'):labels[message.status]||message.status;if(state.textContent!==label)state.textContent=label;state.dataset.status=message.status;}
        if(message.reason){let reason=article.querySelector('.agent-message-reason');if(!reason){reason=element('p',null,'agent-note agent-message-reason');article.append(reason);}if(reason.textContent!==message.reason)reason.textContent=message.reason;}
      }
      for(const [id,node]of existing)if(!messages.some(message=>message.id===id))node.remove();
      if(!messages.length)feed.append(element('p','Ask what was explored, offer access, or give the agent a new direction.','agent-note agent-conversation-empty'));
      feed.scrollTop=atEnd?feed.scrollHeight:scrollTop;
    }
    working=messages.some(m=>m.role==='user'&&['queued','applying'].includes(m.status));
    const step=session?.route?.find(s=>s.nodeId===session.currentNode&&s.status==='pending');
    activity.textContent=session?.status==='running'?`Investigating${step?.title?` · ${step.title}`:''}`:session?.stopReason||'Ask a question or choose what to explore next.';
    send.disabled=sending||!id||!input.value.trim()||input.value.length>AGENT_MESSAGE_LIMIT;
    onChange({working});
  };
  input.addEventListener('input',render);
  const accept=payload=>{
    if(payload?.investigationId!==activeId()||!payload.control)return;
    if(control?.investigationId===payload.investigationId&&payload.control.revision<control.revision)return;
    control=payload.control;render();
  };
  const load=async id=>{
    if(loadedId)drafts.set(loadedId,input.value);loadedId=id;control=null;lastContent='';input.value=drafts.get(id)||'';pendingSend=null;render();if(!id)return;
    const request=++loading;
    try{const loaded=await api.agentControlRead?.(id);if(request===loading&&id===activeId()&&loaded)accept({investigationId:id,control:loaded});}
    catch(error){if(request===loading){status.textContent=error.message;notify(error);}}
  };
  send.onclick=async()=>{
    const id=activeId(),text=input.value;if(sending||!id||!text.trim())return;
    if(!pendingSend||pendingSend.id!==id||pendingSend.text!==text)pendingSend={id,text,messageId:crypto.randomUUID()};
    const ticket=pendingSend;sending=true;status.textContent='Saving your message…';render();
    try{
      const saved=await api.agentMessage(id,{id:ticket.messageId,text:ticket.text});
      if(id!==activeId())return;
      accept({investigationId:id,control:saved});
      if(input.value===text){input.value='';drafts.set(id,'');}
      pendingSend=null;status.textContent='Message received. Conversation stays with this investigation.';
    }catch(error){if(id===activeId()){status.textContent=error.message||'Your message could not be saved. Your text is kept.';notify(error);}}
    finally{sending=false;render();}
  };
  input.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)&&!event.isComposing){event.preventDefault();send.click();}});
  const unsubscribe=api.onAgentControlUpdate?.(accept);
  globalThis.addEventListener('pagehide',()=>unsubscribe?.(),{once:true});
  return {sync(nextSession){session=nextSession;if(activeId()!==loadedId)load(activeId());else render();},get working(){return working;},get control(){return control;},get element(){return section;},get input(){return input;}};
}
