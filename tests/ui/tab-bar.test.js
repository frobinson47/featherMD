// ========================================
// Feather MD -- Tab Bar UI (AUTO-015 Phase 1)
// ========================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initTabBar, render } from '../../src/ui/tab-bar.js';
import { MAX_TABS } from '../../src/core/tabs.js';

function buildTabBarDOM() {
  document.body.innerHTML = '<div id="tab-bar" role="tablist"></div>';
}

function tab(id, title, isDirty = false) {
  return { id, title, isDirty, path: null };
}

describe('Tab Bar -- rendering', () => {
  beforeEach(() => {
    buildTabBarDOM();
  });

  it('does not throw when #tab-bar is absent from the DOM', () => {
    document.body.innerHTML = '';
    expect(() => render([tab(1, 'Untitled')], 1)).not.toThrow();
  });

  it('renders one button per tab plus a new-tab button', () => {
    render([tab(1, 'Untitled'), tab(2, 'Untitled 2')], 1);
    const bar = document.getElementById('tab-bar');
    expect(bar.querySelectorAll('.tab-item-btn').length).toBe(2);
    expect(bar.querySelector('#tab-new-btn')).toBeTruthy();
  });

  it('marks the active tab with the active class and aria-selected', () => {
    render([tab(1, 'A'), tab(2, 'B')], 2);
    const buttons = document.querySelectorAll('.tab-item-btn');
    expect(buttons[0].classList.contains('active')).toBe(false);
    expect(buttons[0].getAttribute('aria-selected')).toBe('false');
    expect(buttons[1].classList.contains('active')).toBe(true);
    expect(buttons[1].getAttribute('aria-selected')).toBe('true');
  });

  it('shows a dirty dot only for tabs with unsaved changes', () => {
    render([tab(1, 'Clean'), tab(2, 'Dirty', true)], 1);
    const buttons = document.querySelectorAll('.tab-item-btn');
    expect(buttons[0].querySelector('.tab-item-dirty-dot')).toBeNull();
    expect(buttons[1].querySelector('.tab-item-dirty-dot')).toBeTruthy();
  });

  it('displays each tab\'s title', () => {
    render([tab(1, 'My Document')], 1);
    expect(document.querySelector('.tab-item-label').textContent).toBe('My Document');
  });

  it('disables the new-tab button at MAX_TABS', () => {
    const tabs = Array.from({ length: MAX_TABS }, (_, i) => tab(i + 1, `Tab ${i + 1}`));
    render(tabs, 1);
    expect(document.getElementById('tab-new-btn').disabled).toBe(true);
  });

  it('enables the new-tab button below MAX_TABS', () => {
    render([tab(1, 'Only tab')], 1);
    expect(document.getElementById('tab-new-btn').disabled).toBe(false);
  });
});

describe('Tab Bar -- click wiring', () => {
  let onSwitchTab, onCloseTab, onNewTab;

  beforeEach(() => {
    buildTabBarDOM();
    onSwitchTab = vi.fn();
    onCloseTab = vi.fn();
    onNewTab = vi.fn();
    initTabBar(
      { onSwitchTab, onCloseTab, onNewTab },
      [tab(1, 'Tab One'), tab(2, 'Tab Two')],
      1,
    );
  });

  it('clicking an inactive tab calls onSwitchTab with its id', () => {
    const buttons = document.querySelectorAll('.tab-item-btn');
    buttons[1].click(); // Tab Two, inactive
    expect(onSwitchTab).toHaveBeenCalledWith(2);
  });

  it('clicking the already-active tab does not call onSwitchTab', () => {
    const buttons = document.querySelectorAll('.tab-item-btn');
    buttons[0].click(); // Tab One, already active
    expect(onSwitchTab).not.toHaveBeenCalled();
  });

  it('clicking a tab\'s close button calls onCloseTab with its id, not onSwitchTab', () => {
    const buttons = document.querySelectorAll('.tab-item-btn');
    buttons[1].querySelector('.tab-item-close').click();
    expect(onCloseTab).toHaveBeenCalledWith(2);
    expect(onSwitchTab).not.toHaveBeenCalled();
  });

  it('clicking the new-tab button calls onNewTab', () => {
    document.getElementById('tab-new-btn').click();
    expect(onNewTab).toHaveBeenCalledTimes(1);
  });

  it('does not throw when initTabBar is called with #tab-bar absent', () => {
    document.body.innerHTML = '';
    expect(() =>
      initTabBar({ onSwitchTab, onCloseTab, onNewTab }, [tab(1, 'X')], 1)
    ).not.toThrow();
  });
});
