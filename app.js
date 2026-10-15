// app.js - Admin interface logic (browser)
// Improved: non-modal UX, conflict retry + merge, watermark options, delete-old-photo option, undo delete, combos CRUD
// Added: client-side HEIC -> WEBP conversion using heic2any when needed

import { generateRemitoPDF } from './pdf-generator.js';

const STATUS = document.getElementById('status');
let statusTimer = null;
let lastRemoved = null;

function showStatus(text, level = 'ok', actionText = null, actionCallback = null){
  STATUS.innerHTML = '';
  const span = document.createElement('span'); span.textContent = text;
  STATUS.appendChild(span);
  if (actionText && actionCallback){
    const btn = document.createElement('button');
    btn.className = 'ml-4 underline text-sm';
    btn.textContent = actionText;
    btn.addEventListener('click', actionCallback);
    STATUS.appendChild(btn);
  }
  STATUS.className = 'mb-6 p-3 rounded ' + (level === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800');
  STATUS.classList.remove('hidden');
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(()=>{ STATUS.classList.add('hidden'); }, 8000);
}

// Config inputs
const inputToken = document.getElementById('input-token');
const inputOwner = document.getElementById('input-target-owner');
const inputRepo = document.getElementById('input-target-repo');

let GITHUB_TOKEN = undefined;
function getAuthHeaders(){
  const headers = { 'Accept': 'application/vnd.github+json' };
  if (GITHUB_TOKEN) headers['Authorization'] = `token ${GITHUB_TOKEN}`;
  return headers;
}

// load external script helper
function loadScript(src){
  return new Promise((resolve, reject)=>{
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script'); s.src = src; s.onload = () => resolve(); s.onerror = () => reject(new Error('Failed to load ' + src)); document.head.appendChild(s);
  });
}

// ensure heic2any is available (used to convert HEIC to webp in-browser)
async function ensureHeicConverter(){
  if (window.heic2any) return window.heic2any;
  try{
    await loadScript('https://unpkg.com/heic2any@0.5.2/dist/heic2any.min.js');
    if (window.heic2any) return window.heic2any;
    throw new Error('heic2any not available');
  }catch(e){
    throw new Error('No se pudo cargar el convertidor HEIC: ' + e.message);
  }
}

// Basic GitHub Contents helper
async function github_getFile(owner, repo, path){
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return await res.json();
}

async function github_putFile(owner, repo, path, contentBase64, message, sha=null){
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const body = { message, content: contentBase64 };
  if (sha) body.sha = sha;
  const res = await fetch(url, { method: 'PUT', headers: Object.assign({'Content-Type':'application/json'}, getAuthHeaders()), body: JSON.stringify(body) });
  if (!res.ok) {
    const txt = await res.text();
    const err = new Error(`PUT ${path} -> ${res.status} ${txt}`);
    err.status = res.status;
    throw err;
  }
  return await res.json();
}

async function github_deleteFile(owner, repo, path, message, sha){
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const body = { message, sha };
  const res = await fetch(url, { method: 'DELETE', headers: Object.assign({'Content-Type':'application/json'}, getAuthHeaders()), body: JSON.stringify(body) });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`DELETE ${path} -> ${res.status} ${txt}`);
  }
  return await res.json();
}

// UI elements
const btnRefresh = document.getElementById('btn-refresh');
const btnNew = document.getElementById('btn-new');
const productsList = document.getElementById('products-list');
const categoriesSelect = document.getElementById('categories-select');
const btnAddCategory = document.getElementById('btn-add-category');
const newCategoryInput = document.getElementById('new-category');
const searchInput = document.getElementById('search');
const editor = document.getElementById('editor');
const form = document.getElementById('product-form');
const editorTitle = document.getElementById('editor-title');
const btnCancel = document.getElementById('btn-cancel');

// combos UI
const combosSelect = document.getElementById('combos-select');
const btnEditCombo = document.getElementById('btn-edit-combo');
const btnNewCombo = document.getElementById('btn-new-combo');
const btnDeleteCombo = document.getElementById('btn-delete-combo');
const comboEditor = document.getElementById('combo-editor');
const comboForm = document.getElementById('combo-form');
const btnCancelCombo = document.getElementById('btn-cancel-combo');

