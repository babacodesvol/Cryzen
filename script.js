/* ====== EDIT THIS: paste your Google Form link ====== */
const FEEDBACK_URL='https://docs.google.com/forms/d/e/1FAIpQLSdexGijakEXNoQblei7UYJ6iNodMlbaPDLHE4meOreM-pSEIA/viewform?usp=dialog';
const $=id=>document.getElementById(id);
$('feedbackLink').href=FEEDBACK_URL;
const LS={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}};
let users=LS.get('ft_users',null)||[{name:'Admin',email:'admin@college.edu',pass:'admin123',role:'admin',sem:0,phone:'',contact:'admin@college.edu'}];
[{name:'Demo Student',email:'student@college.edu',pass:'student123',role:'user',sem:3,phone:'9876543210',contact:'student@gmail.com'}].forEach(d=>{if(!users.some(u=>u.email===d.email))users.push(d)});
let reports=LS.get('ft_reports',[]);
let me=LS.get('ft_me',null),role='user',mode='login',photoData='',geo=null;
const mem={users,reports}; // fallback if storage is blocked
const save=()=>{LS.set('ft_users',users);LS.set('ft_reports',reports)};
const CATS=['Electrical','Network','Bathroom','Room','Furniture','Others'];
const LOCS={'Academic Block':{'Block I':['Room','Lab','No.','Bathroom'],'Block II':['Room','Lab','Bathroom'],'Block III':['Room','Lab','Bathroom'],'Block IV':['Room','Lab','Bathroom']},
'Library':['Room','Bathroom'],'Fields / Sport Area':['Football','Volleyball','Cricket'],'Hostel':['Papum','Lohit-1','Lohit-2','Subhanshree']};
const semNow=()=>{const d=new Date();return d.getFullYear()+(d.getMonth()<6?' Spring':' Autumn')};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fill=(el,arr,ph)=>{el.innerHTML=(ph?`<option value="">${ph}</option>`:'')+arr.map(a=>`<option>${esc(a)}</option>`).join('')};

/* auth */
fill($('fSem'),[1,2,3,4,5,6,7,8]);
document.querySelectorAll('#roleTabs button').forEach(b=>b.onclick=()=>{role=b.dataset.r;tab('roleTabs',b);setAuth()});
document.querySelectorAll('#modeTabs button').forEach(b=>b.onclick=()=>{mode=b.dataset.m;tab('modeTabs',b);setAuth()});
function tab(id,b){document.querySelectorAll('#'+id+' button').forEach(x=>x.classList.toggle('on',x===b))}
function setAuth(){
 const su=mode==='signup'&&role==='user';
 $('signupOnly').classList.toggle('hidden',!su);
 $('modeTabs').classList.toggle('hidden',role==='admin');
 if(role==='admin')mode='login';
 $('authBtn').textContent=mode==='signup'&&role==='user'?'Create account':(role==='admin'?'Admin sign in':'Log in');
 $('authMsg').textContent='';
}
const msg=(t,ok)=>{const m=$('authMsg');m.textContent=t;m.className='msg'+(ok?' ok':'')};
$('authBtn').onclick=()=>{
 const email=$('fEmail').value.trim().toLowerCase(),pass=$('fPass').value;
 if(!email||!pass)return msg('Enter your college email and password.');
 if(mode==='signup'&&role==='user'){
  const name=$('fName').value.trim(),phone=$('fPhone').value.trim(),contact=$('fContact').value.trim();
  if(!name)return msg('Enter your name.');
  if(!/^[^@\s]+@[^@\s]+\.(edu|ac\.in|edu\.in)$/.test(email))return msg('Use your college email (ending in .edu or .ac.in).');
  if(pass.length<6)return msg('Password needs at least 6 characters.');
  if(!/^[0-9+\-\s]{8,15}$/.test(phone))return msg('Enter a valid phone number.');
  if(!/^\S+@\S+\.\S+$/.test(contact))return msg('Enter a valid contact email.');
  if(users.some(u=>u.email===email))return msg('This email is already registered. Log in instead.');
  const u={name,email,pass,role:'user',sem:+$('fSem').value,phone,contact};
  users.push(u);save();return enter(u);
 }
 const u=users.find(u=>u.email===email&&u.pass===pass&&u.role===role);
 if(!u)return msg(role==='admin'?'Admin credentials not recognised.':'Email or password is wrong.');
 enter(u);
};
$('forgot').onclick=()=>{
 const email=$('fEmail').value.trim().toLowerCase();
 if(!email)return msg('Type your college email first, then press Forgot password.');
 const u=users.find(u=>u.email===email);
 msg(u?'Reset link sent to '+u.contact+' (demo: no real email is sent).':'No account found for that email.',!!u);
};
function enter(u){me=u;LS.set('ft_me',u.email);render();}
$('logout').onclick=()=>{me=null;LS.set('ft_me',null);$('menu').classList.add('hidden');$('app').classList.add('hidden');$('auth').classList.remove('hidden');$('fPass').value=''};

