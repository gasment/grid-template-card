class GridTemplateCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._config = null;

    // 首帧同步渲染控制
    this._initialMounted = false;      // 是否已完成首帧内容挂载
    this._pendingBatch = false;        // 是否正在批量创建子卡
  }

  setConfig(config) {
    if (!config.grid_areas || typeof config.grid_areas !== 'object') {
      throw new Error("grid-template-card: Missing or invalid 'grid_areas'");
    }
    this._config = config;
    this._renderSkeleton();   // 首次只渲染骨架（空格子，visibility:hidden）
    this._maybeMountBatch();  // 视情况触发批量创建子卡
  }

  set hass(hass) {
    this._hass = hass;

    // hass 到达后尝试进行首帧批量挂载
    this._maybeMountBatch();

    // 首帧之后，后续样式/模板更新
    if (this._initialMounted) {
      this._applyDynamicStyles();
      // 将 hass 透传给子卡
      const items = this.shadowRoot?.querySelectorAll(".grid-item") || [];
      items.forEach((item) => {
        const card = item.firstElementChild;
        if (card && card.hass !== hass) {
          card.hass = hass;
        }
      });
    }
  }

  get hass() {
    return this._hass;
  }

  /* ===================== 工具与模板 ===================== */

  // 模板求值：模板在 !hass 时返回空串，避免首帧写入无效值
  _evalTemplate(value) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    const isTemplate = trimmed.startsWith('[[[') && trimmed.endsWith(']]]');
    if (!isTemplate) return value;
    if (!this._hass) return '';

    try {
      const code = trimmed.slice(3, -3);
      const hass = this._hass;
      const states = hass?.states || {};
      const user = hass?.user;

      // 简易判断：是否为语句块
      const isBlock = /(\bvar\b|\bif\b|\blet\b|\bconst\b|;|\n|\breturn\b)/.test(code);
      const func = new Function(
        'hass', 'states', 'user',
        isBlock ? `"use strict"; ${code}` : `"use strict"; return (${code})`
      );
      return func(hass, states, user);
    } catch (e) {
      console.warn('grid-template-card: 模板错误', value, e);
      return '';
    }
  }

  // 检测对象/字符串里是否包含 [[[ ... ]]] 模板（用于可选策略；本实现首帧无须使用）
  _hasTemplates(obj) {
    if (!obj) return false;
    const stack = [obj];
    while (stack.length) {
      const cur = stack.pop();
      const t = typeof cur;
      if (t === 'string') {
        const s = cur.trim();
        if (s.startsWith('[[[') && s.endsWith(']]]')) return true;
      } else if (Array.isArray(cur)) {
        for (const it of cur) stack.push(it);
      } else if (t === 'object') {
        for (const v of Object.values(cur)) stack.push(v);
      }
    }
    return false;
  }

  // 将数组样式 [{prop: val}, {prop: val}] 转成字符串，并对值做模板求值
  _arrayStylesToString(arr) {
    if (!Array.isArray(arr)) {
      if (arr) {
        throw new Error(
          "grid-template-card: styles 必须使用数组形式，例如:\nstyles:\n  card:\n    - padding: 0px\n    - background: red"
        );
      }
      return '';
    }
    const merged = {};
    arr.forEach((item) => {
      if (typeof item !== 'object') return;
      Object.entries(item).forEach(([k, v]) => {
        merged[k] = this._evalTemplate(v);
      });
    });
    return Object.entries(merged)
      .filter(([_, v]) => v !== undefined && v !== null && String(v) !== '')
      .map(([k, v]) => `${k}: ${v};`)
      .join(' ');
  }

  /* ===================== 首帧：骨架 + 批量挂载 ===================== */

  _renderSkeleton() {
    if (!this._config || !this.shadowRoot) return;

    // 提前注入 hass（若可用，减少等待）
    if (window.provideHass) window.provideHass(this);

    const wrapper = document.createElement("div");
    wrapper.classList.add("grid-container");
    wrapper.style.visibility = 'hidden';     // 骨架阶段先隐藏，等内容齐备后同帧显示
    wrapper.dataset.stage = 'skeleton';

    const areas = this._config.grid_areas || {};
    for (const areaName of Object.keys(areas)) {
      const div = document.createElement("div");
      div.classList.add("grid-item");
      div.dataset.area = areaName;
      div.style.gridArea = areaName;
      wrapper.appendChild(div);
    }

    // 清空并挂载骨架
    this.shadowRoot.innerHTML = '';
    this.shadowRoot.appendChild(this._styleTag());
    this.shadowRoot.appendChild(wrapper);

    // 骨架阶段的容器样式（grid 布局先生效，保证尺寸占位稳定）
    this._applyDynamicStyles(/*skeleton=*/true);
  }

  async _maybeMountBatch() {
    // 仅在尚未完成首帧 && 未在进行中的情况下才触发
    if (this._initialMounted || this._pendingBatch) return;

    // 等待 hass：没有 hass 就不做首帧内容挂载，继续显示骨架
    if (!this._hass) return;

    // 开始批量创建子卡
    this._pendingBatch = true;
    try {
      const wrapper = this.shadowRoot?.querySelector(".grid-container");
      if (!wrapper) return;

      const areas = this._config?.grid_areas || {};
      const areaNames = Object.keys(areas);

      // 并行创建所有卡片
      const creationPromises = areaNames.map(async (name) => {
        const cfg = areas[name]?.card;
        if (!cfg) return { name, el: null };
        const el = await this._createCard(cfg);
        // 首帧就把 hass 透传进去，避免子卡自身迟一拍
        el.hass = this._hass;
        return { name, el };
      });

      const created = await Promise.all(creationPromises);

      // 一次性挂载到对应格子
      created.forEach(({ name, el }) => {
        const slot = wrapper.querySelector(`.grid-item[data-area="${name}"]`);
        if (!slot) return;
        if (el) {
          // 保守处理：清空后再塞，确保首帧全量一致
          slot.innerHTML = '';
          slot.appendChild(el);
        }
      });

      // 更新样式（此时 hass 已有，模板可求值）
      this._applyDynamicStyles(/*skeleton=*/false);

      // 同一帧统一显示
      requestAnimationFrame(() => {
        wrapper.style.visibility = 'visible';
        wrapper.dataset.stage = 'mounted';
        this._initialMounted = true;
      });
    } finally {
      this._pendingBatch = false;
    }
  }

  /* ===================== 常规创建与样式 ===================== */

  async _createCard(cardConfig) {
    const tag = cardConfig.type && cardConfig.type.startsWith("custom:")
      ? cardConfig.type.substr(7)
      : `hui-${cardConfig.type}-card`;

    let el = document.createElement(tag);

    // 如果是自定义元素且尚未注册，等待注册完成（防止首刷时序问题）
    if (tag.includes("-") && !customElements.get(tag)) {
      try {
        await customElements.whenDefined(tag);
      } catch (_) {
        // 某些环境不会抛错，这里只是兜底
      }
    }

    // 有些浏览器在自定义元素升级后，已创建的节点不会补上实例方法；
    // 此时重建一次元素，确保拿到带 setConfig 的升级实例。
    if (typeof el.setConfig !== "function" && customElements.get(tag)) {
      el = document.createElement(tag);
    }

    // 仍然没有 setConfig，直接给出友好错误卡，避免抛到控制台
    if (typeof el.setConfig !== "function") {
      const err = document.createElement("hui-error-card");
      err.setConfig({
        type: "error",
        error: `${tag} 未就绪或不是 Lovelace 卡片。请确认资源已以 type=module 加载，且未被延迟/重复加载。`,
        originalConfig: cardConfig,
      });
      if (this._hass) err.hass = this._hass;
      return err;
    }

    try {
      el.setConfig(cardConfig);
    } catch (e) {
      console.error("grid-template-card: error creating card", e);
      const err = document.createElement("hui-error-card");
      err.setConfig({
        type: "error",
        error: e && e.message ? e.message : String(e),
        originalConfig: cardConfig,
      });
      if (this._hass) err.hass = this._hass;
      return err;
    }

    if (this._hass) el.hass = this._hass;
    return el;
  }


  _applyDynamicStyles(skeleton = false) {
    if (!this._config || !this.shadowRoot) return;
    const wrapper = this.shadowRoot.querySelector(".grid-container");
    if (!wrapper) return;

    // grid 主体样式（支持模板，但在 skeleton 阶段模板多为空串）
    const grid = this._config.grid || [];
    const baseStyles = {
      display: "grid",
      ...(grid[0] || {}),
      ...(grid[1] || {}),
      ...(grid[2] || {}),
      ...(grid[3] || {}),
      ...(grid[4] || {}),
      ...(grid[5] || {}),
      ...(grid[6] || {}),
    };

    // 先应用基础 grid 样式
    let gridStyleStr = Object.entries(baseStyles)
      .map(([k, v]) => {
        const vv = this._evalTemplate(v);
        return (vv !== undefined && vv !== null && String(vv) !== '') ? `${k}: ${vv};` : '';
      })
      .filter(Boolean)
      .join(' ');

    // 叠加 styles.card（数组）
    gridStyleStr += this._arrayStylesToString(this._config.styles?.card);

    // 注意：不要覆盖 wrapper 上我们用于阶段控制的 visibility
    const prevVisibility = wrapper.style.visibility;
    wrapper.style.cssText = gridStyleStr;
    if (prevVisibility) wrapper.style.visibility = prevVisibility;

    // 每个区域 styles.grid[areaName]
    const areas = this._config.grid_areas || {};
    for (const areaName of Object.keys(areas)) {
      const el = this.shadowRoot.querySelector(`.grid-item[data-area="${areaName}"]`);
      if (!el) continue;
      el.style.gridArea = areaName; // 固定区域名
      const gridStyles = this._config.styles?.grid?.[areaName];
      if (gridStyles) {
        el.style.cssText += this._arrayStylesToString(gridStyles);
      }
    }
  }

  _styleTag() {
    const style = document.createElement("style");
    style.textContent = `
      .grid-container {
        width: 100%;
        height: 100%;
      }
      .grid-item {
        box-sizing: border-box;
        min-width: 0;
        min-height: 0;
        overflow: visible;
      }
    `;
    return style;
  }

  getCardSize() {
    return 1;
  }
}

if (!customElements.get('grid-template-card')) {
  customElements.define('grid-template-card', GridTemplateCard);
}
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === 'grid-template-card')) {
  window.customCards.push({ 
    type: 'grid-template-card', 
    name: 'Grid template Card', 
    description: '一个自定义grid网格布局卡片' 
  });
}