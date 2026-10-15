// admin/api-github.js
// Small helper for GitHub Contents API used by the Admin UI (client-side).
// NOTE: For production prefer a secure server-side relay instead of embedding tokens in the browser.

export function getSavedToken(){
  return sessionStorage.getItem('RL_GH_TOKEN') || document.getElementById('gh-token').value.trim() || '';
}
export function saveToken(t){
  sessionStorage.setItem('RL_GH_TOKEN', t);
}

function getAuthHeaders(){
  const token = getSavedToken();
  const h = { 'Accept': 'application/vnd.github.v3+json' };
  if (token) h['Authorization'] = `token ${token}`;
  return h;
}

export async function getFileMeta(owner, repo, path, branch='main'){
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) {
    const txt = await res.text(); throw new Error(`GET ${path} -> ${res.status} ${txt}`);
  }
  return await res.json();
}

export async function putFile(owner, repo, path, contentBase64, message, sha=null, branch='main'){
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const body = { message, content: contentBase64, branch };
  if (sha) body.sha = sha;
  const res = await fetch(url, { method: 'PUT', headers: Object.assign({'Content-Type':'application/json'}, getAuthHeaders()), body: JSON.stringify(body) });
  if (!res.ok){ const txt = await res.text(); throw new Error(`PUT ${path} -> ${res.status} ${txt}`); }
  return await res.json();
}

export async function deleteFile(owner, repo, path, message, sha, branch='main'){
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const body = { message, sha, branch };
  const res = await fetch(url, { method: 'DELETE', headers: Object.assign({'Content-Type':'application/json'}, getAuthHeaders()), body: JSON.stringify(body) });
  if (!res.ok){ const txt = await res.text(); throw new Error(`DELETE ${path} -> ${res.status} ${txt}`); }
  return await res.json();
}

export async function getJson(owner, repo, path, branch='main'){
  const meta = await getFileMeta(owner, repo, path, branch);
  if (!meta) return { json: null, sha: null };
  const raw = atob(meta.content.replace(/\n/g,''));
  return { json: JSON.parse(raw), sha: meta.sha };
}

export async function putJson(owner, repo, path, obj, message, sha=null, branch='main'){
  const content = JSON.stringify(obj, null, 2);
  const b64 = btoa(unescape(encodeURIComponent(content)));
  return await putFile(owner, repo, path, b64, message, sha, branch);
}

// convert a File to base64 (no data: prefix)
export function fileToBase64(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>{
      const s = reader.result;
      const comma = s.indexOf(',');
      resolve(s.slice(comma+1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Optional: post to an external worker (relay) instead of direct GitHub calls
export async function postToWorker(url, secret, payload){
  if (!url) throw new Error('No worker URL');
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type':'application/json', 'x-admin-key': secret }, body: JSON.stringify(payload) });
  if (!res.ok){ const txt = await res.text(); throw new Error('Worker error: '+txt); }
  return await res.json();
}
