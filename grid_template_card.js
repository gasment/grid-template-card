//v2.0.0
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
  _evaluateTemplate(value) { if (typeof value !== 'string') return value; const s = value.trim(); if (!s.startsWith('[[[') || !s.endsWith(']]]')) return value; if (!this._hass) return ''; const _exec = (codeStr, variablesProxy) => { const hass = this._hass; const states = hass?.states || {}; const user = hass?.user; const entityId = this._finalConfig?.entity; const entity = entityId ? states[entityId] : null; const isBlock = /(\bvar\b|\bif\b|\blet\b|\bconst\b|;|\n|\breturn\b)/.test(codeStr); if (isBlock) { return Function('hass', 'states', 'entity', 'user', 'variables', 'config', 'card', `"use strict"; ${codeStr}`)(hass, states, entity, user, variablesProxy, this._finalConfig, this); } return Function('hass', 'states', 'entity', 'user', 'variables', 'config', 'card', `"use strict"; return (${codeStr})`)(hass, states, entity, user, variablesProxy, this._finalConfig, this); }; try { const rawCode = s.slice(3, -3); const variablesProxy = new Proxy(this._variables || {}, { get: (target, property, receiver) => { const value = Reflect.get(target, property, receiver); if (typeof value === 'string' && value.trim().startsWith('[[[')) { const innerCode = value.trim().slice(3, -3); return _exec(innerCode, variablesProxy); } return value; } }); return _exec(rawCode, variablesProxy); } catch (e) { console.error('grid-template-card: 模板错误', value, e); console.error('当前 variables:', this._variables); return ''; } }

  // **NEW**: Helper to evaluate templates within the action config object
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

  /* ================== Rendering and Styling (Unchanged) ================== */

  _render() {
    const style = document.createElement("style");
    style.textContent = `
      .grid-container { display: grid; width: 100%; }
      .grid-item { box-sizing: border-box; min-width: 0; min-height: 0; overflow: visible; display: flex; align-items: center; justify-content: center; }
      .grid-item > * { width: 100%; height: 100%; }
      .grid-item.icon { overflow: visible; }
      .grid-item img { max-width: 100%; max-height: 100%; object-fit: contain; }
      .grid-item ha-icon { width: 100%; height: 100%; }
    `;
    const wrapper = document.createElement("div");
    wrapper.className = "grid-container";
    wrapper.addEventListener('mousedown', () => this._handleTap());
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
    this.shadowRoot.innerHTML = '';
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

  // ** FULLY DYNAMIC ACTION HANDLER **
  _handleTap() {
    // ================== START: 新的、更可靠的触感反馈逻辑 ==================
    // 检查 'tap_action_vibration' 配置项是否为 true
    if (this._finalConfig.tap_action_vibration) {
      // 获取震动类型，如果用户未指定，则默认为 'heavy'
      const hapticType = this._finalConfig.tap_action_vibration_type || 'heavy';

      // 分发标准的 'haptic' 前端事件，HA伴侣应用会捕获并处理它
      this.dispatchEvent(new CustomEvent('haptic', {
        bubbles: true,
        composed: true,
        detail: hapticType
      }));
    }
    // ==================  END: 新的触感反馈逻辑  ==================

    const rawActionConfig = this._finalConfig.tap_action;
    if (!rawActionConfig || !this._hass) {
      return;
    }

    // **NEW**: Evaluate the entire action config object at the moment of the tap
    const actionConfig = this._evaluateActionConfig(rawActionConfig);

    if (actionConfig.action === 'none') {
      return;
    }

    const dispatch = (eventName, detail) => {
      this.dispatchEvent(new CustomEvent(eventName, {
        bubbles: true, composed: true, detail: detail,
      }));
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
      case 'more-info': {
        if (!entityIdForAction) {
          console.warn('grid-template-card: action "more-info" could not find an entity.');
          return;
        }
        dispatch('hass-more-info', { entityId: entityIdForAction });
        break;
      }

      case 'toggle': {
        if (!entityIdForAction) {
          console.warn('grid-template-card: action "toggle" could not find an entity.');
          return;
        }
        this._hass.callService('homeassistant', 'toggle', { entity_id: entityIdForAction });
        break;
      }

      case 'call-service': {
        const serviceCall = actionConfig.action.includes('.') ? actionConfig.action : actionConfig.service || actionConfig.perform_action;
        if (!serviceCall) {
          console.warn('grid-template-card: "call-service" action missing "service" definition.');
          return;
        }
        const [domain, service] = serviceCall.split('.', 2);
        const serviceData = { ...actionConfig.target, ...actionConfig.data, ...actionConfig.service_data };
        this._hass.callService(domain, service, serviceData);
        break;
      }

      case 'navigate': {
        const path = actionConfig.navigation_path;
        if (!path) {
          console.warn('grid-template-card: "navigate" action missing "navigation_path".');
          return;
        }
        dispatch('hass-navigate', { path });
        break;
      }

      case 'url': {
        const url = actionConfig.url_path;
        if (!url) {
          console.warn('grid-template-card: "url" action missing "url_path".');
          return;
        }
        window.open(url, '_blank', 'noopener');
        break;
      }

      default:
        console.warn(`grid-template-card: Unhandled action type: ${actionConfig.action}`);
    }
  }


  _updateIcon(element, iconValue) {
    const currentElement = element.firstElementChild;
    const isImagePath = typeof iconValue === 'string' && (iconValue.includes('/') || iconValue.includes('.'));
    if (isImagePath) {
      if (currentElement?.tagName !== 'IMG' || currentElement.src !== iconValue) element.innerHTML = `<img src="${iconValue}" class="built-in-element">`;
    } else {
      if (currentElement?.tagName !== 'HA-ICON' || currentElement.icon !== iconValue) element.innerHTML = `<ha-icon icon="${iconValue}" class="built-in-element"></ha-icon>`;
    }
  }

  _arrayStylesToString(arr) { if (!Array.isArray(arr)) return ''; let cssText = ''; arr.forEach((styleObject) => { if (typeof styleObject !== 'object' || styleObject === null) return; for (const [key, rawValue] of Object.entries(styleObject)) { const evaluatedValue = this._evaluateTemplate(rawValue); if (evaluatedValue !== undefined && evaluatedValue !== null && String(evaluatedValue) !== '') { cssText += `${key}: ${evaluatedValue};`; } } }); return cssText; }
  
  // --- Helper functions (Unchanged) ---
  static _getGlobalTemplates() { try { const ha=document.querySelector("home-assistant"),main=ha?.shadowRoot?.querySelector("home-assistant-main"),panel=main?.shadowRoot?.querySelector("ha-panel-lovelace"),cfg=panel?.lovelace?.config; return cfg?.grid_template_card_templates||cfg?.button_card_templates||{} } catch(e){return{}} }
  static _deepClone(obj) { if(obj===null||typeof obj!=="object")return obj;if(Array.isArray(obj))return obj.map(x=>GridTemplateCard._deepClone(x));const out={};for(const k of Object.keys(obj))out[k]=GridTemplateCard._deepClone(obj[k]);return out }
  static _deepMerge(base,ext){if(base===null||typeof base!=="object")return GridTemplateCard._deepClone(ext);if(ext===null||typeof ext!=="object")return GridTemplateCard._deepClone(base);const out=Array.isArray(base)?base.slice():{...base};if(Array.isArray(base)&&Array.isArray(ext))return base.concat(ext);for(const k of Object.keys(ext)){const bv=out[k],ev=ext[k];if(Array.isArray(bv)&&Array.isArray(ev))out[k]=bv.concat(ev);else if(bv&&typeof bv==="object"&&ev&&typeof ev==="object")out[k]=GridTemplateCard._deepMerge(bv,ev);else out[k]=GridTemplateCard._deepClone(ev)}return out}
  _resolveTemplatesAndVariables(inputCfg){const globalTpl=GridTemplateCard._getGlobalTemplates(),tplEntries=[],pushByName=name=>{if(!name||typeof name!=="string")return;const def=globalTpl[name];if(!def){console.warn("[grid-template-card] 未找到模板:",name);return}tplEntries.push({name,def})};const rawTemplate=inputCfg.template??inputCfg.templates;if(rawTemplate){if(typeof rawTemplate==="string")pushByName(rawTemplate);else if(Array.isArray(rawTemplate))rawTemplate.forEach(pushByName)}const visited=new Set,unfold=tplDef=>{const name=Object.entries(globalTpl).find(([k,v])=>v===tplDef)?.[0];if(name){if(visited.has(name)){console.warn("[grid-template-card] 模板循环：",name);return{}}visited.add(name)}let merged={};const parentRef=tplDef?.template??tplDef?.templates;if(parentRef){const parents=Array.isArray(parentRef)?parentRef:[parentRef];for(const pName of parents){const pd=globalTpl[pName];if(!pd){console.warn("[grid-template-card] 模板未找到（父）:",pName);continue}merged=GridTemplateCard._deepMerge(merged,unfold(pd))}}merged=GridTemplateCard._deepMerge(merged,tplDef||{});return merged};let mergedCfg={};for(const{def:def}of tplEntries)mergedCfg=GridTemplateCard._deepMerge(mergedCfg,unfold(def));const tplVars=mergedCfg.variables||{},userVars=inputCfg.variables||{},finalVars=GridTemplateCard._deepMerge(tplVars,userVars);const{template,templates,variables,...restInput}=inputCfg;const finalCfg=GridTemplateCard._deepMerge(mergedCfg,restInput);return{finalCfg,finalVars}}
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
  getCardSize() { return this._finalConfig?.card_size || 3; }
}

if (!customElements.get('grid-template-card')) {
  customElements.define('grid-template-card', GridTemplateCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'grid-template-card',
    name: 'Grid Template Card v2.0.0',
    description: '一个支持模板和内置区域的网格布局卡片。'
  });
}
