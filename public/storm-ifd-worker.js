/* Keep statewide IFD comparisons off the UI thread. Saved local references only. */
'use strict';
importScripts('/point-ifd.js?v=1');
self.onmessage=async event=>{
 try{const result=await PointRainfallIFD.prepare(event.data,1440,'wettest');self.postMessage({result});}
 catch(error){self.postMessage({error:error.message||'Point AEP assessment unavailable'});}
};
