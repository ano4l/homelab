let opened;
function database() {
  if (!opened) opened = new Promise((resolve,reject) => {
    const request = indexedDB.open('vk-shared-cache',1);
    request.onupgradeneeded = () => request.result.createObjectStore('accounts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {opened = null; reject(request.error);};
  });
  return opened;
}
export async function readCache(id) {
  const db = await database();
  return new Promise((resolve,reject) => {const tx=db.transaction('accounts','readonly'),request=tx.objectStore('accounts').get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
}
export async function writeCache(id, value) {
  const db = await database();
  return new Promise((resolve,reject) => {const tx=db.transaction('accounts','readwrite');tx.objectStore('accounts').put(value,id);tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Device storage could not save your changes.'));});
}
export const accountLock = (id,action) => navigator.locks ? navigator.locks.request(`vk-sync-${id}`,action) : Promise.reject(new Error('This browser cannot safely coordinate device storage. Open VK over HTTPS in a current browser.'));