const remitoPanel = document.getElementById('remito-panel');
const btnOpenRemito = document.getElementById('btn-open-remito');
const remitoItems = document.getElementById('remito-items');
const remitoSearch = document.getElementById('remito-search');
const btnAddToRemito = document.getElementById('btn-add-to-remito');
const btnGenerateRemito = document.getElementById('btn-generate-remito');
const btnCancelRemito = document.getElementById('btn-cancel-remito');
const watermarkTextInput = document.getElementById('watermark-text');
const watermarkFileInput = document.getElementById('watermark-file');

let products = [];
let combos = [];
let categories = new Set();
let currentEdit = null; // index or null for products
let currentComboEdit = null; // index or null for combos
let remitoList = [];

// helpers
function normalizePrice(value){
  if (value == null) return null;
  const n = String(value).replace(/[^0-9,\.]/g,'').replace(/,/g,'.');
  const num = Number.parseFloat(n);
  return Number.isFinite(num) ? num : null;
}
function toCurrencyAR(num){
  if (num == null) return 'Consultar precio';
  return '$' + num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// load products & combos from target repo
async function loadFromRepo(){
  GITHUB_TOKEN = inputToken.value.trim() || undefined;
  const owner = inputOwner.value.trim();
  const repo = inputRepo.value.trim();
  try{
    showStatus('Cargando datos desde repo...', 'ok');
    const file = await github_getFile(owner, repo, 'datos-productos.json');
    const raw = atob(file.content.replace(/\n/g,''));
    products = JSON.parse(raw);
    // combos.json optional
    try{
      const cfile = await github_getFile(owner, repo, 'combos.json');
      combos = JSON.parse(atob(cfile.content.replace(/\n/g,'')));
    }catch(e){ combos = []; }

    // build categories set
    categories = new Set(products.map(p => p.categoria).filter(Boolean));
    renderCategories();
    renderList();
    renderCombosSelect();
    showStatus('Datos cargados.');
  }catch(err){
    console.error(err);
    showStatus('Error cargando datos: '+err.message, 'err');
  }
}

function renderCategories(){
  categoriesSelect.innerHTML = '';
  const optAll = document.createElement('option'); optAll.value=''; optAll.textContent='(Sin filtro)'; categoriesSelect.appendChild(optAll);
  Array.from(categories).sort().forEach(cat => {
    const o = document.createElement('option'); o.value=cat; o.textContent=cat; categoriesSelect.appendChild(o);
  });
  // update editor select
  const sel = form.querySelector('[name=categoria]');
  sel.innerHTML = '';
  Array.from(categories).sort().forEach(cat=>{ const o = document.createElement('option'); o.value=cat; o.textContent=cat; sel.appendChild(o); });
}

function renderCombosSelect(){
  combosSelect.innerHTML = '';
  const opt = document.createElement('option'); opt.value=''; opt.textContent='(Seleccionar combo)'; combosSelect.appendChild(opt);
  combos.forEach((c, idx)=>{
    const o = document.createElement('option'); o.value = String(idx); o.textContent = c.titulo || `Combo ${idx+1}`; combosSelect.appendChild(o);
  });
}

function renderList(){
  productsList.innerHTML = '';
  const q = searchInput.value.trim().toLowerCase();
  products.forEach((p, idx) =>{
    if (q){ const s = (p.articulo+' '+p.codigo+' '+(p.categoria||'')).toLowerCase(); if (!s.includes(q)) return; }
    const el = document.createElement('div'); el.className='p-3 border rounded flex gap-3 items-center';
    el.innerHTML = `<div class="flex-1">\n      <div class="text-sm font-semibold">${escapeHtml(p.articulo)}</div>\n      <div class="text-xs text-gray-500">${escapeHtml(p.codigo)} • ${escapeHtml(p.categoria||'')}</div>\n    </div>\n    <div class="flex gap-2">\n      <button data-idx='${idx}' class="edit-btn px-2 py-1 bg-indigo-600 text-white rounded">Editar</button>\n      <button data-idx='${idx}' class="delete-btn px-2 py-1 bg-red-600 text-white rounded">Borrar</button>\n    </div>`;
    productsList.appendChild(el);
  });
  // attach handlers
  productsList.querySelectorAll('.edit-btn').forEach(b=>b.addEventListener('click', e=> openEditor(Number(e.currentTarget.dataset.idx))));
  productsList.querySelectorAll('.delete-btn').forEach(b=>b.addEventListener('click', e=> softDeleteProduct(Number(e.currentTarget.dataset.idx))));
}

function escapeHtml(s){ return String(s||'').replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'})[c]); }

function openEditor(idx=null){
  currentEdit = idx;
  editor.classList.remove('hidden');
  form.reset();
  document.getElementById('delete-old-photo').checked = true;
  if (idx == null){ editorTitle.textContent = 'Nuevo producto'; }
  else{ editorTitle.textContent = 'Editar producto'; const p = products[idx]; form.articulo.value = p.articulo || ''; form.codigo.value = p.codigo || ''; form.precio_combo.value = (p['precio combo']||'').replace(/[^0-9,\.]/g,''); form.venta_por_menor.value = (p['venta por menor']||'').replace(/[^0-9,\.]/g,''); form.categoria.value = p.categoria||''; form.descripcion.value = p.descripcion||''; }
}

function softDeleteProduct(idx){
  // remove and store for undo
  lastRemoved = { type: 'product', item: products[idx], index: idx };
  products.splice(idx,1);
  renderList();
  showStatus('Producto eliminado. ', 'ok', 'Deshacer', ()=>{
    if (lastRemoved && lastRemoved.type === 'product'){ products.splice(lastRemoved.index,0,lastRemoved.item); renderList(); lastRemoved = null; showStatus('Eliminación revertida.'); }
  });
  // clear lastRemoved after timeout
  setTimeout(()=>{ if (lastRemoved && lastRemoved.type === 'product') lastRemoved = null; }, 8000);
}

async function saveProductsToRepo(message){
  const owner = inputOwner.value.trim();
  const repo = inputRepo.value.trim();
  let attempts = 0;
  while (attempts < 4){
    attempts++;
    try{
      const file = await github_getFile(owner, repo, 'datos-productos.json');
      const sha = file.sha;
      const content = JSON.stringify(products, null, 2);
      const b64 = btoa(unescape(encodeURIComponent(content)));
      await github_putFile(owner, repo, 'datos-productos.json', b64, message, sha);
      showStatus('datos-productos.json actualizado.');
      return;
    }catch(err){
      if (err.status === 409 || err.message && err.message.includes('409')){
        // conflict - fetch latest and merge by codigo
        try{
          const latest = await github_getFile(owner, repo, 'datos-productos.json');
          const raw = atob(latest.content.replace(/\n/g,''));
          const latestProducts = JSON.parse(raw);
          const mapLatest = new Map(latestProducts.map(p=>[p.codigo, p]));
          // merge: for each local product, overwrite by codigo; then add any latest products not overwritten
          const mergedMap = new Map(mapLatest);
          products.forEach(p=> mergedMap.set(p.codigo, p));
          const merged = Array.from(mergedMap.values());
          products = merged; // update local
          // try again with new merged content
          const content = JSON.stringify(products, null, 2);
          const b64 = btoa(unescape(encodeURIComponent(content)));
          await github_putFile(owner, repo, 'datos-productos.json', b64, message, latest.sha);
          showStatus('datos-productos.json actualizado (merge de conflicto).');
          return;
        }catch(e){ console.warn('Merge failed', e); }
      }
      // if not conflict or merge failed, maybe file missing -> create
      if (err.message && err.message.includes('GET datos-productos.json')){
        try{
          const content = JSON.stringify(products, null, 2);
          const b64 = btoa(unescape(encodeURIComponent(content)));
          await github_putFile(owner, repo, 'datos-productos.json', b64, message, null);
          showStatus('datos-productos.json creado.');
          return;
        }catch(e){ console.error(e); showStatus('Error guardando datos: '+e.message,'err'); throw e; }
      }
      if (attempts >= 4) { console.error(err); showStatus('Error guardando datos después de varios intentos: '+err.message,'err'); throw err; }
      // backoff
      await new Promise(r=>setTimeout(r, 500 * attempts));
    }
  }
}

// Combos functions: CRUD and save
function openComboEditor(idx=null){
  currentComboEdit = idx;
  comboEditor.classList.remove('hidden');
  comboForm.reset();
  if (idx == null){ document.getElementById('combo-editor-title').textContent = 'Nuevo combo'; }
  else{ document.getElementById('combo-editor-title').textContent = 'Editar combo'; const c = combos[idx]; comboForm.titulo.value = c.titulo || ''; comboForm.articulos.value = (Array.isArray(c.articulos)? c.articulos.join(',') : ''); }
}

function softDeleteCombo(idx){
  lastRemoved = { type: 'combo', item: combos[idx], index: idx };
  combos.splice(idx,1);
  renderCombosSelect();
  showStatus('Combo eliminado. ', 'ok', 'Deshacer', ()=>{
    if (lastRemoved && lastRemoved.type === 'combo'){ combos.splice(lastRemoved.index,0,lastRemoved.item); renderCombosSelect(); lastRemoved = null; showStatus('Eliminación revertida.'); }
  });
  setTimeout(()=>{ if (lastRemoved && lastRemoved.type === 'combo') lastRemoved = null; }, 8000);
}

async function saveCombosToRepo(message){
  const owner = inputOwner.value.trim();
  const repo = inputRepo.value.trim();
  let attempts = 0;
  while (attempts < 4){
    attempts++;
    try{
      const file = await github_getFile(owner, repo, 'combos.json');
      const sha = file.sha;
      const content = JSON.stringify(combos, null, 2);
      const b64 = btoa(unescape(encodeURIComponent(content)));
      await github_putFile(owner, repo, 'combos.json', b64, message, sha);
      showStatus('combos.json actualizado.');
      return;
    }catch(err){
      if (err.status === 409 || err.message && err.message.includes('409')){
        try{
          const latest = await github_getFile(owner, repo, 'combos.json');
          const raw = atob(latest.content.replace(/\n/g,''));
          const latestCombos = JSON.parse(raw);
          // simple merge by titulo
          const map = new Map(latestCombos.map(c=>[c.titulo, c]));
          combos.forEach(c=> map.set(c.titulo, c));
          combos = Array.from(map.values());
          const content = JSON.stringify(combos, null, 2);
          const b64 = btoa(unescape(encodeURIComponent(content)));
          await github_putFile(owner, repo, 'combos.json', b64, message, latest.sha);
          showStatus('combos.json actualizado (merge de conflicto).');
          renderCombosSelect();
          return;
        }catch(e){ console.warn('Merge combos failed', e); }
      }
      if (err.message && err.message.includes('GET combos.json')){
        try{
          const content = JSON.stringify(combos, null, 2);
          const b64 = btoa(unescape(encodeURIComponent(content)));
          await github_putFile(owner, repo, 'combos.json', b64, message, null);
          showStatus('combos.json creado.');
          renderCombosSelect();
          return;
        }catch(e){ console.error(e); showStatus('Error guardando combos: '+e.message,'err'); throw e; }
      }
      if (attempts >= 4) { console.error(err); showStatus('Error guardando combos después de varios intentos: '+err.message,'err'); throw err; }
      await new Promise(r=>setTimeout(r, 500 * attempts));
    }
  }
}

comboForm.addEventListener('submit', async (ev)=>{
  ev.preventDefault();
  const fd = new FormData(comboForm);
  const titulo = fd.get('titulo').trim();
  const articulosRaw = fd.get('articulos').trim();
  let fotoFile = fd.get('foto');
  if (!titulo){ showStatus('Título requerido', 'err'); return; }
  const articulos = articulosRaw ? articulosRaw.split(',').map(s=>s.trim()).filter(Boolean) : [];

  const newCombo = { titulo, articulos: articulos, foto: null };
  const owner = inputOwner.value.trim(); const repo = inputRepo.value.trim();
  try{
    if (fotoFile && fotoFile.size){
      // convert HEIC to webp if needed
      const originalName = fotoFile.name || '';
      let ext = (originalName.split('.').pop() || '').toLowerCase();
      if (ext === 'heic'){
        try{
          const converter = await ensureHeicConverter();
          const convBlob = await converter({ blob: fotoFile, toType: 'image/webp', quality: 0.9 });
          fotoFile = new File([convBlob], titulo.replace(/\s+/g,'-').toUpperCase() + '.webp', { type: 'image/webp' });
          ext = 'webp';
        }catch(e){ showStatus('No se pudo convertir HEIC -> WEBP. Convierte la imagen antes de subir.', 'err'); throw e; }
      }

      const filename = titulo.replace(/\s+/g,'-').toUpperCase() + '.' + ext;
      const arrayBuf = await fotoFile.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuf);
      try{
        const existing = await github_getFile(owner, repo, 'imagenes/'+filename);
        await github_putFile(owner, repo, 'imagenes/'+filename, base64, `Actualizar imagen ${filename}`, existing.sha);
      }catch(e){
        await github_putFile(owner, repo, 'imagenes/'+filename, base64, `Subir imagen ${filename}`);
      }
      newCombo.foto = filename;
    } else if (currentComboEdit != null){
      newCombo.foto = combos[currentComboEdit].foto || null;
    }

    if (currentComboEdit == null){ combos.push(newCombo); }
    else{ combos[currentComboEdit] = Object.assign({}, combos[currentComboEdit], newCombo); }

    await saveCombosToRepo(currentComboEdit==null? `Agregar combo ${titulo}` : `Editar combo ${titulo}`);
    renderCombosSelect(); comboEditor.classList.add('hidden'); showStatus('Combo guardado.');
  }catch(err){ console.error(err); showStatus('Error guardando combo: '+err.message, 'err'); }
});

btnCancelCombo.addEventListener('click', ()=>{ comboEditor.classList.add('hidden'); });
btnNewCombo.addEventListener('click', ()=> openComboEditor(null));
btnEditCombo.addEventListener('click', ()=>{
  const sel = combosSelect.value; if (!sel) { showStatus('Selecciona un combo para editar', 'err'); return; } openComboEditor(Number(sel));
});
btnDeleteCombo.addEventListener('click', ()=>{
  const sel = combosSelect.value; if (!sel) { showStatus('Selecciona un combo para borrar', 'err'); return; } softDeleteCombo(Number(sel)); saveCombosToRepo('Eliminar combo');
});

// product form submit (unchanged) - existing logic
form.addEventListener('submit', async (ev)=>{
  ev.preventDefault();
  const formData = new FormData(form);
  const articulo = formData.get('articulo').trim();
  let codigo = formData.get('codigo').trim();
  const precio_combo = normalizePrice(formData.get('precio_combo'));
  const venta_por_menor = normalizePrice(formData.get('venta_por_menor'));
  const categoria = formData.get('categoria').trim();
  const descripcion = formData.get('descripcion').trim();
  let fotoFile = formData.get('foto');
  const deleteOld = document.getElementById('delete-old-photo').checked;

  if (!articulo){ showStatus('El artículo es obligatorio.', 'err'); return; }

  // generate codigo if empty -> find last
  if (!codigo){
    const nums = products.map(p=>{ const m = (p.codigo||'').match(/([A-Za-z]*)(0*)(\d+)$/); return m? Number(m[3]) : 0; });
    const max = nums.length? Math.max(...nums):0; const next = (max+1).toString().padStart(3,'0'); codigo = 'A'+next;
  }

  const newProduct = {
    articulo, codigo,
    'precio combo': precio_combo==null? null : ('$' + precio_combo.toLocaleString('es-AR',{minimumFractionDigits:2})),
    'venta por menor': venta_por_menor==null? null : ('$' + venta_por_menor.toLocaleString('es-AR',{minimumFractionDigits:2})),
    categoria: categoria || null,
    descripcion: descripcion || null,
    foto: null
  };

  const owner = inputOwner.value.trim();
  const repo = inputRepo.value.trim();

  try{
    // if photo provided, upload
    if (fotoFile && fotoFile.size){
      // convert HEIC to webp if needed
      const originalName = fotoFile.name || '';
      let ext = (originalName.split('.').pop() || '').toLowerCase();
      if (ext === 'heic'){
        try{
          const converter = await ensureHeicConverter();
          const convBlob = await converter({ blob: fotoFile, toType: 'image/webp', quality: 0.9 });
          fotoFile = new File([convBlob], codigo + '.webp', { type: 'image/webp' });
          ext = 'webp';
        }catch(e){ showStatus('No se pudo convertir HEIC -> WEBP. Convierte la imagen antes de subir.', 'err'); throw e; }
      }

      const filename = codigo + '.' + (ext==='jpeg'?'jpeg':ext);
      const arrayBuf = await fotoFile.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuf);
      // check if previous product exists to delete old photo if different and user requested
      if (currentEdit != null){
        const old = products[currentEdit];
        if (old && old.foto && old.foto !== filename && deleteOld){
          try{
            const f = await github_getFile(owner, repo, 'imagenes/'+old.foto);
            await github_deleteFile(owner, repo, 'imagenes/'+old.foto, `Eliminar imagen reemplazada ${old.foto}`, f.sha);
          }catch(e){ console.warn('No se pudo eliminar anterior:', e.message); }
        }
      }
      // upload new file (create or update)
      try{
        const existing = await github_getFile(owner, repo, 'imagenes/'+filename);
        await github_putFile(owner, repo, 'imagenes/'+filename, base64, `Actualizar imagen ${filename}`, existing.sha);
      }catch(e){
        // create
        await github_putFile(owner, repo, 'imagenes/'+filename, base64, `Subir imagen ${filename}`);
      }
      newProduct.foto = filename;
    } else if (currentEdit != null){
      newProduct.foto = products[currentEdit].foto || null;
    }

    if (currentEdit == null){ products.push(newProduct); categories.add(newProduct.categoria); }
    else{ products[currentEdit] = Object.assign({}, products[currentEdit], newProduct); categories.add(products[currentEdit].categoria); }

    await saveProductsToRepo(currentEdit==null? `Agregar producto ${newProduct.codigo}` : `Editar producto ${newProduct.codigo}`);
    renderCategories(); renderList(); editor.classList.add('hidden'); showStatus('Producto guardado.');
  }catch(err){ console.error(err); showStatus('Error guardando producto: '+err.message, 'err'); }
});

