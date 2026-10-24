// Shell upgrades never discard a running page or its private offline queue.
export const APP_BUILD = 'czstudy-shell-v29-20261024-game-entry';
const revision = value => Number(String(value || '').match(/^czstudy-shell-v(\d+)-/)?.[1] || 0);
export const newerBuild = value => revision(value) > revision(APP_BUILD);

export function fieldValue(field) {
  if (field.type === 'checkbox' || field.type === 'radio') return String(!!field.checked);
  return String(field.value ?? '');
}
function initialValue(field) {
  if (field.type === 'checkbox' || field.type === 'radio') return String(!!field.defaultChecked);
  if (field.tagName === 'SELECT') {
    const options = [...field.options];
    return String((options.find(o => o.defaultSelected) || options[0])?.value ?? '');
  }
  return String(field.defaultValue ?? '');
}
export function editableFields(root) {
  return [...root.querySelectorAll('input,textarea,select')].filter(field =>
    !field.closest('#app-update-notice') && !field.readOnly
    && !['hidden', 'button', 'submit', 'file'].includes(field.type)
    && !field.closest('#map-filter,#practice-filter,#vocab-search')
    && (field.closest('form') || field.id === 'native-note'
      || field.hasAttribute('data-native-answer') || field.hasAttribute('data-native-check')));
}

export function installUpdateNotice({document, serviceWorker, getSafety, reload,
  setInterval: interval = globalThis.setInterval, clearInterval: clear = globalThis.clearInterval}) {
  let root, status, refreshButton, registration, timer, disposed = false, available = false, busy = false, edits = 0;
  const accepted = new WeakMap();
  const onEdit = () => { edits++; };
  document.addEventListener('input', onEdit, true);
  document.addEventListener('change', onEdit, true);
  const capture = scope => editableFields(scope).map(field => [field, fieldValue(field)]);
  const accept = snapshot => { for (const [field, value] of snapshot || []) accepted.set(field, value); };
  async function inspect() {
    const stamp = edits;
    const state = await getSafety();
    if (stamp !== edits) return {blocked: '你正在修改内容，保存后再点刷新。'};
    if (state.blocked) return state;
    const preserved = new Set(state.preservedFields || []);
    const dirty = editableFields(document).some(field => !preserved.has(field)
      && fieldValue(field) !== (accepted.has(field) ? accepted.get(field) : initialValue(field)));
    if (dirty) return {...state, blocked: '当前还有未保存的修改。先点对应的保存按钮，再刷新使用新版。'};
    return state;
  }
  function summary(state) {
    if (state.blocked) return state.blocked;
    const n = (state.queuedEvents || 0) + (state.queuedRecordings || 0);
    if (n) return `当前修改已留在本机，${n} 项待同步${state.rejected ? '（其中有同步失败项）' : ''}。刷新会保留这些记录。`;
    return state.hasUser ? '当前没有未保存修改，本机同步队列为空。可以刷新使用新版。' : '当前没有未保存修改。可以刷新使用新版。';
  }
  async function check(shouldReload = false) {
    if (busy || disposed) return;
    busy = true; if (refreshButton) refreshButton.disabled = true;
    try {
      const state = await inspect();
      if (disposed) return;
      if (status) status.textContent = summary(state);
      // The only reload site: an explicit button press plus successful checks.
      if (shouldReload && !state.blocked) reload();
    } catch {
      if (status) status.textContent = '暂时无法核对本机保存状态，请先保存当前内容，再点刷新重试。';
    } finally { busy = false; if (refreshButton) refreshButton.disabled = false; }
  }
  function show(version) {
    if (disposed || !newerBuild(version)) return;
    available = true;
    if (!root) {
      root = document.createElement('aside'); root.id = 'app-update-notice'; root.className = 'app-update-notice';
      root.setAttribute('aria-label', '应用更新');
      const title = document.createElement('strong'); title.textContent = '新版已准备好';
      status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = '正在核对本机保存状态…';
      refreshButton = document.createElement('button'); refreshButton.type = 'button'; refreshButton.className = 'btn';
      refreshButton.textContent = '刷新使用新版'; refreshButton.addEventListener('click', () => check(true));
      const later = document.createElement('button'); later.type = 'button'; later.className = 'text-btn'; later.textContent = '稍后';
      later.addEventListener('click', () => { root.hidden = true; });
      const row = document.createElement('div'); row.className = 'button-row'; row.append(refreshButton, later);
      root.append(title, status, row); document.body.append(root);
    }
    root.hidden = false; void check();
  }
  const askVersion = () => { serviceWorker.controller?.postMessage({type: 'CZSTUDY_SHELL_VERSION'}); };
  const onMessage = event => {
    if (event.data?.type === 'CZSTUDY_SHELL_VERSION' && event.source === serviceWorker.controller) show(event.data.version);
  };
  const onController = () => askVersion();
  const onVisible = () => {
    if (document.hidden) return;
    if (available && root) { root.hidden = false; void check(); }
    askVersion(); registration?.update().catch(() => {});
  };
  serviceWorker.addEventListener('controllerchange', onController);
  serviceWorker.addEventListener('message', onMessage);
  document.addEventListener('visibilitychange', onVisible);
  askVersion();
  return {
    capture, accept,
    watch(value) {
      registration = value; askVersion();
      timer = interval(() => { if (!document.hidden) registration.update().catch(() => {}); }, 30 * 60 * 1000);
    },
    destroy() {
      disposed = true; if (timer) clear(timer); root?.remove();
      serviceWorker.removeEventListener('controllerchange', onController);
      serviceWorker.removeEventListener('message', onMessage);
      document.removeEventListener('input', onEdit, true); document.removeEventListener('change', onEdit, true);
      document.removeEventListener('visibilitychange', onVisible);
    }
  };
}
