/* Small completed-response cache for rapid repeated gauge inspection. */
(function(root){
 const cache=new Map();let generation=0;
 root.ViewerData={clear(){generation++;cache.clear();},async read(url,options={}){
  const key=String(url),entry=cache.get(key),now=Date.now();
  if(entry&&now-entry.time<30000)return entry.data;
  const run=generation,response=await fetch(url,{...options,cache:'no-store'});if(!response.ok)throw new Error('Saved data request failed.');
  const data=await response.json();if(data.available&&run===generation){cache.set(key,{time:Date.now(),data});if(cache.size>16)cache.delete(cache.keys().next().value);}return data;
 }};
})(window);