btnCancel.addEventListener('click', ()=>{ editor.classList.add('hidden'); });
btnNew.addEventListener('click', ()=>openEditor(null));
btnRefresh.addEventListener('click', ()=>loadFromRepo());

btnAddCategory.addEventListener('click', ()=>{
  const val = newCategoryInput.value.trim(); if (!val) return; categories.add(val); renderCategories(); newCategoryInput.value=''; showStatus('Categoría agregada en la UI. Guarda un producto para persistir los cambios.');
});

searchInput.addEventListener('input', ()=>renderList());

// remito logic (unchanged)
btnOpenRemito.addEventListener('click', ()=>{ remitoPanel.classList.remove('hidden'); remitoList = []; renderRemitoItems(); });
btnCancelRemito.addEventListener('click', ()=>{ remitoPanel.classList.add('hidden'); });
btnAddToRemito.addEventListener('click', ()=> addProductToRemito(remitoSearch.value.trim()));

function addProductToRemito(q){
  if (!q) return; const found = products.find(p=> p.codigo===q || (p.articulo||'').toLowerCase().includes(q.toLowerCase()));
  if (!found){ showStatus('Producto no encontrado', 'err'); return; }
  remitoList.push({ codigo: found.codigo, articulo: found.articulo, cantidad: 1, precio: normalizePrice((found['venta por menor']||'').replace(/[^0-9,\.]/g,'')) });
  renderRemitoItems(); remitoSearch.value='';
}

