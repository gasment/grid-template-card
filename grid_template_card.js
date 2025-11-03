// v2.1.0
class GridTemplateCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._finalConfig = {};
    this._variables = {};
    this._initialMounted = false;
    this.BUILT_IN_AREAS = ['name', 'label', 'state', 'icon'];
    this.AREA_SHORTHANDS = { n: 'name', l: 'label', s: 'state', i: 'icon' };
  }

  /* ================== Home Assistant Lifecycle ================== */

  setConfig(config) {
    if (!config) throw new Error("grid-template-card: 配置无效。");
    const { finalCfg, finalVars } = this._resolveTemplatesAndVariables(config);
    this._finalConfig = finalCfg || {};
    this._variables = finalVars || {};

    for (const [short, long] of Object.entries(this.AREA_SHORTHANDS)) {
      if (this._finalConfig[short] !== undefined) {
        this._finalConfig[long] = this._finalConfig[short];
        delete this._finalConfig[short];
      }
    }

    if (!this.shadowRoot.querySelector('.grid-container')) this._render();
  }

  set hass(hass) {
    if (!hass) return;
    const oldHass = this._hass;
    this._hass = hass;

    if (!this._initialMounted || hass.states !== oldHass?.states) {
      if (!this._initialMounted) {
        this._initialMounted = true;
        this._loadCards();
      }
      this._applyDynamicStyles();
    }

    this.shadowRoot?.querySelectorAll(".grid-item > *:not(.built-in-element)").forEach(card => {
      if (card) card.hass = hass;
    });
  }

  /* ================== Template System ================== */

  _evaluateTemplate(value) {
    if (typeof value !== 'string') return value;
    const s = value.trim();
    if (!s.startsWith('[[[') || !s.endsWith(']]]')) return value;
    if (!this._hass) return '';

    const _exec = (codeStr, variablesProxy) => {
      const hass = this._hass;
      const states = hass?.states || {};
      const user = hass?.user;
      const entityId = this._finalConfig?.entity;
      const entity = entityId ? states[entityId] : null;

      const isBlock = /(\bvar\b|\bif\b|\blet\b|\bconst\b|;|\n|\breturn\b)/.test(codeStr);
      if (isBlock) {
        return Function(
          'hass','states','entity','user','variables','config','card',
          `"use strict"; ${codeStr}`
        )(hass, states, entity, user, variablesProxy, this._finalConfig, this);
      }
      return Function(
        'hass','states','entity','user','variables','config','card',
        `"use strict"; return (${codeStr})`
      )(hass, states, entity, user, variablesProxy, this._finalConfig, this);
    };

    try {
      const rawCode = s.slice(3, -3);
      const variablesProxy = new Proxy(this._variables || {}, {
        get: (target, property, receiver) => {
          const value = Reflect.get(target, property, receiver);
          if (typeof value === 'string' && value.trim().startsWith('[[[')) {
            const innerCode = value.trim().slice(3, -3);
            return _exec(innerCode, variablesProxy);
          }
          return value;
        }
      });
      return _exec(rawCode, variablesProxy);
    } catch (e) {
      console.error('grid-template-card: 模板错误', value, e);
      console.error('当前 variables:', this._variables);
      return '';
    }
  }

  _evaluateActionConfig(config) {
    if (config === null || typeof config !== 'object') {
      return this._evaluateTemplate(config);
    }
    if (Array.isArray(config)) {
      return config.map(item => this._evaluateActionConfig(item));
    }
    const evaluatedConfig = {};
    for (const key in config) {
      if (Object.prototype.hasOwnProperty.call(config, key)) {
        evaluatedConfig[key] = this._evaluateActionConfig(config[key]);
      }
    }
    return evaluatedConfig;
  }

  /* ================== Rendering and Styling ================== */

  _render() {
    const style = document.createElement("style");
    style.textContent = `
      .grid-container {
        display: grid;
        width: 100%;
      }
      .grid-item {
        box-sizing: border-box;
        min-width: 0;
        min-height: 0;
        overflow: visible;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .grid-item > * { width: 100%; height: 100%; }
      .grid-item.icon { overflow: visible; }
      .grid-item img { max-width: 100%; max-height: 100%; object-fit: contain; }
      .grid-item ha-icon { width: 100%; height: 100%; }
    `;

    if (this._finalConfig.is_nested) {
      style.textContent += `
        .grid-container { position: relative !important; z-index: 10 !important; }
      `;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "grid-container";
    wrapper.addEventListener("mousedown", (ev) => this._handleTap(ev));

    const customAreas = this._finalConfig.custom_grid_areas || {};
    for (const areaName of Object.keys(customAreas)) {
      const div = document.createElement("div");
      div.className = "grid-item";
      div.dataset.area = areaName;
      wrapper.appendChild(div);
    }

    for (const areaName of this.BUILT_IN_AREAS) {
      if (this._finalConfig[areaName] !== undefined) {
        const div = document.createElement("div");
        div.className = `grid-item ${areaName}`;
        div.dataset.area = areaName;
        wrapper.appendChild(div);
      }
    }

    this.shadowRoot.innerHTML = "";
    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(wrapper);

    if (window.provideHass) window.provideHass(this);
  }

  _applyDynamicStyles() {
    if (!this._finalConfig || !this.shadowRoot) return;
    const wrapper = this.shadowRoot.querySelector(".grid-container");
    if (!wrapper) return;

    let wrapperCssText = '';
    if (this._finalConfig.styles?.grid) {
      wrapperCssText += this._arrayStylesToString(this._finalConfig.styles.grid);
    }
    if (this._finalConfig.styles?.card) {
      wrapperCssText += this._arrayStylesToString(this._finalConfig.styles.card);
    }
    if (this._finalConfig.tap_action && this._finalConfig.tap_action.action !== 'none') {
      wrapperCssText += 'cursor: pointer;';
    }
    wrapper.style.cssText = wrapperCssText;

    this.shadowRoot.querySelectorAll('.grid-item').forEach(el => {
      const areaName = el.dataset.area;
      if (!areaName) return;
      let css = `grid-area: ${areaName};`;
      const isBuiltIn = this.BUILT_IN_AREAS.includes(areaName);
      if (isBuiltIn) {
        if (this._finalConfig.styles?.[areaName]) {
          css += this._arrayStylesToString(this._finalConfig.styles[areaName]);
        }
      } else {
        if (this._finalConfig.styles?.custom_grid_areas?.[areaName]) {
          css += this._arrayStylesToString(this._finalConfig.styles.custom_grid_areas[areaName]);
        }
      }
      el.style.cssText = css;
    });

    for (const areaName of this.BUILT_IN_AREAS) {
      if (this._finalConfig[areaName] === undefined) continue;
      const el = this.shadowRoot.querySelector(`.grid-item[data-area="${areaName}"]`);
      if (!el) continue;
      const content = this._evaluateTemplate(this._finalConfig[areaName]);
      if (areaName === 'icon') this._updateIcon(el, content);
      else if (el.innerHTML !== content) el.innerHTML = content;
    }
  }

  /* ================== Tap + Confirm Dialog ================== */

  _handleTap(ev) {
    // 触感反馈
    if (this._finalConfig.tap_action_vibration) {
      const hapticType = this._finalConfig.tap_action_vibration_type || 'heavy';
      this.dispatchEvent(new CustomEvent('haptic', { bubbles: true, composed: true, detail: hapticType }));
    }

    const rawActionConfig = this._finalConfig.tap_action;
    if (!rawActionConfig || !this._hass) return;

    if (this._finalConfig.confirm_dialog) {
      if (this.shadowRoot.querySelector('.confirm-overlay')) return;

      // 样式单例
      if (!this.shadowRoot.querySelector('style[data-confirm-style]')) {
        const style = document.createElement('style');
        style.setAttribute('data-confirm-style', 'true');
        style.textContent = `
          .confirm-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0);
            z-index: 9999;
            transition: background 0.25s ease;
          }
          .confirm-overlay.show { background: rgba(0, 0, 0, 0.5); }
          .confirm-dialog {
            position: fixed;
            background: var(--card-background-color, #fff);
            border-radius: 12px;
            padding: 16px 18px 14px;
            box-shadow: 0 8px 28px rgba(0,0,0,0.18);
            width: max-content;
            min-width: 200px;     /* ← 调整 */
            max-width: 320px;     /* ← 调整 */
            opacity: 0;
            transition: opacity 0.18s ease;
          }
          .confirm-overlay.show .confirm-dialog { opacity: 1; }
          .confirm-title { font-weight: 600; margin-bottom: 8px; font-size: 1.06rem; }
          .confirm-content {
            margin-bottom: 14px;
            white-space: pre-wrap;
            word-break: break-word;
            font-size: 0.95rem;
            color: var(--primary-text-color);
          }
          .confirm-buttons { display: flex; justify-content: flex-end; gap: 12px; }
          .confirm-buttons button {
            border: none; border-radius: 9px; padding: 10px 16px;
            cursor: pointer; font-size: 0.98rem;
          }
          .confirm-buttons .cancel { background: rgba(0,0,0,0.08); }
          .confirm-buttons .confirm { background: var(--primary-color, #03a9f4); color: #fff; }
        `;
        this.shadowRoot.appendChild(style);
      }

      const overlay = document.createElement('div');
      overlay.classList.add('confirm-overlay');

      const dialog = document.createElement('div');
      dialog.classList.add('confirm-dialog');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.innerHTML = `
        <div class="confirm-title">你确定吗</div>
        <div class="confirm-content">${this._finalConfig.confirm_dialog_content || ''}</div>
        <div class="confirm-buttons">
          <button class="cancel">取消</button>
          <button class="confirm">确定</button>
        </div>
      `;
      overlay.appendChild(dialog);
      this.shadowRoot.appendChild(overlay);

      // ====== 定位准备：找到锚点元素 ======
      const path = ev?.composedPath?.() || [];
      const gridItem = path.find(el => el?.classList?.contains?.('grid-item'));
      const wrapper = this.shadowRoot.querySelector('.grid-container');
      const anchorEl = gridItem || wrapper || this;

      // ====== 展示与初次定位 ======
      requestAnimationFrame(() => {
        overlay.classList.add('show');
        this._positionDialogWithAnchor(dialog, anchorEl, ev);
      });

      // ====== 滚动/尺寸变化时跟随定位（RAF 循环 + resize 监听） ======
      let rafId = 0;
      const rafReposition = () => {
        if (!overlay.isConnected) return;               // 关闭后停止
        this._positionDialogWithAnchor(dialog, anchorEl, ev);
        rafId = window.requestAnimationFrame(rafReposition);
      };
      rafId = window.requestAnimationFrame(rafReposition);

      const onResize = () => this._positionDialogWithAnchor(dialog, anchorEl, ev);
      window.addEventListener('resize', onResize);

      const closeDialog = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 180);
        if (rafId) window.cancelAnimationFrame(rafId);
        window.removeEventListener('resize', onResize);
      };

      // 点击遮罩关闭，不触发
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeDialog();
      });

      dialog.querySelector('.cancel')?.addEventListener('click', () => closeDialog());
      dialog.querySelector('.confirm')?.addEventListener('click', () => {
        closeDialog();
        this._executeTapAction();
      });

      return; // 阻断默认执行
    }

    // 无需确认 → 直接执行
    this._executeTapAction();
  }

  /**
   * 将弹窗定位到锚点元素附近：
   * - 默认下方 10px；不够则翻转到上方
   * - 左右越界夹取
   * - 如果有 click 事件，优先用其在锚点内的投影点做水平定位
   */
  _positionDialogWithAnchor(dialog, anchorEl, ev) {
    if (!dialog?.isConnected || !anchorEl?.isConnected) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const GAP = 15;

    const r = anchorEl.getBoundingClientRect();
    const hasClick = typeof ev?.clientX === 'number' && typeof ev?.clientY === 'number';
    const baseX = hasClick
      ? Math.min(Math.max(ev.clientX, r.left), r.right)   // 将点击点夹在锚点内
      : (r.left + r.width / 2);

    const rect = dialog.getBoundingClientRect();
    const dlgW = rect.width;
    const dlgH = rect.height;

    // 默认下方
    let top = r.bottom + GAP;
    let left = baseX - dlgW / 2;

    // 下方放不下 → 上方
    if (top + dlgH + GAP > vh) {
      top = r.top - dlgH - GAP;
    }

    // 上方仍越界 → 夹取
    if (top < GAP) top = GAP;

    // 左右夹取
    if (left < GAP) left = GAP;
    if (left + dlgW + GAP > vw) {
      left = Math.max(GAP, vw - dlgW - GAP);
    }

    dialog.style.top = `${top}px`;
    dialog.style.left = `${left}px`;
  }

  /* ================== 执行 tap_action ================== */
  _executeTapAction() {
    const rawActionConfig = this._finalConfig.tap_action;
    if (!rawActionConfig || !this._hass) return;

    const actionConfig = this._evaluateActionConfig(rawActionConfig);
    if (actionConfig?.action === 'none') return;

    const dispatch = (eventName, detail) => {
      this.dispatchEvent(new CustomEvent(eventName, { bubbles: true, composed: true, detail }));
    };

    const entityIdForAction =
      actionConfig.entity ||
      (actionConfig.target && actionConfig.target.entity_id) ||
      this._finalConfig.entity;

    let action = actionConfig.action;
    if (action === 'perform-action' && actionConfig.perform_action) {
      action = 'call-service';
    } else if (action && action.includes('.') && !['call-service', 'more-info'].includes(action)) {
      action = 'call-service';
    }

    switch (action) {
      case 'more-info':
        if (!entityIdForAction) return;
        dispatch('hass-more-info', { entityId: entityIdForAction });
        break;
      case 'toggle':
        if (!entityIdForAction) return;
        this._hass.callService('homeassistant', 'toggle', { entity_id: entityIdForAction });
        break;
      case 'call-service': {
        const serviceCall =
          actionConfig.action.includes('.') ?
            actionConfig.action :
            actionConfig.service || actionConfig.perform_action;
        if (!serviceCall) return;
        const [domain, service] = serviceCall.split('.', 2);
        const serviceData = { ...actionConfig.target, ...actionConfig.data, ...actionConfig.service_data };
        this._hass.callService(domain, service, serviceData);
        break;
      }
      case 'navigate':
        if (!actionConfig.navigation_path) return;
        dispatch('hass-navigate', { path: actionConfig.navigation_path });
        break;
      case 'url':
        if (!actionConfig.url_path) return;
        window.open(actionConfig.url_path, '_blank', 'noopener');
        break;
      default:
        console.warn(`grid-template-card: Unhandled action type: ${actionConfig.action}`);
    }
  }

  /* ================== 其他原有工具函数 ================== */

  _updateIcon(element, iconValue) {
    const currentElement = element.firstElementChild;
    const isImagePath = typeof iconValue === 'string' && (iconValue.includes('/') || iconValue.includes('.'));
    if (isImagePath) {
      if (!currentElement || currentElement.tagName !== 'IMG') {
        element.innerHTML = `<img src="${iconValue}" class="built-in-element" />`;
      } else {
        const prevRaw = currentElement.dataset.srcRaw || '';
        if (prevRaw !== String(iconValue)) {
          currentElement.dataset.srcRaw = String(iconValue);
          currentElement.src = iconValue;
        }
      }
    } else {
      if (!currentElement || currentElement.tagName !== 'HA-ICON' || currentElement.getAttribute('icon') !== iconValue) {
        element.innerHTML = `<ha-icon icon="${iconValue}" class="built-in-element"></ha-icon>`;
      }
    }
  }

  _arrayStylesToString(arr) {
    if (!Array.isArray(arr)) return '';
    let cssText = '';
    arr.forEach((styleObject) => {
      if (typeof styleObject !== 'object' || styleObject === null) return;
      for (const [key, rawValue] of Object.entries(styleObject)) {
        const evaluatedValue = this._evaluateTemplate(rawValue);
        if (evaluatedValue !== undefined && evaluatedValue !== null && String(evaluatedValue) !== '') {
          cssText += `${key}: ${evaluatedValue};`;
        }
      }
    });
    return cssText;
  }

  static _getGlobalTemplates() {
    try {
      const ha = document.querySelector("home-assistant"),
        main = ha?.shadowRoot?.querySelector("home-assistant-main"),
        panel = main?.shadowRoot?.querySelector("ha-panel-lovelace"),
        cfg = panel?.lovelace?.config;
      return cfg?.grid_template_card_templates || cfg?.button_card_templates || {};
    } catch (e) {
      return {};
    }
  }

  static _deepClone(obj) {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(x => GridTemplateCard._deepClone(x));
    const out = {};
    for (const k of Object.keys(obj)) out[k] = GridTemplateCard._deepClone(obj[k]);
    return out;
  }

  static _deepMerge(base, ext) {
    if (base === null || typeof base !== "object") return GridTemplateCard._deepClone(ext);
    if (ext === null || typeof ext !== "object") return GridTemplateCard._deepClone(base);

    const out = Array.isArray(base) ? base.slice() : { ...base };
    if (Array.isArray(base) && Array.isArray(ext)) return base.concat(ext);

    for (const k of Object.keys(ext)) {
      const bv = out[k], ev = ext[k];
      if (Array.isArray(bv) && Array.isArray(ev)) out[k] = bv.concat(ev);
      else if (bv && typeof bv === "object" && ev && typeof ev === "object") out[k] = GridTemplateCard._deepMerge(bv, ev);
      else out[k] = GridTemplateCard._deepClone(ev);
    }
    return out;
  }

  _resolveTemplatesAndVariables(inputCfg) {
    const globalTpl = GridTemplateCard._getGlobalTemplates(),
      tplEntries = [];

    const pushByName = name => {
      if (!name || typeof name !== "string") return;
      const def = globalTpl[name];
      if (!def) {
        console.warn("[grid-template-card] 未找到模板:", name);
        return;
      }
      tplEntries.push({ name, def });
    };

    const rawTemplate = inputCfg.template ?? inputCfg.templates;
    if (rawTemplate) {
      if (typeof rawTemplate === "string") pushByName(rawTemplate);
      else if (Array.isArray(rawTemplate)) rawTemplate.forEach(pushByName);
    }

    const visited = new Set;
    const unfold = tplDef => {
      const name = Object.entries(globalTpl).find(([k, v]) => v === tplDef)?.[0];
      if (name) {
        if (visited.has(name)) {
          console.warn("[grid-template-card] 模板循环：", name);
          return {};
        }
        visited.add(name);
      }
      let merged = {};
      const parentRef = tplDef?.template ?? tplDef?.templates;
      if (parentRef) {
        const parents = Array.isArray(parentRef) ? parentRef : [parentRef];
        for (const pName of parents) {
          const pd = globalTpl[pName];
          if (!pd) {
            console.warn("[grid-template-card] 模板未找到（父）:", pName);
            continue;
          }
          merged = GridTemplateCard._deepMerge(merged, unfold(pd));
        }
      }
      merged = GridTemplateCard._deepMerge(merged, tplDef || {});
      return merged;
    };

    let mergedCfg = {};
    for (const { def } of tplEntries) mergedCfg = GridTemplateCard._deepMerge(mergedCfg, unfold(def));

    const tplVars = mergedCfg.variables || {};
    const userVars = inputCfg.variables || {};
    const finalVars = GridTemplateCard._deepMerge(tplVars, userVars);

    const { template, templates, variables, ...restInput } = inputCfg;
    const finalCfg = GridTemplateCard._deepMerge(mergedCfg, restInput);
    return { finalCfg, finalVars };
  }

  async _loadCards() {
    const wrapper = this.shadowRoot.querySelector(".grid-container");
    if (!wrapper) return;
    const areas = this._finalConfig.custom_grid_areas || {};
    const helpers = await window.loadCardHelpers();

    for (const areaName of Object.keys(areas)) {
      const areaConfig = areas[areaName];
      if (!areaConfig || !areaConfig.card) continue;
      const slot = wrapper.querySelector(`.grid-item[data-area="${areaName}"]`);
      if (!slot) continue;

      let finalCardConfig = GridTemplateCard._deepClone(areaConfig.card);

      if (finalCardConfig.type === 'custom:grid-template-card') {
        const parentVars = this._variables || {};
        const childOwnVars = finalCardConfig.variables || {};
        finalCardConfig.variables = GridTemplateCard._deepMerge(parentVars, childOwnVars);
      }

      try {
        const cardElement = await helpers.createCardElement(finalCardConfig);
        cardElement.hass = this._hass;
        slot.innerHTML = '';
        slot.appendChild(cardElement);
      } catch (e) {
        console.error(`[grid-template-card] 创建卡片失败 '${areaName}':`, e);
        const errorCard = document.createElement("hui-error-card");
        errorCard.setConfig({ type: "error", error: e.message, origConfig: areaConfig.card });
        slot.innerHTML = '';
        slot.appendChild(errorCard);
      }
    }
  }

  getCardSize() {
    return this._finalConfig?.card_size || 3;
  }
}

if (!customElements.get('grid-template-card')) {
  customElements.define('grid-template-card', GridTemplateCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'grid-template-card',
    name: 'Grid Template Card v2.1.0',
    description: '一个支持模板和内置区域的网格布局卡片'
  });
}
