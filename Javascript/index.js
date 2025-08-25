// ---------- Helpers ----------
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const storageKey = 'mediaLibraryItems.v1';
const byId = id => document.getElementById(id);

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function saveAll(items){ localStorage.setItem(storageKey, JSON.stringify(items)); }
function loadAll(){ try { return JSON.parse(localStorage.getItem(storageKey)||'[]'); } catch { return []; } }
function starsText(n){ return '★'.repeat(n) + '☆'.repeat(5-n); }

function readFileAsDataURL(file){
  return new Promise((res,rej)=>{ 
    const r=new FileReader(); 
    r.onload=()=>res(r.result); 
    r.onerror=rej; 
    r.readAsDataURL(file); 
  });
}

// optioneel verklein JPG
async function maybeShrinkJPG(dataUrl, maxW=1200){
  return new Promise((resolve)=>{
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      if(scale === 1){ return resolve(dataUrl); }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = dataUrl;
  });
}

// rating widget
function renderRatingInput(el, current=0){
  el.innerHTML = '';
  for(let i=5;i>=1;i--){
    const wrap = document.createElement('span');
    wrap.className='star';
    wrap.innerHTML = `
      <input type="radio" id="r${i}" name="rating" value="${i}" ${current===i?'checked':''}>
      <label for="r${i}" title="${i} ster${i>1?'ren':''}">
        <svg viewBox="0 0 24 24" fill="${current>=i?'gold':'#333'}" stroke="#888">
          <path d="M12 .587l3.668 7.431 8.2 1.192-5.934 5.787 1.401 8.168L12 18.897l-7.335 3.868 1.401-8.168L.132 9.21l8.2-1.192z"/>
        </svg>
      </label>`;
    el.appendChild(wrap);
  }
}

// ---------- Formulierpagina ----------
function initFormPage(){
  let items = loadAll();
  let editId = null;

  const form = byId('itemForm');
  const fileInput = byId('file');
  const thumb = byId('thumb');
  const pickBtn = byId('pickBtn');
  const drop = byId('drop');
  const saveBtn = byId('saveBtn');
  const resetBtn = byId('resetBtn');
  const ratingEl = byId('ratingInput');
  renderRatingInput(ratingEl, 0);

  pickBtn.addEventListener('click',()=>fileInput.click());
  ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev, e=>{e.preventDefault(); drop.style.borderColor='var(--acc)'}));
  ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev, e=>{e.preventDefault(); drop.style.borderColor='#343853'}));
  drop.addEventListener('drop', e=>{
    const f = e.dataTransfer.files?.[0];
    if(f) handleFile(f);
  });
  fileInput.addEventListener('change', e=>{
    const f = e.target.files?.[0];
    if(f) handleFile(f);
  });

  async function handleFile(file){
    if(!/jpe?g$/i.test(file.name)){
      alert('Alleen JPG/JPEG bestanden zijn toegestaan.');
      fileInput.value = '';
      return;
    }
    const dataUrl = await readFileAsDataURL(file);
    const shrunk = await maybeShrinkJPG(dataUrl, 1200);
    thumb.innerHTML = `<img alt="Preview" src="${shrunk}">`;
    thumb.dataset.src = shrunk;
  }

  resetBtn.addEventListener('click', ()=>{
    form.reset();
    renderRatingInput(ratingEl, 0);
    thumb.innerHTML = '<small>Geen<br>afbeelding</small>';
    delete thumb.dataset.src;
    editId = null; saveBtn.textContent = 'Opslaan';
  });

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const type = byId('type').value.trim();
    const title = byId('title').value.trim();
    const tags = byId('tags').value.trim();
    const date = byId('date').value;
    const rating = Number((new FormData(form)).get('rating')||0);
    const image = thumb.dataset.src || '';

    if(!title){ alert('Titel is verplicht.'); return; }

    const payload = { id: editId || uid(), type, title, tags, date, rating, image, createdAt: Date.now() };

    if(editId){
      const i = items.findIndex(x=>x.id===editId);
      if(i>-1) items[i] = { ...items[i], ...payload };
    } else {
      items.unshift(payload);
    }
    saveAll(items);
    window.location.href = "index.html";
  });

  // check of we een edit-id in URL hebben
  const params = new URLSearchParams(location.search);
  const edit = params.get("edit");
  if(edit){
    const it = items.find(x=>x.id===edit); 
    if(it){
      editId = edit;
      byId('type').value = it.type; 
      byId('title').value = it.title; 
      byId('tags').value = it.tags||''; 
      byId('date').value = it.date || '';
      renderRatingInput(ratingEl, it.rating||0);
      if(it.image){ 
        thumb.innerHTML = `<img alt="Preview" src="${it.image}">`; 
        thumb.dataset.src = it.image; 
      }
      saveBtn.textContent = "Bijwerken";
    }
  }
}