/* main */
function render(){
 $('auth').classList.add('hidden');$('app').classList.remove('hidden');
 $('avBtn').textContent=me.name.trim()[0].toUpperCase();
 const rows=me.role==='admin'?[['Name',me.name],['Role','Administrator'],['Email',me.email]]:[['Name',me.name],['College email',me.email],['Semester',me.sem+' of 8'],['Contact',me.contact+(me.phone?' · '+me.phone:'')]];
 $('info').innerHTML=rows.map(r=>`<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('');
 const cur=reports.filter(r=>r.term===semNow());
 $('semLabel').textContent='Counts for '+semNow()+' term. They restart every semester.';
 $('cNew').textContent=cur.filter(r=>r.status==='new').length;
 $('cProc').textContent=cur.filter(r=>r.status==='proc').length;
 $('cDone').textContent=cur.filter(r=>r.status==='done').length;
 const admin=me.role==='admin';
 $('plus').closest('.hero').classList.toggle('hidden',admin);
 $('listTitle').textContent=admin?'All reports':'My reports';
 const mine=admin?reports:reports.filter(r=>r.by===me.email);
 $('list').innerHTML=mine.length?mine.slice().reverse().map(r=>`<article class="item"><img src="${r.photo}" alt="Issue photo"><div>
  <h3>${esc(r.cat)}${r.loc?' · '+esc(r.loc):''}</h3><p>${esc(r.desc)}</p>
  <p>${new Date(r.at).toLocaleDateString()}${admin?' · '+esc(r.byName):''}${r.geo?` · <a href="https://www.google.com/maps?q=${r.geo}" target="_blank" rel="noopener">map</a>`:''}</p>
  ${admin?`<select data-id="${r.id}" aria-label="Status"><option value="new"${r.status==='new'?' selected':''}>Reported</option><option value="proc"${r.status==='proc'?' selected':''}>Under process</option><option value="done"${r.status==='done'?' selected':''}>Solved</option></select>`
  :`<span class="badge b-${r.status}">${{new:'Reported',proc:'Under process',done:'Solved'}[r.status]}</span>`}</div></article>`).join('')
  :'<div class="empty">'+(admin?'No reports yet.':'You have not reported anything yet. Press + to report your first issue.')+'</div>';
 document.querySelectorAll('.item select').forEach(s=>s.onchange=()=>{const r=reports.find(x=>x.id==s.dataset.id);r.status=s.value;save();render()});
}
$('avBtn').onclick=e=>{e.stopPropagation();const m=$('menu');m.classList.toggle('hidden');$('avBtn').setAttribute('aria-expanded',!m.classList.contains('hidden'))};
document.addEventListener('click',e=>{if(!e.target.closest('.profile'))$('menu').classList.add('hidden')});
$('themeBtn').onclick=()=>{const d=document.documentElement,dark=d.dataset.theme?d.dataset.theme==='dark':matchMedia('(prefers-color-scheme:dark)').matches;d.dataset.theme=dark?'light':'dark'};

/* report modal */
fill($('cat'),CATS);fill($('loc1'),Object.keys(LOCS),'Select area');
$('loc1').onchange=()=>{
 const v=LOCS[$('loc1').value],a=$('loc2'),b=$('loc3');
 a.classList.add('hidden');b.classList.add('hidden');
 if(!v)return;
 if(Array.isArray(v)){fill(a,v,'Select place');a.classList.remove('hidden')}
 else{fill(a,Object.keys(v),'Select block');a.classList.remove('hidden')}
};
$('loc2').onchange=()=>{const v=LOCS[$('loc1').value];if(Array.isArray(v))return;const s=v[$('loc2').value];if(s){fill($('loc3'),s,'Select spot');$('loc3').classList.remove('hidden')}else $('loc3').classList.add('hidden')};
$('plus').onclick=()=>{$('ov').classList.remove('hidden');$('rMsg').textContent=''};
const closeM=()=>{$('ov').classList.add('hidden')};
$('mx').onclick=closeM;$('ov').onclick=e=>{if(e.target===$('ov'))closeM()};
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeM()});
$('photo').onchange=e=>{
 const f=e.target.files[0];if(!f)return;
 const img=new Image,url=URL.createObjectURL(f);
 img.onload=()=>{const s=Math.min(1,480/img.width),c=document.createElement('canvas');c.width=img.width*s;c.height=img.height*s;
  c.getContext('2d').drawImage(img,0,0,c.width,c.height);photoData=c.toDataURL('image/jpeg',.6);
  $('prev').src=photoData;$('prev').classList.remove('hidden');$('dropTxt').textContent='Photo added. Tap to change.';URL.revokeObjectURL(url)};
 img.src=url;
};
$('geo').onclick=()=>{
 if(!navigator.geolocation){$('geoTxt').textContent='Location is not supported on this device.';return}
 $('geoTxt').textContent='Finding you…';
 navigator.geolocation.getCurrentPosition(p=>{geo=p.coords.latitude.toFixed(5)+','+p.coords.longitude.toFixed(5);$('geoTxt').textContent='Location saved: '+geo},
  ()=>{$('geoTxt').textContent='Could not get location. Allow location access or pick an area above.'},{enableHighAccuracy:true,timeout:10000});
};
$('submit').onclick=()=>{
 const m=$('rMsg');m.className='msg';
 if(!photoData)return m.textContent='Add a photo of the problem.';
 const desc=$('desc').value.trim();if(!desc)return m.textContent='Describe the problem.';
 const loc=[$('loc1').value,$('loc2').value,$('loc3').value].filter(Boolean).join(' › ');
 reports.push({id:Date.now(),by:me.email,byName:me.name,photo:photoData,desc,cat:$('cat').value,loc,geo,status:'new',term:semNow(),at:Date.now()});
 if(!LS.set('ft_reports',reports)){reports.pop();return m.textContent='Storage is full. Ask an admin to clear old reports.'}
 photoData='';geo=null;$('photo').value='';$('desc').value='';$('prev').classList.add('hidden');$('dropTxt').textContent='Tap to take or upload a photo';
 $('loc1').value='';$('loc1').onchange();$('geoTxt').textContent='';
 closeM();render();
};

document.querySelectorAll('[data-demo]').forEach(b=>b.onclick=()=>{
 const a=b.dataset.demo==='admin';
 role=a?'admin':'user';mode='login';
 tab('roleTabs',document.querySelector('#roleTabs [data-r="'+role+'"]'));tab('modeTabs',document.querySelector('#modeTabs [data-m="login"]'));
 $('fEmail').value=a?'admin@college.edu':'student@college.edu';$('fPass').value=a?'admin123':'student123';setAuth();
});
save();setAuth();
if(me){const u=users.find(u=>u.email===me);if(u)enter(u)}