function renderRemitoItems(){
  remitoItems.innerHTML='';
  remitoList.forEach((it, i)=>{
    const div = document.createElement('div'); div.className='flex items-center gap-2';
    div.innerHTML = `<div class="flex-1 text-sm">${escapeHtml(it.articulo)} <span class="text-xs text-gray-500">(${escapeHtml(it.codigo)})</span></div>\n      <input data-idx='${i}' class='p-1 border rounded w-20' value='${it.cantidad}' />\n      <input data-price-idx='${i}' class='p-1 border rounded w-28' value='${it.precio||''}' />\n      <button data-del='${i}' class='px-2 py-1 bg-red-600 text-white rounded'>Quitar</button>`;
    remitoItems.appendChild(div);
  });
  remitoItems.querySelectorAll("[data-del]").forEach(b=> b.addEventListener('click', e=>{ remitoList.splice(Number(e.currentTarget.dataset.del),1); renderRemitoItems(); }));
  remitoItems.querySelectorAll("input[data-idx]").forEach(inp=> inp.addEventListener('change', e=>{ const i=Number(e.currentTarget.dataset.idx); remitoList[i].cantidad = Number(e.currentTarget.value) || 1;}));
  remitoItems.querySelectorAll("input[data-price-idx]").forEach(inp=> inp.addEventListener('change', e=>{ const i=Number(e.currentTarget.dataset.priceIdx); remitoList[i].precio = normalizePrice(e.currentTarget.value); }));
}