// ---------- Lijstpagina ----------
function initListPage(){
  let items = loadAll();

  const cardsEl = byId('cards');
  const emptyEl = byId('empty');
  const searchEl = byId('search');
  const filterType = byId('filterType');
  const filterRating = byId('filterRating');
  const sortEl = byId('sort');

  searchEl.addEventListener('input', renderList);
  filterType.addEventListener('change', renderList);
  filterRating.addEventListener('change', renderList);
  sortEl.addEventListener('change', renderList);

  function applyFilters(arr){
    const q = searchEl.value.trim().toLowerCase();
    const t = filterType.value;
    const minR = Number(filterRating.value||0);
    let out = arr.filter(it=>{
      const inType = !t || it.type===t;
      const s = (it.title + ' ' + (it.tags||'')).toLowerCase();
      const inSearch = !q || s.includes(q);
      const inRating = (it.rating||0) >= minR;
      return inType && inSearch && inRating;
    });
    switch(sortEl.value){
      case 'created_asc': out.sort((a,b)=>a.createdAt-b.createdAt); break;
      case 'rating_desc': out.sort((a,b)=>(b.rating||0)-(a.rating||0)); break;
      case 'rating_asc': out.sort((a,b)=>(a.rating||0)-(b.rating||0)); break;
      case 'title_asc': out.sort((a,b)=>a.title.localeCompare(b.title)); break;
      case 'title_desc': out.sort((a,b)=>b.title.localeCompare(a.title)); break;
      default: out.sort((a,b)=>b.createdAt-a.createdAt);
    }
    return out;
  }

  function renderList(){
    const data = applyFilters(items);
    cardsEl.innerHTML = '';
    emptyEl.style.display = data.length ? 'none':'block';
    const tpl = byId('mediaTemplate');
    data.forEach(it=>{
      const node = tpl.content.cloneNode(true);
      const el = node.querySelector('.media');
      el.dataset.id = it.id;
      const img = node.querySelector('img');
      img.src = it.image || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250"><rect width="100%" height="100%" fill="%23101627"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%239aa1b2" font-family="sans-serif" font-size="18">Geen afbeelding</text></svg>';
      node.querySelector('.type').textContent = it.type;
      node.querySelector('.title').textContent = it.title;
      node.querySelector('.tags').textContent = it.tags ? '#'+it.tags.split(',').map(s=>s.trim()).filter(Boolean).join('  #') : '';
      node.querySelector('.desc').textContent = it.date ? `📅 ${it.date}` : '';
      node.querySelector('.stars-text').textContent = starsText(it.rating||0);

      node.querySelector('.edit').addEventListener('click', ()=> {
        window.location.href = "toevoegen.html?edit="+it.id;
      });
      node.querySelector('.del').addEventListener('click', ()=> deleteItem(it.id));
      cardsEl.appendChild(node);
    });
  }

  function deleteItem(id){
    if(!confirm('Item verwijderen?')) return;
    items = items.filter(x=>x.id!==id);
    saveAll(items); renderList();
  }

  renderList();
}
