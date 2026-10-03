import { authorize, askAssistant, validContext } from '../server/assistant.js';
export function createHandler({authenticate=authorize,ask=askAssistant}={}) {
  return async (req,res)=>{
    res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json');
    const send=(code,body)=>{res.statusCode=code;res.end(JSON.stringify(body));};
    if(req.method!=='POST'){res.setHeader('Allow','POST');return send(405,{error:'Method not allowed.'});}
    if(!await authenticate(req))return send(401,{error:'Sign in to use your assistant.'});
    let body='';
    try {
      if(req.body!==undefined&&req.body!==null)body=typeof req.body==='string'?req.body:JSON.stringify(req.body);
      else for await(const chunk of req){body+=chunk;if(body.length>24000)return send(413,{error:'Message is too long.'});}
      if(body.length>24000)return send(413,{error:'Message is too long.'});
    }
    catch{return send(400,{error:'Could not read your message.'});}
    let context;try{context=validContext(JSON.parse(body));}catch{}
    if(!context)return send(400,{error:'Add a short message to start.'});
    try{return send(200,await ask(context));}catch{return send(503,{error:'The assistant is unavailable right now. You can still save this as a thought.'});}
  };
}
export default createHandler();
