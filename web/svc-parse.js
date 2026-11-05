/* 仁寶服務紀錄解析（和展示版 ltc-portal.html 的同名函式相同，端到端測試會比對兩邊結果一致）。
   在瀏覽器裡讀檔、只產生彙總；個案編號與身分證字號只用來數人，不會送到伺服器。 */
const REMOTE_AREAS = ['五峰','尖石','關西','峨眉'];
async function xlsxRead(buf, prefer){   // prefer：優先選名稱符合的工作表（例如整份薪資活頁簿裡的「服務紀錄總表」），找不到就用第一個
  const u8=new Uint8Array(buf), dv=new DataView(buf);
  let e=-1; for(let i=u8.length-22;i>=Math.max(0,u8.length-70000);i--){ if(dv.getUint32(i,true)===0x06054b50){ e=i; break; } }
  if(e<0) throw new Error('不是有效的 .xlsx 檔案');
  const n=dv.getUint16(e+10,true); let p=dv.getUint32(e+16,true); const files={};
  const td=new TextDecoder('utf-8');
  for(let k=0;k<n;k++){
    if(dv.getUint32(p,true)!==0x02014b50) throw new Error('壓縮檔結構異常');
    const meth=dv.getUint16(p+10,true), csz=dv.getUint32(p+20,true), nl=dv.getUint16(p+28,true), xl=dv.getUint16(p+30,true), cl=dv.getUint16(p+32,true), lo=dv.getUint32(p+42,true);
    const name=td.decode(u8.subarray(p+46,p+46+nl)); p+=46+nl+xl+cl;
    if(!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(name)) continue;
    const ds=lo+30+dv.getUint16(lo+26,true)+dv.getUint16(lo+28,true), raw=u8.subarray(ds,ds+csz);
    if(meth===0) files[name]=td.decode(raw);
    else if(meth===8){
      if(typeof DecompressionStream==='undefined') throw new Error('這個瀏覽器不支援讀取 .xlsx，請改用較新的 Chrome、Edge 或 Safari');
      files[name]=await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    } else throw new Error('不支援的壓縮方式');
  }
  const dom=x=>new DOMParser().parseFromString(x,'application/xml');
  const sst=[]; if(files['xl/sharedStrings.xml']) dom(files['xl/sharedStrings.xml']).querySelectorAll('si').forEach(si=>sst.push([...si.querySelectorAll('t')].map(t=>t.textContent).join('')));
  /* 第一個工作表 */
  let sheetPath='xl/worksheets/sheet1.xml';
  try{
    const wb=dom(files['xl/workbook.xml']), shs=[...wb.querySelectorAll('sheet')], sh=(prefer&&shs.find(x=>prefer.test(x.getAttribute('name')||'')))||shs[0], rid=sh.getAttribute('r:id')||sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
    const rel=[...dom(files['xl/_rels/workbook.xml.rels']).querySelectorAll('Relationship')].find(r=>r.getAttribute('Id')===rid);
    if(rel) sheetPath='xl/'+rel.getAttribute('Target').replace(/^\/?(xl\/)?/,'');
  }catch(_){}
  if(!files[sheetPath]) throw new Error('找不到工作表');
  const colIdx=ref=>{ let c=0; for(const ch of ref.replace(/\d+/g,'')) c=c*26+ch.charCodeAt(0)-64; return c-1; };
  const rows=[];
  dom(files[sheetPath]).querySelectorAll('row').forEach(r=>{
    const arr=[]; r.querySelectorAll('c').forEach(c=>{
      const t=c.getAttribute('t'), v=c.querySelector('v'); let val='';
      if(t==='s'&&v) val=sst[+v.textContent]??''; else if(t==='inlineStr') val=[...c.querySelectorAll('t')].map(x=>x.textContent).join(''); else if(v) val=v.textContent;
      arr[colIdx(c.getAttribute('r'))]=val;
    }); rows.push(arr);
  });
  return rows;
}
/* CSV：支援引號、引號內的逗號與換行、CRLF、UTF-8（含 BOM）；Excel 在繁中 Windows 存的 CSV 常是 Big5，讀不了 UTF-8 時改用 Big5 */
function csvRead(buf){
  let text; try{ text=new TextDecoder('utf-8',{fatal:true}).decode(buf); }
  catch(_){ try{ text=new TextDecoder('big5').decode(buf); }catch(e){ throw new Error('這個 CSV 的文字編碼讀不了，請在 Excel 另存成「CSV UTF-8」或 .xlsx'); } }
  text=text.replace(/^\uFEFF/,'');
  const delim=(text.split('\n',1)[0].match(/\t/g)||[]).length>(text.split('\n',1)[0].match(/,/g)||[]).length?'\t':',';
  const rows=[]; let row=[], cell='', q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){ cell+='"'; i++; } else q=false; } else cell+=c; }
    else if(c==='"') q=true;
    else if(c===delim){ row.push(cell); cell=''; }
    else if(c==='\n'||c==='\r'){ if(c==='\r'&&text[i+1]==='\n') i++; row.push(cell); cell=''; rows.push(row); row=[]; }
    else cell+=c;
  }
  if(cell!==''||row.length){ row.push(cell); rows.push(row); }
  return rows;
}
const SVC_NEED=['案號','服務項目類別','項目服務次數','居服員姓名','服務日期','服務時間長度(分)'];
function svcAggregate(rows){
  const norm=v=>String(v??'').split('\n')[0].replace(/\s/g,'');
  let h=-1; for(let i=0;i<Math.min(rows.length,12);i++){ const f=(rows[i]||[]).map(norm); if(f.includes('案號')&&f.includes('服務項目類別')){ h=i; break; } }
  if(h<0) return {fatal:'找不到表頭：需要有「案號」與「服務項目類別」欄的那一列'};
  /* 表頭可能是兩列（上列 A–R、下列 S 以後），合併後用位置找 */
  const lab=[]; for(let r=h;r<=Math.min(h+1,rows.length-1);r++) (rows[r]||[]).forEach((v,i)=>{ const t=norm(v); if(t) (lab[i]=lab[i]||[]).push(t); });
  const find=(name,nth=0)=>{ let k=0; for(let i=0;i<lab.length;i++) if(lab[i]&&lab[i].includes(name)){ if(k===nth) return i; k++; } return -1; };
  const C={case:find('案號'), item:find('服務項目類別'), times:find('項目服務次數'), who:find('居服員姓名'), date:find('服務日期',1)>=0?find('服務日期',1):find('服務日期'), unit:find('服務單位'), mins:find('服務時間長度(分)'), plan:find('排班時間長度(分)'), status:find('服務狀態'), late:find('是否遲到'), price:find('項目單價'), bill:find('申報費用'), code:find('服務項目代碼'), live:find('居住(區)'), short:find('是否時數不足'), otype:find('加班類型')};
  const missing=SVC_NEED.filter((n,i)=>[C.case,C.item,C.times,C.who,C.date,C.mins][i]<0);
  if(missing.length) return {fatal:'缺少必要欄位：'+missing.join('、')};
  const dataStart=h+((rows[h+1]||[]).map(norm).includes('居服員姓名')?2:1);
  const A={rows:0,skipped:[],cases:new Set(),items:{},who:{},dates:new Set(),odd:{noOut:0,noShow:0,late:0,short:0,zero:0},mon:{},mu:{},day:{},planMin:0,ot:{},sp:{},noPrice:0,bill:0,hasBill:false};
  const isoDate=v=>{ const m=String(v).trim().match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/); return m?`${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`:(/^\d{5}$/.test(String(v).trim())?new Date(Date.UTC(1899,11,30)+ +v*864e5).toISOString().slice(0,10):''); };
  for(let r=dataStart;r<rows.length;r++){
    const x=rows[r]||[]; if(!String(x[C.case]??'').trim()) continue;
    const who=String(x[C.who]??'').trim(), d=isoDate(x[C.date]??''), m=parseFloat(x[C.mins]);
    if(!who||!d||!isFinite(m)){ A.skipped.push(r+1); continue; }
    A.rows++; A.cases.add(String(x[C.case]).trim()); A.dates.add(d);
    const cid=String(x[C.case]).trim(), mo=d.slice(0,7), un=(C.unit>=0?String(x[C.unit]??'').trim():'')||'（未填服務單位）';
    const M=A.mon[mo]=A.mon[mo]||{cases:new Set(),rows:0,min:0,who:new Set()}; M.cases.add(cid); M.rows++; M.min+=m; M.who.add(who);
    const U=((A.mu[mo]=A.mu[mo]||{})[un]=A.mu[mo][un]||{cases:new Set(),rows:0,min:0,who:new Set()}); U.cases.add(cid); U.rows++; U.min+=m; U.who.add(who);
    const it=String(x[C.item]??'').trim()||'（未填）', nt0=parseFloat(x[C.times]), n=isFinite(nt0)?nt0:1;   // 次數 0＝排班已排但當天沒做（仁寶仍會建立記錄），不能當成 1 次
    const o=A.items[it]=A.items[it]||{n:0,min:0}; o.n+=n; o.min+=m;
    const w=A.who[who]=A.who[who]||{min:0,byDay:{}}; w.min+=m; w.byDay[d]=(w.byDay[d]||0)+m;
    const st=C.status>=0?String(x[C.status]??''):''; if(st.includes('忘簽退')) A.odd.noOut++; if(st.includes('未遇')) A.odd.noShow++;
    if(C.late>=0&&String(x[C.late]??'').trim()==='是') A.odd.late++; if(C.short>=0&&String(x[C.short]??'').trim()==='是') A.odd.short++;
    if(m===0) A.odd.zero++;
    { const pr=C.price>=0?parseFloat(String(x[C.price]??'').replace(/,/g,'')):NaN; if(!isFinite(pr)) A.noPrice++;
      const code=C.code>=0?String(x[C.code]??'').trim():'', otv=C.otype>=0?String(x[C.otype]??'').trim():'', hol=!!otv&&otv!=='正常班', amt1=(isFinite(pr)?pr:0)*n;
      const SW=((A.sp[mo]=A.sp[mo]||{})[who]=A.sp[mo][who]||{it:{},rem:new Set(),amt:0}), SI=SW.it[code||'（無代碼）']=SW.it[code||'（無代碼）']||{name:it,n:0,nh:0,amt:0,min:0};
      SI.n+=n; if(hol) SI.nh+=n; SI.amt+=amt1; SI.min+=m; SW.amt+=amt1; if(C.live>=0&&REMOTE_AREAS.some(a=>String(x[C.live]??'').includes(a))) SW.rem.add(cid);
      const bl=C.bill>=0?parseFloat(String(x[C.bill]??'').replace(/,/g,'')):NaN; if(isFinite(bl)){ A.bill+=bl; A.hasBill=true; } } const dd=A.day[d]=A.day[d]||{min:0,rows:0}; dd.min+=m; dd.rows++; const pm=C.plan>=0?parseFloat(x[C.plan]):NaN; if(isFinite(pm)) A.planMin+=pm;
    const ot=C.otype>=0?(String(x[C.otype]??'').trim()||'（未填）'):'（無此欄）'; A.ot[ot]=(A.ot[ot]||0)+m;
  }
  const spOut={}; Object.keys(A.sp).forEach(mo=>{ spOut[mo]={}; Object.keys(A.sp[mo]).forEach(w=>{ const o=A.sp[mo][w]; spOut[mo][w]={it:o.it,rem:o.rem.size,amt:o.amt}; }); });   // 個案編號只用來數人，不留在彙總裡
  const ds=[...A.dates].sort();
  const sz=o=>({cases:o.cases.size,rows:o.rows,min:o.min,who:o.who.size});   // 只留數字，不留個案編號與姓名集合
  const mon={}, mu={}; Object.keys(A.mon).forEach(k=>{ mon[k]=sz(A.mon[k]); mu[k]={}; Object.keys(A.mu[k]).forEach(u=>{ mu[k][u]=sz(A.mu[k][u]); }); });
  return {rows:A.rows, skipped:A.skipped, cases:A.cases.size, items:A.items, who:A.who, from:ds[0], to:ds[ds.length-1], odd:A.odd, mon, mu, day:A.day, planMin:A.planMin, ot:A.ot, sp:spOut, noPrice:A.noPrice, bill:A.hasBill?A.bill:null};
}

/** 彙總 → 要送給伺服器的內容：只有居服員的每日分鐘、項目、金額與各月合計；沒有個案姓名、身分證字號、案號 */
function toPayload(g, sourceName) {
  const who = {}; Object.keys(g.who).forEach(n => { who[n] = { byDay: g.who[n].byDay }; });
  return { sourceName: sourceName || '', from: g.from, to: g.to, rows: g.rows, skipped: g.skipped.length, cases: g.cases, odd: g.odd, noPrice: g.noPrice || 0, mon: g.mon, mu: g.mu, who, sp: g.sp };
}
window.SvcParse = { xlsxRead, csvRead, svcAggregate, toPayload };
