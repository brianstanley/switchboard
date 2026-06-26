// Lightweight delegated tooltips for icon buttons.
(() => {
  const TOOLTIP_SELECTOR = 'button[title], button[aria-label], button[data-tooltip], [data-tooltip]';
  const SHOW_DELAY_MS = 250;
  const EDGE_GAP = 8;

  let tooltipEl = null;
  let activeTarget = null;
  let showTimer = null;

  function ensureTooltip() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'ui-tooltip';
    tooltipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltipEl);
    return tooltipEl;
  }

  function getTooltipText(target) {
    if (!target) return '';
    const title = target.getAttribute('title');
    if (title) {
      target.dataset.tooltip = title;
      if (!target.getAttribute('aria-label')) target.setAttribute('aria-label', title);
      target.removeAttribute('title');
      return title;
    }
    return target.dataset.tooltip || target.getAttribute('aria-label') || '';
  }

  function shouldShow(target, text) {
    if (!target || !text || target.disabled || target.getAttribute('aria-disabled') === 'true') return false;
    if (target.closest('.new-session-popover')) return false;
    return true;
  }

  function positionTooltip(target) {
    if (!tooltipEl || !target) return;
    const rect = target.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = rect.top - tooltipRect.height - EDGE_GAP;
    let placement = 'top';
    if (top < EDGE_GAP) {
      top = rect.bottom + EDGE_GAP;
      placement = 'bottom';
    }
    if (top + tooltipRect.height > viewportHeight - EDGE_GAP) {
      top = Math.max(EDGE_GAP, viewportHeight - tooltipRect.height - EDGE_GAP);
      placement = 'top';
    }

    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
    left = Math.max(EDGE_GAP, Math.min(left, viewportWidth - tooltipRect.width - EDGE_GAP));

    tooltipEl.dataset.placement = placement;
    tooltipEl.style.left = `${Math.round(left)}px`;
    tooltipEl.style.top = `${Math.round(top)}px`;
  }

  function showTooltip(target) {
    const text = getTooltipText(target);
    if (!shouldShow(target, text)) return;

    activeTarget = target;
    const tooltip = ensureTooltip();
    tooltip.textContent = text;
    tooltip.classList.remove('visible');
    tooltip.style.left = '-9999px';
    tooltip.style.top = '-9999px';

    requestAnimationFrame(() => {
      if (activeTarget !== target) return;
      positionTooltip(target);
      tooltip.classList.add('visible');
    });
  }

  function scheduleShow(target) {
    clearTimeout(showTimer);
    showTimer = setTimeout(() => showTooltip(target), SHOW_DELAY_MS);
  }

  function hideTooltip() {
    clearTimeout(showTimer);
    showTimer = null;
    activeTarget = null;
    if (tooltipEl) tooltipEl.classList.remove('visible');
  }

  function findTarget(eventTarget) {
    return eventTarget?.closest?.(TOOLTIP_SELECTOR) || null;
  }

  document.addEventListener('pointerover', (event) => {
    const target = findTarget(event.target);
    if (!target || target.contains(event.relatedTarget)) return;
    scheduleShow(target);
  });

  document.addEventListener('pointerout', (event) => {
    const target = findTarget(event.target);
    if (!target || target.contains(event.relatedTarget)) return;
    if (target === activeTarget || target.dataset.tooltip || target.getAttribute('aria-label')) hideTooltip();
  });

  document.addEventListener('focusin', (event) => {
    const target = findTarget(event.target);
    if (target) scheduleShow(target);
  });

  document.addEventListener('focusout', (event) => {
    if (findTarget(event.target)) hideTooltip();
  });

  document.addEventListener('click', hideTooltip, true);
  window.addEventListener('scroll', hideTooltip, true);
  window.addEventListener('resize', hideTooltip);
})();