btnGenerateRemito.addEventListener('click', async ()=>{
  const cliente = document.getElementById('remito-cliente').value.trim();
  const direccion = document.getElementById('remito-direccion').value.trim();
  if (!cliente) { showStatus('Cliente requerido', 'err'); return; }
  if (!remitoList.length) { showStatus('Agrega al menos un producto', 'err'); return; }
  const remito = { cliente, direccion, items: remitoList, fecha: new Date().toISOString(), id: generateRemitoId() };
  try{
    let watermarkImage = null;
    if (watermarkFileInput.files && watermarkFileInput.files.length){ watermarkImage = await watermarkFileInput.files[0].arrayBuffer(); }
    const watermarkText = watermarkTextInput.value.trim() || 'RLPRODUCTOS';

    const pdfBytes = await generateRemitoPDF(remito, { watermarkText, watermarkImage, duplicate: true });
    // download
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `remito-${remito.id}.pdf`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);

    // optionally save to repo
    try{
      const owner = inputOwner.value.trim(); const repo = inputRepo.value.trim();
      const path = `remitos/remito-${remito.id}.pdf`;
      const b64 = arrayBufferToBase64(await blob.arrayBuffer());
      try{
        const existing = await github_getFile(owner, repo, path);
        await github_putFile(owner, repo, path, b64, `Actualizar remito ${remito.id}`, existing.sha);
      }catch(e){
        await github_putFile(owner, repo, path, b64, `Agregar remito ${remito.id}`);
      }
      showStatus('Remito generado y guardado en repo.');
    }catch(e){ console.warn('No se pudo guardar remito en repo', e); showStatus('Remito generado (no guardado en repo): '+(e.message||e), 'err'); }

  }catch(err){ console.error(err); showStatus('Error generando PDF: '+err.message,'err'); }
});

function generateRemitoId(){
  // keep simple and collision-resistant: R + timestamp + random 2 digits
  const t = Date.now(); const rnd = Math.floor(Math.random()*90)+10; return 'R' + String(t).slice(-8) + String(rnd);
}

// small util
function arrayBufferToBase64(buffer){
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// init
loadFromRepo();

export {};
