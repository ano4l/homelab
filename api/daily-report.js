import { authorize, getReport } from '../server/daily-report.js';
export function createHandler({ authenticate = authorize, load = getReport } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('Content-Type','application/json');
    const send=(status,body)=>{res.statusCode=status;res.end(JSON.stringify(body));};
    if(req.method!=='GET'){res.setHeader('Allow','GET');return send(405,{error:'Method not allowed.'});}
    if(!await authenticate(req))return send(401,{error:'Sign in to read your daily report.'});
    try{return send(200,await load());}catch{return send(503,{error:'Daily report is temporarily unavailable. Try again shortly.'});}
  };
}
export default createHandler();
