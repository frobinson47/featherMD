// ========================================
// Feather MD — Tab Bar UI (AUTO-015 Phase 1)
// ========================================
// Renders the open-tabs strip from src/core/tabs.js's snapshot and forwards
// switch/close/new-tab clicks to the handlers main.js provides. Purely a
// rendering + event-dispatch layer -- it holds no state of its own and
// re-renders from scratch on every tabs.js change (cheap: at most 6 tabs).

import { MAX_TABS } from '../core/tabs.js';

let _onSwitchTab = null;
let _onCloseTab = null;
let _onNewTab = null;

/**
 * Wire the tab bar's click handlers and render the initial tab set.
 * @param {Object} handlers
 * @param {(id:number)=>void} handlers.onSwitchTab
 * @param {(id:number)=>void} handlers.onCloseTab
 * @param {()=>void} handlers.onNewTab
 * @param {Array} initialTabs - tabs.js getAllTabs() snapshot
 * @param {number} initialActiveId - tabs.js getActiveTabId()
 */
export function initTabBar(handlers, initialTabs, initialActiveId) {
  _onSwitchTab = handlers.onSwitchTab;
  _onCloseTab = handlers.onCloseTab;
  _onNewTab = handlers.onNewTab;
  render(initialTabs, initialActiveId);
}

/**
 * Re-render the tab bar from a tabs.js snapshot. Safe to call as the
 * onTabsChanged callback passed to tabs.js's initTabs().
 */
export function render(tabs, activeTabId) {
  const bar = document.getElementById('tab-bar');
  if (!bar) return;

  bar.innerHTML = '';

  tabs.forEach((tab) => {
    const isActive = tab.id === activeTabId;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'tab-item-btn' + (isActive ? ' active' : '');
    el.setAttribute('role', 'tab');
    el.setAttribute('aria-selected', isActive ? 'true' : 'false');
    el.dataset.tabId = String(tab.id);

    const label = document.createElement('span');
    label.className = 'tab-item-label';
    label.textContent = tab.title;
    el.appendChild(label);

    if (tab.isDirty) {
      const dot = document.createElement('span');
      dot.className = 'tab-item-dirty-dot';
      dot.setAttribute('aria-hidden', 'true');
      el.appendChild(dot);
    }

    const closeBtn = document.createElement('span');
    closeBtn.className = 'tab-item-close';
    closeBtn.setAttribute('role', 'button');
    closeBtn.setAttribute('aria-label', `Close ${tab.title}`);
    closeBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/></svg>';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (_onCloseTab) _onCloseTab(tab.id);
    });
    el.appendChild(closeBtn);

    el.addEventListener('click', () => {
      if (!isActive && _onSwitchTab) _onSwitchTab(tab.id);
    });

    bar.appendChild(el);
  });

  const atCap = tabs.length >= MAX_TABS;
  const newTabBtn = document.createElement('button');
  newTabBtn.type = 'button';
  newTabBtn.id = 'tab-new-btn';
  newTabBtn.setAttribute('aria-label', 'New tab');
  newTabBtn.title = atCap ? `Maximum ${MAX_TABS} tabs open` : 'New tab';
  newTabBtn.disabled = atCap;
  newTabBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="6" y1="2" x2="6" y2="10"/><line x1="2" y1="6" x2="10" y2="6"/></svg>';
  newTabBtn.addEventListener('click', () => {
    if (_onNewTab) _onNewTab();
  });
  bar.appendChild(newTabBtn);
}
