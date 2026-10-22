'use strict';
const button=document.getElementById('start');
const result=document.getElementById('result');
let timer;
function show(data){
  result.textContent=data.message;
  result.dataset.status=data.status;
  document.getElementById('environment').textContent=data.onRender?'Yes':'No — this result does not prove Render connectivity';
  for(const [id,key] of [['directory','directoryReachable'],['download','fileDownloaded'],['format','formatValidated']]){
    document.getElementById(id).textContent=data[key]?'Passed':data.status==='not-started'?'Not tested':data.status==='running'?'Waiting…':'Not passed';
  }
  document.getElementById('completed').textContent=data.completedAt?new Date(data.completedAt).toLocaleString('en-AU',{timeZone:'Australia/Brisbane',dateStyle:'medium',timeStyle:'medium'})+' AEST':'—';
  document.getElementById('report').textContent=JSON.stringify(data,null,2);
  button.disabled=data.status!=='not-started';
  button.textContent=data.status==='not-started'?'Run connection test':data.status==='running'?'Test running…':'Test completed';
  clearTimeout(timer);
  if(data.status==='running')timer=setTimeout(()=>read(),2000);
}
async function read(method='GET'){
  button.disabled=true;
  try{
    const response=await fetch('/api/diagnostics/bom',{method,cache:'no-store'});
    if(!response.ok)throw new Error('The service did not return a result.');
    show(await response.json());
  }catch(error){
    result.textContent='Could not read the test result. Reload this page to check again; the saved test will not be repeated.';
  }
}
button.addEventListener('click',()=>read('POST'));
read();
