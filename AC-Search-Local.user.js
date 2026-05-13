// ==UserScript==
// @name         AC-Search-Local-本地搜索优化
// @name:en      AC-Search-Local-Search-Enhancer
// @name:zh      AC-Search-Local-本地搜索优化
// @description  本地化搜索引擎优化：去重定向、去广告、Favicon、双列/多列布局、暗黑模式、自动翻页、域名拦截
// @author       AC (Local Fork)
// @license      GPL-3.0-only
// @version      1.0.31
// @run-at       document-start
// @namespace    ac-search-local
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_addValueChangeListener
// @grant        GM_listValues
// @connect      baidu.com
// @connect      google.com
// @connect      google.com.hk
// @connect      google.com.jp
// @connect      bing.com
// @connect      duckduckgo.com
// @connect      dogedoge.com
// @connect      so.com
// @include      *://ipv6.baidu.com/*
// @include      *://www.baidu.com/*
// @include      *://www1.baidu.com/*
// @include      *://m.baidu.com/*
// @include      *://xueshu.baidu.com/*
// @include      *://www.so.com/*
// @include      *://*.bing.com/*
// @include      *://encrypted.google.*/search*
// @include      *://*.google.*/search*
// @include      *://scholar.google.*/*
// @include      *://*.google.*/webhp*
// @include      *://duckduckgo.com/*
// @include      *://*.dogedoge.com/*
// @include      *://*.tujidu.com/*
// @exclude      *://*.google.*/sorry*
// @exclude      *://zhidao.baidu.com/*
// @exclude      *://lens.google.com/*
// @require      https://registry.npmmirror.com/vue/3.5.26/files/dist/vue.runtime.global.prod.js
// @noframes
// ==/UserScript==

/* global Vue, GM_getValue, GM_setValue, GM_addStyle, GM_xmlhttpRequest, GM_registerMenuCommand, GM_addValueChangeListener, GM_listValues */

(async function () {
  'use strict';

  // ===================== GM API 安全绑定 =====================
  const GM = {
    getValue: (k, d) => GM_getValue(k, d),
    setValue: (k, v) => GM_setValue(k, v),
    addStyle: (css) => GM_addStyle(css),
    xhr: (opts) => GM_xmlhttpRequest(opts),
    registerMenu: (name, fn) => GM_registerMenuCommand(name, fn),
    addChangeListener: (k, fn) => GM_addValueChangeListener(k, fn),
    listValues: () => GM_listValues(),
  };

  // ===================== 工具函数 (MyApi) =====================
  const $ = {
    /** 安全执行函数 */
    safeFn(cb, fallback) {
      try { return cb(); } catch (e) { return fallback && fallback(); }
    },

    /** 等待元素后执行 */
    waitEl(selector, callback, interval = 200, once = true, timeout = 15000) {
      if (typeof selector === 'string' && selector.startsWith('fn:')) {
        return $.waitFn(new Function('return ' + selector.slice(3)), callback, interval, once, timeout);
      }
      let count = Math.ceil(timeout / interval);
      let timer = setInterval(() => {
        count--;
        const el = document.querySelector(selector);
        if (el) {
          if (once) clearInterval(timer);
          callback(el);
        }
        if (count <= 0) {
          clearInterval(timer);
        }
      }, interval);
    },

    /** 等待函数返回值为真后执行 */
    waitFn(fn, callback, interval = 200, once = true, timeout = 15000) {
      let count = Math.ceil(timeout / interval);
      let timer = setInterval(() => {
        count--;
        const res = fn();
        if (res) {
          if (once) clearInterval(timer);
          callback(res);
        }
        if (count <= 0) {
          clearInterval(timer);
        }
      }, interval);
    },

    /** 提取URL参数 */
    getUrlParam(url, param, decode = true) {
      const [, search = ''] = (url || location.href).split('?');
      for (const pair of search.split('&')) {
        const [k, v] = pair.split('=');
        if (k === param) return decode ? decodeURIComponent(v || '') : (v || '');
      }
      return '';
    },

    /** HTTP GET */
    httpGet(url, timeout = 8000) {
      return new Promise((resolve) => {
        GM.xhr({
          url,
          method: 'GET',
          timeout,
          fetch: true,
          onload: (r) => resolve([null, r.responseText, r.responseHeaders]),
          onerror: (r) => resolve([r, '', {}]),
          ontimeout: () => resolve(['timeout', '', {}]),
        });
      });
    },

    /** 节流 */
    throttle(fn, delay) {
      let timer = null, start = Date.now();
      return function () {
        const ctx = this, args = arguments;
        const remaining = delay - (Date.now() - start);
        clearTimeout(timer);
        if (remaining <= 0) {
          fn.apply(ctx, args);
          start = Date.now();
        } else {
          timer = setTimeout(() => { fn.apply(ctx, args); start = Date.now(); }, remaining);
        }
      };
    },

    /** 防抖 */
    debounce(fn, delay) {
      let timer = null;
      return function () {
        clearTimeout(timer);
        const ctx = this, args = arguments;
        timer = setTimeout(() => fn.apply(ctx, args), delay);
      };
    },

    /** 正则提取 */
    regGet(str, regex) {
      try { return new RegExp(regex).exec(str)[1]; } catch (e) { return ''; }
    },

    /** XPath获取单个元素 */
    xpath(xpath, ctx = document) {
      return $.safeFn(() => document.evaluate(xpath, ctx, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue);
    },

    /** XPath获取所有元素 */
    xpathAll(xpath, ctx = document) {
      const result = [];
      $.safeFn(() => {
        const query = document.evaluate(xpath, ctx, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        for (let i = 0; i < query.snapshotLength; i++) {
          if (query.snapshotItem(i).nodeType === 1) result.push(query.snapshotItem(i));
        }
      });
      return result;
    },

    /** 通用元素获取（支持css:/xpath:/id()/函数） */
    getAll(selector, ctx = document) {
      if (!selector) return [];
      if (typeof selector === 'string') {
        if (selector.startsWith('css:')) return [...ctx.querySelectorAll(selector.slice(4))];
        if (selector.startsWith('id(')) {
          const el = document.getElementById(selector.slice(3, -1));
          return el ? [el] : [];
        }
        if (selector.startsWith('a[') || selector.startsWith('div[') || selector.startsWith('id(') || selector.includes('@') || selector.includes('contains(')) {
          return $.xpathAll(selector, ctx);
        }
        return [...ctx.querySelectorAll(selector)];
      }
      if (typeof selector === 'function') return selector(ctx, window);
      return [];
    },

    /** 隐藏节点 */
    hideNode(el) {
      if (el && !el.hasAttribute('ac-hide')) {
        el.setAttribute('ac-hide', '1');
        el.style.setProperty('display', 'none', 'important');
      }
    },

    /** 安全删除广告 */
    safeRemoveAd(sel) {
      $.safeFn(() => {
        document.querySelectorAll(sel).forEach(el => el.remove());
      });
    },

    /** 安全删除XPath */
    safeRemoveXpath(xpath, useHide) {
      $.safeFn(() => {
        const nodes = $.xpathAll(xpath);
        if (useHide) nodes.forEach(n => $.hideNode(n));
        else nodes.forEach(n => n.remove());
      });
    },

    /** 添加样式 */
    addStyleEl(cssText, id) {
      if (id && document.getElementById(id)) return;
      const style = document.createElement('style');
      if (id) style.id = id;
      style.textContent = cssText;
      $.safeFn(() => (document.head || document.documentElement).appendChild(style));
    },
  };

  // ===================== 配置管理 =====================
  const STORAGE_KEY = 'ACSearchLocalConfig';
  const BLOCK_KEY = 'ACSearchLocalBlocks';

  const DEFAULT_CONFIG = {
    // 通用
    isRedirectEnable: true,
    isAdsEnable: true,
    isFaviconEnable: true,
    isAutopage: true,
    isBlockEnable: true,
    isBlockResultDisplay: false,
    isBlockBtnDisplay: true,
    isCounterEnable: false,
    isALineDisable: false,
    isDarkModeEnable: true,
    adsStyleMode: 3,
    customStyleEnable: false,
    customStyleLess: '',
    commonStyleEnable: false,
    commonStyleLess: '',
    // 百度
    baidu_doRemoveSug: true,
    baiduLiteEnable: false,
    // 谷歌
    google_useBaiduLogo: false,
    // 鸭鸭
    duck_optimizeDuck: true,
  };

  let config = { ...DEFAULT_CONFIG };
  let blockList = [];

  async function loadConfig() {
    try {
      const saved = await GM.getValue(STORAGE_KEY, '{}');
      const parsed = JSON.parse(saved);
      config = Object.assign({}, DEFAULT_CONFIG, parsed);
    } catch (e) {
      config = { ...DEFAULT_CONFIG };
    }
    try {
      const blocks = await GM.getValue(BLOCK_KEY, '[]');
      blockList = JSON.parse(blocks);
    } catch (e) {
      blockList = [];
    }
  }

  function saveConfig() {
    GM.setValue(STORAGE_KEY, JSON.stringify(config));
  }

  function saveBlocks() {
    GM.setValue(BLOCK_KEY, JSON.stringify(blockList));
    _blockFilterDone = false;
    if (siteCfg) document.querySelectorAll(siteCfg.main).forEach(n => delete n.dataset.checked);
  }

  // ===================== 站点检测与选择器 =====================
  function detectSite() {
    const h = location.host;
    const p = location.href;

    const specialMap = {
      'xueshu.baidu.com': 'baidu_xueshu',
      'scholar.google.com': 'google_scholar',
      'so.com': 'haosou',
    };

    for (const [k, v] of Object.entries(specialMap)) {
      if (h.includes(k)) return v;
    }

    if (h.includes('duckduckgo')) return 'duck';

    const match = h.match(/\.?(baidu|google|bing|duck|dogedoge)\./);
    if (match) {
      if (match[1] === 'google') return 'google';
      if (match[1] === 'bing') return 'bing';
      if (match[1] === 'duck') return 'duck';
      if (match[1] === 'dogedoge') return 'doge';
      return 'baidu';
    }

    if (h.includes('haosou')) return 'haosou';
    return '';
  }

  // 各站点选择器配置
  const SITE_CONFIGS = {
    baidu: {
      id: 1,
      main: '#content_left .c-container',
      linkSel: 'h3.t a, .c-container article a',
      faviconSel: 'h3 a',
      faviconInsertTo: 'h3',
      counterSel: '#content_left #double div[srcid] [class~=t] a:first-child, [class~=op_best_answer_question], #content_left div[srcid] [class~=t] a:first-child, [class~=op_best_answer_question]',
      blockSel: 'h3 a',
      multiCol: '#container #content_left, body[news] #container #content_left div:not([class]):not([id])',
      pager: {
        nextLink: null,
        nextLinkFn: () => [...document.querySelectorAll('#page a')].find(a => a.textContent.includes('下一页')),
        pageElement: 'css:div#content_left > *',
        insertTo: ['css:div#content_left', 2],
        replaceE: 'css:#page',
        stylish: '.autopagerize_page_info, div.sp-separator {margin-bottom:10px !important;}.c-img-border{display:none}',
      },
      menuInsertSel: '#u',
    },
    google: {
      id: 4,
      main: '#rso .vt6azd, div[data-micp-id="rso"] .vt6azd',
      linkSel: '.vt6azd h3 a, .g h3 a',
      faviconSel: '.zReHs',
      faviconInsertTo: 'h3',
      counterSel: '#rso .vt6azd h3:not(table h3), ._yE div[class~=_kk] h3',
      blockSel: '.vt6azd h3',
      multiCol: '.srg, #rso, div[two-father], #rso div:not(.vt6azd), #kp-wp-tab-overview',
      pager: {
        nextLink: null,
        nextLinkFn: () => document.getElementById('pnnext'),
        pageElement: 'css:#rso > .MjjYud',
        insertTo: ['css:#rso', 2],
        replaceE: null,
      },
      menuInsertSel: '#gb',
    },
  bing: {
      id: 5,
      main: '#b_results li.b_algo',
      linkSel: 'h2 a',
      faviconSel: '.b_attribution cite',
      faviconInsertTo: 'h2',
      counterSel: '#b_results li[class~=b_ans] h2, #b_results li[class~=b_algo] h2',
      blockSel: 'h2 a',
      multiCol: '#b_content #b_results',
      pager: {
        nextLink: null,
        nextLinkFn: () => document.querySelector('a.sb_pagN'),
        pageElement: 'css:#b_results li.b_algo',
        insertTo: ['css:#b_results', 2],
        replaceE: null,
      },
      menuInsertSel: '#b_header #id_h',
    },
    duck: {
      id: 10,
      main: '#react-layout li',
      linkSel: 'h2 a',
      faviconSel: '.nrn-react-div .result__url__domain',
      faviconInsertTo: 'h2',
      counterSel: '#react-layout li h2 a',
      blockSel: 'h2 a',
      multiCol: '#react-layout .react-results--main',
      pager: {
        nextLink: '.result--more a, a.result--more, #links .result--more a',
        pageElement: 'css:#react-layout ol li, css:#react-layout .react-results--main > li',
        insertTo: ['css:#react-layout .react-results--main', 2],
        replaceE: null,
      },
      menuInsertSel: '.header--aside',
    },
    haosou: {
      id: 3,
      main: '.res-list',
      linkSel: 'h3 a',
      faviconSel: 'cite',
      faviconInsertTo: 'h3',
      counterSel: '.results div',
      blockSel: 'h3 a',
      multiCol: '.result li',
      pager: {
        nextLink: 'div[@id="page"]/a[text()="下一页"]|id("snext")',
        pageElement: 'div[@id="container"]/div[@id="main"]/ul[@class="result"]/li',
        insertTo: ['div[@id="container"]/ul[@class="result"]', 2],
        replaceE: 'id("page")',
      },
      menuInsertSel: '#header .inner .menu',
    },
    doge: {
      id: 6,
      main: '.result',
      linkSel: 'h2 a',
      faviconSel: '.url',
      faviconInsertTo: 'h2',
      counterSel: '.result h2 a',
      blockSel: 'h2 a',
      multiCol: '#results .result',
      pager: {
        nextLink: 'a[text()="下一页"]',
        pageElement: 'css:.result',
        insertTo: ['css:#results', 2],
        replaceE: 'css:.pager',
      },
      menuInsertSel: '.header .inner .menu',
    },
    baidu_xueshu: {
      id: 8,
      main: '#content_left .result',
      linkSel: 'h3.t a, #results .c-container.c-block a',
      faviconSel: 'h3',
      faviconInsertTo: 'h3',
      counterSel: '#content_left #double div[srcid] [class~=t] a, [class~=op_best_answer_question], #content_left div[srcid] [class~=t] a, [class~=op_best_answer_question]',
      blockSel: 'h3 a',
      multiCol: null,
      pager: null,
      menuInsertSel: null,
    },
    google_scholar: {
      id: 4.1,
      main: '#rso .g, div[data-micp-id="rso"] .g',
      linkSel: 'h3 a',
      faviconSel: '.iUh30',
      faviconInsertTo: 'h3',
      counterSel: '#rso .g h3:not(table h3), ._yE div[class~=_kk] h3',
      blockSel: 'a:not([href*="translate.google.com"])',
      multiCol: null,
      pager: {
        nextLink: 'a[./span[@class="gs_ico gs_ico_nav_next"]]',
        pageElement: 'div[@class="gs_r gs_or gs_scl"]',
        insertTo: null,
        replaceE: 'div[@id="navcnt"]|div[@id="rcnt"]//div[@role="navigation"]',
      },
      menuInsertSel: null,
    },
  };

  const currentSite = detectSite();
  const siteCfg = SITE_CONFIGS[currentSite] || null;

  // ===================== 内嵌CSS样式 =====================
  // 所有样式从原始Less文件编译为CSS后嵌入，无外部依赖

  // 百度通用样式
  const CSS_baiduCommon = `/**Store BaiduCommonStyle**/
iframe:not([src*='chrome']),
.res_top_banner #foot,
#page .fk,
#head .headBlock,
#rs_top_new,
#wrapper #content_left > table,
#wrapper #content_left .c-recommend,
#wrapper #content_left .leftBlock,
#wrapper #content_left .rrecom-btn-parent,
#demo,
#wrapper #gotoPage,
body > div.result-op,
.rrecom-container,
.selected-search-box,
.chunwan-wrapper {
  display: none !important;
}
body[baidu] {
  background-color: #fAfAfA;
  /*transition: all ease-out 0.8s;*/
}
#ala_img_results {
  overflow: hidden;
}
body a,
body a em,
#u a,
#wrapper #content_left .result h3 a em {
  text-decoration: none;
}
body a:hover,
body a:hover em {
  text-decoration: none;
}
#wrapper #s_tab {
  border-bottom: #e0e0e0 1px solid;
  background-color: unset;
}
body #head {
  top: 0;
  background-color: rgba(248, 248, 248, 0.4);
  border-bottom: none;
  backdrop-filter: blur(10px);
}
form.fm {
  background-color: unset;
}
form.fm .s_btn {
  background: #3476d2;
  border-bottom: 1px solid #3476d2;
}
form.fm .s_btn:hover {
  background: #4F7FbF;
  border-bottom: 1px solid #3476d2;
}
form.fm .bdsug li {
  width: auto;
  color: #000;
  font: 15px arial;
  line-height: 26px;
}
form.fm .s_ipt_wr.bg {
  background: #fff;
  width: 66%;
  min-width: 570px;
}
#content_left .new-pmd .c-span9,
#content_left .new-pmd .c-span10 {
  width: unset;
  float: unset;
  overflow: hidden;
}
/***fix 2k+ problem***/
#head .head_wrapper {
  width: unset;
  /*edit: fix baidu banner position*/
}
#wrapper #s_tab b {
  color: #3476d2;
  border-bottom: 3px #3476d2 solid;
}
#wrapper .head_nums_cont_outer .search_tool_conter,
#wrapper .head_nums_cont_outer .nums {
  width: 630px;
}
#wrapper #content_left {
  animation: ani_topTobuttom 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
}
#head .head_wrapper {
  animation: ani_leftToright 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}
#wrapper #rs,
#wrapper #content_left .result,
#wrapper #content_left .result-op,
#wrapper #content_left div[class*='vmp-project'],
#wrapper #content_left > .c-container,
#container.sam_newgrid #content_left .result,
#container.sam_newgrid #content_left .result-op,
#container.sam_newgrid #content_left > .c-container {
  margin-left: 0;
  margin-right: 0;
}
#wrapper #rs.ac-entry-ani,
#wrapper #content_left .result.ac-entry-ani,
#wrapper #content_left .result-op.ac-entry-ani,
#wrapper #content_left > .c-container.ac-entry-ani {
  animation: ani_topTobuttom 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}
#wrapper #rs div[class*='_aladdin'],
#wrapper #content_left .result div[class*='_aladdin'],
#wrapper #content_left .result-op div[class*='_aladdin'],
#wrapper #content_left > .c-container div[class*='_aladdin'] {
  border-top: 1px solid white;
}
#wrapper #content_left > .c-container:hover,
#wrapper #content_left > .result:hover,
#wrapper #content_left > .result-op:hover,
#wrapper #content_left > .c-container:hover article {
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
  transform: translateY(-2px);
}
#wrapper #rs[ac-needhide],
#wrapper #content_left > .result[ac-needhide],
#wrapper #content_left > .result-op[ac-needhide],
#wrapper #content_left > .c-container[ac-needhide] {
  padding: 5px;
  padding-left: 15px;
}
#wrapper #content_left > .result[tpl='soft'] .op-soft-title,
#wrapper #content_left > .result h3[class*='title'],
#wrapper #content_left > .c-container h3[class*='title'] {
  background-color: #f8f8f8;
  margin: 0px -8px 10px -20px;
  padding: 8px 20px 5px;
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
}
.title-box_4YBsj {
  width: 100%;
}
#wrapper #content_left .f13 a,
#wrapper #content_left .f13 em,
#wrapper #content_left .c-span18 a,
#wrapper #content_left .subLink_factory a,
#wrapper #content_left .subLink_answer a,
#wrapper #content_left .c-tabs-content a,
#wrapper #content_left .op_offical_weibo_content a,
#wrapper #content_left .op_offical_weibo_pz a,
#wrapper #content_left .op_tieba2_tablinks_container a,
#wrapper #content_left .op-tieba-general-right,
#wrapper #content_left .op_dq01_title,
#wrapper #content_left .op_dq01_table a,
#wrapper #content_left .op_dq01_morelink a,
#wrapper #content_left .op-tieba-general-mainpl a,
#wrapper #content_left .op-se-listen-recommend,
#wrapper #content_left .c-offset > div a {
  text-decoration: none;
  color: #3476d2;
}
#wrapper #content_left .f13 a:hover,
#wrapper #content_left .f13 em:hover,
#wrapper #content_left .c-span18 a:hover,
#wrapper #content_left .subLink_factory a:hover,
#wrapper #content_left .subLink_answer a:hover,
#wrapper #content_left .c-tabs-content a:hover,
#wrapper #content_left .op_offical_weibo_content a:hover,
#wrapper #content_left .op_offical_weibo_pz a:hover,
#wrapper #content_left .op_tieba2_tablinks_container a:hover,
#wrapper #content_left .op-tieba-general-right:hover,
#wrapper #content_left .op_dq01_title:hover,
#wrapper #content_left .op_dq01_table a:hover,
#wrapper #content_left .op_dq01_morelink a:hover,
#wrapper #content_left .op-tieba-general-mainpl a:hover,
#wrapper #content_left .op-se-listen-recommend:hover,
#wrapper #content_left .c-offset > div a:hover {
  text-decoration: underline !important;
}
#wrapper #content_left .f13 a {
  color: #008000;
}
#wrapper #content_left .c-span18,
#wrapper #content_left .c-span24 {
  width: 100%;
  min-width: unset;
}
#wrapper #content_left .op_jingyan_list,
#wrapper #content_left .se_com_irregular_gallery ul li,
#wrapper #content_left .result .op-img-address-link-type {
  display: inline-block;
  margin-left: 10px;
}
#wrapper #content_left .c-border {
  width: auto;
  border: none;
  border-bottom-color: transparent;
  border-right-color: transparent;
  box-shadow: 0 0 0 transparent;
}
#wrapper #content_left .op-soft-title h3[class*='t'],
#wrapper #content_left .result h3[class*='t'],
#wrapper #content_left .result-op h3[class*='t'],
#wrapper #content_left > .c-container h3[class*='t'] {
  font-weight: bold;
  font-size: medium;
}
#wrapper #content_left .op-soft-title a,
#wrapper #content_left .result a,
#wrapper #content_left .result-op a,
#wrapper #content_left > .c-container a {
  color: #3476d2;
  position: relative;
}
#wrapper #content_left .op-soft-title a em,
#wrapper #content_left .result a em,
#wrapper #content_left .result-op a em,
#wrapper #content_left > .c-container a em {
  color: #f73131;
  font-weight: bold;
}
#wrapper #content_left .op-soft-title a:visited,
#wrapper #content_left .result a:visited,
#wrapper #content_left .result-op a:visited,
#wrapper #content_left > .c-container a:visited {
  color: #660099;
}
#wrapper #content_left .op-soft-title a:after,
#wrapper #content_left .result a:after,
#wrapper #content_left .result-op a:after,
#wrapper #content_left > .c-container a:after,
#wrapper #content_left .op-soft-title a:visited:after,
#wrapper #content_left .result a:visited:after,
#wrapper #content_left .result-op a:visited:after,
#wrapper #content_left > .c-container a:visited:after {
  content: "";
  position: absolute;
  border-bottom: 2px solid #3476d2;
  bottom: -2px;
  left: 100%;
  width: 0;
  transition: width 350ms, left 350ms;
}
#wrapper #content_left .op-soft-title a:hover:after,
#wrapper #content_left .result a:hover:after,
#wrapper #content_left .result-op a:hover:after,
#wrapper #content_left > .c-container a:hover:after,
#wrapper #content_left .op-soft-title a:visited:hover:after,
#wrapper #content_left .result a:visited:hover:after,
#wrapper #content_left .result-op a:visited:hover:after,
#wrapper #content_left > .c-container a:visited:hover:after {
  left: 0;
  width: 100%;
  transition: width 350ms;
}
#wrapper #content_left .c-group-wrapper {
  padding: 30px;
  margin: 0 0 20px 0;
  min-width: 610px;
}
#wrapper #content_left .c-group-wrapper > .c-container {
  min-width: unset;
}
#wrapper #content_left .c-group-wrapper .c-group {
  margin: 0;
  padding-top: 10px;
}
#wrapper #rs {
  padding: unset;
  margin: 20px;
  border-radius: 5px;
  z-index: 1;
}
#wrapper #rs .new-pmd {
  padding: 20px;
}
#wrapper #rs .tt {
  margin: -20px -20px 5px -20px;
  padding: 15px 20px;
  background-color: #f8f8f8;
  border-radius: 5px 5px 0px 0px;
}
#wrapper #rs table {
  width: 630px;
  padding: 5px 15px;
}
#wrapper #rs table tr a {
  margin-top: 5px;
  margin-bottom: 5px;
  color: #3476d2;
}
#wrapper #rs table tr a:hover {
  text-decoration: underline;
}
.wrapper_new #form .bdsug-new {
  padding-right: 11px;
}
#wrapper #page {
  min-width: 710px;
  height: 40px;
  line-height: 40px;
  padding-top: 5px;
  margin-bottom: 50px;
  margin-left: 0;
}
#wrapper #page a,
#wrapper #page strong {
  color: #3476d2;
  height: auto;
}
#wrapper #page .n {
  height: 34px;
}
#wrapper #page .n:hover,
#wrapper #page a:hover .pc {
  background: #d8d8d8;
  color: #0057da;
  filter: brightness(1.1);
}
#wrapper #page strong .pc {
  background: #3476d2;
  color: white;
}
.op-img-address-desktop-cont {
  overflow: hidden;
}
.op-img-address-divide-high {
  overflow: hidden;
}
#wrapper #kw {
  width: 94%;
}
#container.sam_newgrid .c-container .t:not([class*='doc-title']) {
  margin-top: 18px;
}
#container.sam_newgrid .c-container .t:not([class*='doc-title']) .AC-faviconT ~ a,
#container.sam_newgrid .c-container .t:not([class*='doc-title']) .c-icon ~ a {
  display: inline;
}
body #wrapper #content_left a[href*='official'] {
  color: white;
}
#content_left .cu-border {
  box-shadow: unset;
  -webkit-box-shadow: unset;
}
#content_left .c-group-middle,
#content_left .c-group-top {
  margin-bottom: 30px !important;
}
#container.sam_newgrid #content_left .c-container .c-container {
  width: auto;
  min-width: unset;
}
#container.sam_newgrid #content_right .right-ceiling {
  position: unset;
}
#wrapper #content_left > .c-container article {
  padding-top: 15px;
  border: unset !important;
  box-shadow: unset !important;
}
body .wrapper_new #head.fix-head .s_form {
  height: 70px;
}
.AC.sp-separator {
  margin-top: -10px;
  width: 650px;
}
#wrapper #content_right {
  width: 0;
  height: 0;
  overflow: hidden;
  opacity: 0;
}
.ec-tuiguang {
  background-color: red;
  color: white;
}
body.showRight #wrapper #content_right {
  width: 400px;
  height: unset;
  overflow: unset;
  opacity: 1;
}
body[baidu] .new-pmd .c-img-s {
  display: none;
}
body[baidu].pc-fresh-wrapper-con .new-pmd .c-span12 {
  width: unset;
}
.result-molecule #searchTag {
  background: unset;
}
.result-molecule #searchTag.tag-fixed {
  left: 0;
}
.result-molecule #searchTag:not(.tag-fixed) {
  overflow: hidden;
}
.result-molecule #searchTag:not(.tag-fixed) div[class*='tag-wrapper'] {
  margin-left: unset;
}
.result-molecule #searchTag:not(.tag-fixed) div[class*='tag-wrapper'] div[class*='tag-scroll'] {
  text-align: center;
}
.result-molecule #page > div {
  width: unset;
}
#wrapper #content_left > .c-container[tpl='recommend_list'] {
  padding-top: 10px;
  display: flex;
  align-items: center;
}
#wrapper #content_left > .c-container[tpl='wenda_generate'],
#wrapper #content_left > .c-container[tpl='ai_index'] {
  height: 400px;
  overflow-y: auto;
  overflow-x: clip;
}
#content_left .hit-toptip {
  grid-column-start: 1;
  grid-column-end: xmain-end;
}
@media screen and (max-width: 1280px) {
  #u .toindex,
  #u #imsg {
    display: none;
  }
}
.wrapper_new #s_tab.s_tab .s_tab_inner {
  align-items: center;
}
.wrapper_new #s_tab.s_tab .s_tab_inner > *:after {
  display: none;
}
@media screen and (min-width: 1921px) {
  /*Baidu in 2K screen default in : center*/
  #head .head_wrapper {
    transform: translateX(-100px);
    justify-content: center;
    display: flex;
  }
  body[baidu] .wrapper_new #s_tab.s_tab .s_tab_inner {
    align-items: center;
    padding-left: 200px;
  }
  body[baidu] .wrapper_new #s_tab.s_tab .s_tab_inner > *:after {
    display: none;
  }
  body[baidu] #container.sam_newgrid {
    padding-left: 316px;
  }
  body[baidu] .result-molecule.new-pmd[tpl="app/search-tag"] {
    padding-left: calc(51.56vw - 810px);
  }
  form.fm .s_ipt_wr.bg {
    min-width: 480px;
  }
  body.showRight #head .head_wrapper {
    transform: translateX(45px);
  }
  /* 标准密度设备 */
  #wrapper #content_right table {
    margin-left: 100px;
  }
}
@media screen and (min-width: 1921px) and screen and (resolution: 1dppx) {
  #wrapper #rs,
  #wrapper #content_left .result,
  #wrapper #content_left .result-op,
  #wrapper #content_left > .c-container {
    min-width: 888px;
    margin-left: calc(var(--wrapper-padding)*-1.3);
  }
}
@media screen and (min-width: 1921px) and (min-resolution: 1.2dppx) and (max-resolution: 2dppx) {
  #wrapper #rs,
  #wrapper #content_left .result,
  #wrapper #content_left .result-op,
  #wrapper #content_left > .c-container {
    margin-left: calc(var(--wrapper-padding)*-1.3);
  }
}
`;

  // 百度单列居中
  const CSS_baiduOnePage = `/**Store BaiduOnePageStyle**/
#wrapper_wrapper #container {
  width: 100%;
  margin-left: unset;
}
form.fm {
  position: relative;
  background-color: unset;
}
body[baidu] .pagefoot.gj {
  margin-top: 100px;
}
.wrapper_new .head_wrapper #result_logo {
  margin-left: -150px;
  position: relative;
}
#s_tab b,
#s_tab a {
  position: relative;
}
#wrapper .head_nums_cont_outer {
  position: absolute;
  left: 20%;
  width: 60%;
}
#wrapper #content_left {
  margin: 0 auto !important;
  padding-left: unset !important;
}
#wrapper_wrapper #container #header_top_bar {
  margin: 0 auto;
}
#wrapper #content_left,
#wrapper #container.sam_newgrid #rs,
#wrapper #page {
  position: relative;
  padding-left: 0px;
  width: 45% !important;
  max-width: 900px;
  min-width: 670px;
  float: unset;
  margin-left: unset;
  margin: 0 auto;
}
@media only screen and (min-resolution: 1.25dppx) {
  #wrapper #content_left,
  #wrapper #container.sam_newgrid #rs,
  #wrapper #page {
    width: 50% !important;
  }
}
@media screen and (max-width: 1280px) {
  #wrapper #content_left,
  #wrapper #container.sam_newgrid #rs,
  #wrapper #page {
    width: 80% !important;
  }
}
#wrapper #page {
  background: unset;
}
#wrapper #rs th {
  text-align: center;
}
#wrapper #rs {
  position: relative;
  margin: 30px auto -20px auto;
}
#wrapper #content_left .result,
#wrapper #content_left .result-op,
#wrapper #content_left div[class*='vmp-project'],
#wrapper #content_left > .c-container {
  width: 100% !important;
  min-width: 650px;
}
@media screen and (min-width: 1000px) {
  #wrapper #content_left,
  #wrapper #rs {
    min-width: 800px;
  }
}
#wrapper #container.sam_newgrid #content_left {
  padding-left: 20px;
  display: block;
}
#wrapper #content_right {
  float: unset;
  position: absolute;
}
body.showRight #wrapper #container.sam_newgrid #content_left {
  transform: translateX(calc(10vw - 320px));
}
body.showRight #wrapper #content_right {
  right: calc(40vw - 500px);
}
@media screen and (max-width: 1280px) {
  body.showRight #wrapper #container.sam_newgrid #content_left {
    transform: unset;
  }
  body.showRight #wrapper #content_right {
    width: 0;
    height: 0;
    overflow: hidden;
    opacity: 0;
  }
}
#wrapper #page a,
#wrapper #page strong {
  margin-right: 22px !important;
}
#wrapper #page .page-inner {
  padding-left: 22px;
  display: flex;
  justify-content: center;
}
#container .hint_common_restop {
  position: absolute;
  left: calc(45vw - 500px);
  margin-top: 25px;
}
.AC.sp-separator {
  width: auto;
}
/*search engine jump*/
#sej-container {
  padding-left: 0;
  margin-left: 0;
  text-align: center;
}
.s_form_wrapper {
  display: flex;
  justify-content: center;
}
#wrapper #s_tab {
  padding-left: 0;
  margin-left: 0;
  display: flex;
  justify-content: center;
  flex-direction: column;
}
#wrapper #container .head_nums_cont_outer .search_tool_conter,
#wrapper #container .head_nums_cont_outer .nums {
  width: 69%;
  margin-left: 16%;
}
form.fm .s_ipt_wr.bg {
  min-width: calc(37.5vw - 150px);
}
.result-molecule.new-pmd:has(#s_tab) {
  position: relative;
  z-index: 233;
  margin-top: 6px;
  padding-left: 0 !important;
  transform: translateX(-50%);
  margin-left: 50% !important;
}
.showRight .result-molecule.new-pmd[tpl='app/rs'] {
  margin-left: 44% !important;
}
.showRight .result-molecule.new-pmd[tpl='app/page'] {
  padding-bottom: 20px;
  margin-left: 48% !important;
}
.showRight .result-molecule.new-pmd[tpl='app/footer'] {
  margin-left: 48% !important;
}
.new-pmd #rs_new {
  background-color: white;
  width: calc(100% - 20px);
  padding: 10px 0 10px 20px;
}
.result-molecule #page > div {
  width: unset;
  padding-left: unset;
}
.new-pmd #rs_new table {
  width: 100%;
  margin-top: 12px;
}
.wrapper_new .s_form.s_form_fresh {
  margin: 0 auto;
}
.smart_input_wrapper #main-wrapper {
  width: unset;
}
.s_form > .s_form_wrapper {
  margin-left: calc(-31.25vw + 840px);
}
body[baidu] #chat-input-main {
  width: calc(46.88vw - 300px);
}
.showRight .s_form > .s_form_wrapper {
  margin-left: unset;
}
.showRight #chat-input-main {
  width: calc(12.65vw + 501.87px);
}
@media screen and (min-width: 1921px) {
  #head .head_wrapper {
    transform: translateX(45px);
  }
  #head .head_wrapper #u {
    right: 200px;
  }
  body[baidu] #wrapper #s_tab {
    margin-left: 96px;
  }
  body[baidu] #wrapper #s_tab .s_tab_inner {
    display: flex;
    justify-content: space-evenly;
    padding-left: 0;
  }
  body[baidu] #wrapper #s_tab .s_tab_inner > * {
    margin-right: 0;
    text-align: center;
  }
  body[baidu] #container.sam_newgrid {
    padding-left: 80px;
  }
  form.fm .s_ipt_wr.bg {
    min-width: calc(37.5vw - 150px);
  }
  #wrapper #rs,
  #wrapper #content_left .result,
  #wrapper #content_left .result-op,
  #wrapper #content_left > .c-container {
    margin-left: auto;
    margin-right: auto;
  }
  .showRight #wrapper #rs,
  .showRight #wrapper #content_left .result,
  .showRight #wrapper #content_left .result-op,
  .showRight #wrapper #content_left > .c-container {
    margin-left: calc(15vw - 250px);
  }
}
@media screen and (min-width: 1921px) and (min-resolution: 1.2dppx) and (max-resolution: 2dppx) {
  #container.sam_newgrid {
    padding-left: 0px !important;
  }
  .s_form > .s_form_wrapper {
    margin-left: calc(-45.13vw + 916.43px);
    /** 1366=300px；1920=50px **/
  }
}
@media screen and (min-width: 1366px) and (max-width: 2560px) {
  .wrapper_new .head_wrapper #result_logo {
    margin-left: 0;
    margin-right: 20px;
  }
}
@media screen and (max-width: 1366px) {
  .wrapper_new .head_wrapper #result_logo {
    margin-left: -230px;
  }
}
@media screen and (max-width: 1920px) {
  body[baidu] #wrapper #s_tab {
    margin-left: 96px;
  }
  body[baidu] #wrapper #s_tab .s_tab_inner {
    display: flex;
    justify-content: space-evenly;
    padding-left: 0;
  }
  body[baidu] #wrapper #s_tab .s_tab_inner > * {
    margin-right: 0;
    text-align: center;
  }
}
`;

  // 百度双列
  const CSS_baiduTwoPage = `/**Store BaiduTowPageStyle**/
#wrapper_wrapper #container {
  width: auto;
  margin-left: unset;
}
form.fm {
  position: relative;
  background-color: unset;
}
#s_tab b,
#s_tab a {
  position: relative;
}
#wrapper #s_tab {
  padding-left: 0;
  margin-left: 0;
  display: flex;
  justify-content: center;
  flex-direction: column;
}
#wrapper .head_nums_cont_outer .search_tool_conter,
#wrapper .head_nums_cont_outer .nums {
  width: 80%;
  margin-left: 10%;
}
#wrapper .head_nums_cont_outer,
.hint_common_restop,
#header_top_bar {
  position: relative;
  left: 10%;
  width: 80%;
}
#wrapper #content_left,
#container .result-molecule {
  margin: 0 auto !important;
  padding-left: unset !important;
}
#wrapper #header_top_bar {
  margin-bottom: 0px;
}
#container.sam_newgrid #content_left,
body[baidu].pc-fresh-wrapper-con #container.sam_newgrid #content_left {
  width: 80vw !important;
}
.pc-fresh-wrapper .wrapper_new #s_tab .s_tab_inner.s-old-tag,
.pc-fresh-wrapper .wrapper_new.wrapper_s #s_tab .s_tab_inner.s-old-tag,
.pc-fresh-wrapper .wrapper_new.wrapper_l #s_tab .s_tab_inner.s-old-tag {
  padding: unset;
  margin: 0 auto;
}
#wrapper #content_left,
#container.sam_newgrid #content_left {
  display: grid;
  grid-template-columns: repeat(2, 44%);
  grid-gap: 0 30px;
  grid-template-areas: "xmain xmain";
  margin: 0 auto;
  position: relative;
  padding-left: 2%;
  float: unset;
  width: 85vw !important;
  max-width: 1300px !important;
  margin-bottom: 30px;
}
body[news] #wrapper #content_left > div:not([class]):not([id]) {
  display: grid;
  grid-template-columns: repeat(2, 50%);
  grid-template-areas: "xmain xmain";
}
#wrapper #content_right {
  width: 0 !important;
  height: 0 !important;
  overflow: hidden !important;
  opacity: 0;
}
#wrapper_wrapper #container #rs {
  position: relative;
  margin: 0 auto;
}
#wrapper #page {
  min-width: 710px;
  height: 40px;
  line-height: 40px;
  padding: 5px 10px;
  margin: 0 auto;
  text-align: center;
  position: relative;
}
#wrapper #page .page-inner {
  padding-left: 0;
}
#wrapper #content_left .result,
#wrapper #content_left .result-op,
#wrapper #content_left div[class*='vmp-project'],
#wrapper #content_left > .c-container {
  width: 100% !important;
  max-width: unset;
  margin-left: 0;
  margin-right: 0;
}
#wrapper #content_left > *:not([class*='result']):not([class*='c-group-wrapper']) {
  grid-column: 1 / span 2;
}
.c-container h3 ~ span {
  margin-bottom: 10px !important;
  padding-top: 10px;
  background-color: #f8f8f8;
}
/* 百度新版卡片边框容器收窄，防溢出 */
._content-border_1q9is_4 {
  width: 100% !important;
  max-width: 100% !important;
  overflow: hidden !important;
}
.c-container h3 a {
  z-index: 1;
}
.AC.sp-separator {
  width: auto;
}
/*search engine jump*/
#sej-container {
  padding-left: 0;
  margin-left: 0;
  text-align: center;
}
.s_form_wrapper {
  justify-content: center;
  display: flex;
}
body[baidu] .result-molecule.new-pmd:has(#s_tab) {
  margin: 0 auto;
  padding-left: 20px;
}
body[baidu] .result-molecule.new-pmd:has(#s_tab) #page > div {
  width: unset;
  padding-left: unset;
}
body[baidu] .result-molecule.new-pmd:has(#s_tab) #rs_new {
  background-color: white;
  width: calc(100% - 20px);
  padding: 10px 0 10px 20px;
}
body[baidu] .result-molecule.new-pmd:has(#s_tab) #rs_new table {
  width: 100%;
  margin-top: 12px;
}
body[baidu] .result-molecule.new-pmd:has(#s_tab) #searchTag {
  padding: unset;
}
#wrapper .head_nums_cont_outer .search_tool_conter,
#wrapper .head_nums_cont_outer .nums {
  width: 80%;
}
@media screen and (max-width: 1500px) {
  form.fm .s_ipt_wr.bg {
    min-width: 450px;
  }
  .wrapper_new .head_wrapper #result_logo {
    margin-left: -170px;
  }
  body[baidu].pc-fresh-wrapper-con #container.sam_newgrid #content_left {
    width: 100%;
  }
}
@media screen and (max-width: 1700px) {
  body[baidu].pc-fresh-wrapper-con #container.sam_newgrid #content_left {
    width: 80%;
  }
}
@media screen and (min-width: 1921px) and (min-resolution: 1.2dppx) and (max-resolution: 2dppx) {
  .s_form > .s_form_wrapper {
    margin-left: calc(-45.13vw + 916.43px);
    /** 1366=300px；1920=50px **/
  }
  body[baidu] .result-molecule.new-pmd[tpl="app/search-tag"] {
    padding-left: 0;
  }
}
@media screen and (min-width: 1921px) {
  #head .head_wrapper {
    transform: unset;
  }
  #head .head_wrapper #u {
    right: 130px;
  }
  form.fm .s_ipt_wr.bg {
    min-width: 850px;
  }
  body[baidu] #container.sam_newgrid {
    padding-left: 158px;
  }
  body[baidu] #wrapper #content_left {
    width: 95%;
    max-width: 1600px;
  }
  body[baidu] #wrapper #s_tab.s_tab .s_tab_inner {
    width: 850px;
    padding-left: 100px;
  }
}
`;

  // 谷歌通用样式
  const CSS_googleCommon = `/******************* Store GoogleCommonStyle *******************/
/* regular items, warring: iframes could be videos*/
div.res_top_banner,
#page .fk,
#head .headBlock,
#rs_top_new,
#content_right,
#rso > table,
#rso > div[id*="30"],
#rso .c-recommend,
#rso .leftBlock,
#rso .oUAcPd,
#search #z9PoV,
#rso .hit_top_new,
#rso #fld,
#rso div.rrecom-btn-parent,
#center_col > #taw,
#fld,
#demo {
  display: none !important;
}
div[two-father] em {
  font-weight: bold;
  color: red;
}
/******************* remove Empty item *******************/
div[two-father] span:empty {
  display: none;
}
div[two-father] > div:not(:has(div)) {
  display: none;
}
body[google] {
  background-color: #fDfDfD;
}
#top_nav #hdtb {
  background: unset;
}
#cnt #hdtbSum,
#cnt > #appbar {
  background: rgba(0, 0, 0, 0);
}
#form .bdsug {
  width: 76%;
}
#ala_img_results {
  overflow: hidden;
}
a,
a em,
#u a {
  text-decoration: none;
}
a:hover,
a:hover h3 {
  text-decoration: none !important;
}
/******************* rewrite header *******************/
#head {
  background-color: #f8f8f8;
  border-bottom: none;
}
#form {
  background-color: unset;
}
#form .bdsug li {
  width: auto;
  color: #000;
  font: 15px arial;
  line-height: 26px;
}
#form .s_ipt_wr.bg {
  background: #fff;
  width: 76%;
}
#form .s_btn {
  background: #3476d2;
  border-bottom: 1px solid #3476d2;
}
#form .s_btn:hover {
  background: #3476d2;
  border-bottom: 1px solid #3476d2;
}
#s_tab {
  background-color: #f8f8f8;
  border-bottom: #e0e0e0 1px solid;
}
#s_tab b {
  color: #3476d2;
  border-bottom: 3px #3476d2 solid;
}
/******************* rewrite - searchBox *******************/
/* SearchTools */
#container .head_nums_cont_outer .search_tool_conter,
#container .head_nums_cont_outer .nums {
  width: 630px;
}
/* SearchItmes Bottom to Top ani */
.HdCKGe {
  width: 850px;
}
.ULSxyf {
  margin-bottom: 0px;
}
div[two-child],
.A6K0A {
  width: 100% !important;
  padding: 0px 20px 15px;
  margin-top: 0px;
  margin-bottom: 20px;
  border-radius: 5px;
  background-color: #fff;
  box-sizing: border-box;
  border: 1px solid rgba(0, 0, 0, 0.1);
  transition: all 0.25s cubic-bezier(0.23, 1, 0.32, 1) 0s;
}
#main #cnt,
#cnt #center_col,
#cnt #foot,
.HdCKGe {
  width: calc(25.28vw + 340.65px);
  /** 1366=700px；1920=800px；2560=1000px **/
}
.MjjYud {
  animation-name: ani_topTobuttom;
  animation-duration: 0.3s;
  animation-timing-function: ease;
  width: 100%;
  align-items: stretch;
  justify-items: stretch;
  /* Img */
  /* page nums */
}
.MjjYud .jUmkFb:hover {
  margin: 0 auto;
  border-left: unset;
  padding: 0px 20px 15px;
  margin-bottom: 20px;
}
.MjjYud div[two-child] a,
.MjjYud .A6K0A a {
  color: #3476d2;
}
.MjjYud div[two-child] a h3,
.MjjYud .A6K0A a h3 {
  position: relative;
  font-weight: bold;
}
.MjjYud div[two-child] a h3:after,
.MjjYud .A6K0A a h3:after {
  content: "";
  position: absolute;
  border-bottom: 2px solid #3476d2;
  bottom: -3px;
  left: 100%;
  width: 0;
  transition: width 350ms, left 350ms;
}
.MjjYud div[two-child] a h3:hover:after,
.MjjYud .A6K0A a h3:hover:after {
  left: 0;
  width: 100%;
  transition: width 350ms;
}
.MjjYud div[two-child] a:visited,
.MjjYud .A6K0A a:visited {
  color: #660099;
}
.MjjYud div[two-child] > div,
.MjjYud .A6K0A > div {
  margin-top: 10px;
}
.MjjYud div[two-child] div.rc .s,
.MjjYud .A6K0A div.rc .s {
  max-width: unset;
}
.MjjYud div[two-child] div.r,
.MjjYud .A6K0A div.r {
  margin: 0px -20px 10px -20px;
  padding: 8px 20px 5px;
  border-radius: 5px 5px 0px 0px;
}
.MjjYud div[two-child][tpl='soft'] .op-soft-title,
.MjjYud .A6K0A[tpl='soft'] .op-soft-title {
  margin: 0px -20px 10px -20px;
  padding: 8px 20px 5px;
  border-radius: 5px 5px 0px 0px;
}
.MjjYud div[two-child]:hover,
.MjjYud .A6K0A:hover {
  border: 1px solid rgba(0, 0, 0, 0.3);
  box-shadow: 0 0 1px grey;
  -webkit-box-shadow: 0 0 1px grey;
  -moz-box-shadow: 0 0 1px gray;
}
.MjjYud .f13 a,
.MjjYud .f13 em,
.MjjYud .c-span18 a,
.MjjYud .subLink_factory a,
.MjjYud .c-tabs-content a,
.MjjYud .op_offical_weibo_content a,
.MjjYud .op_offical_weibo_pz a,
.MjjYud .op_tieba2_tablinks_container a,
.MjjYud .op-tieba-general-right,
.MjjYud .op_dq01_title,
.MjjYud .op_dq01_table a,
.MjjYud .op_dq01_morelink a,
.MjjYud .op-tieba-general-mainpl a,
.MjjYud .op-se-listen-recommend,
.MjjYud .c-offset > div a {
  text-decoration: none;
  color: #3476d2;
}
.MjjYud .f13 a:hover,
.MjjYud .f13 em:hover,
.MjjYud .c-span18 a:hover,
.MjjYud .subLink_factory a:hover,
.MjjYud .c-tabs-content a:hover,
.MjjYud .op_offical_weibo_content a:hover,
.MjjYud .op_offical_weibo_pz a:hover,
.MjjYud .op_tieba2_tablinks_container a:hover,
.MjjYud .op-tieba-general-right:hover,
.MjjYud .op_dq01_title:hover,
.MjjYud .op_dq01_table a:hover,
.MjjYud .op_dq01_morelink a:hover,
.MjjYud .op-tieba-general-mainpl a:hover,
.MjjYud .op-se-listen-recommend:hover,
.MjjYud .c-offset > div a:hover {
  text-decoration: underline !important;
}
.MjjYud .f13 a {
  color: #008000;
}
.MjjYud .c-span18,
.MjjYud .c-span24 {
  width: 100%;
  min-width: unset;
}
.MjjYud .c-border {
  width: auto;
  border: none;
  border-bottom-color: transparent;
  border-right-color: transparent;
  box-shadow: 0px 0px 0px transparent;
  -webkit-box-shadow: 0px 0px 0px transparent;
  -moz-box-shadow: 0px 0px 0px transparent;
  -o-box-shadow: 0px 0px 0px transparent;
}
.MjjYud .se_com_irregular_gallery ul li,
.MjjYud .op_jingyan_list,
.MjjYud div[two-child] .op-img-address-link-type {
  display: inline-block;
  margin-left: 10px;
}
.MjjYud .op-soft-title a,
.MjjYud div[two-child] div.r > a {
  position: relative;
}
.MjjYud .op-soft-title a em,
.MjjYud div[two-child] div.r > a em {
  text-decoration: none;
}
.MjjYud > div[two-child] ~ div:not(div[two-child]) {
  width: 100%;
  overflow: hidden;
}
.MjjYud div[two-child]:not([class]) {
  margin-left: 18px;
  margin-right: 18px;
}
.MjjYud div[two-child] .exp-outline {
  display: none;
}
/* SearchBar Left to Right ani */
.srp form {
  animation-name: ani_leftToright;
  animation-duration: 0.3s;
  animation-timing-function: ease-out;
}
#res div[two-child] .ts {
  max-width: unset;
}
#main #rcnt #rhs {
  display: none !important;
}
.showRight #main #rcnt #rhs {
  display: unset;
  grid-column: span 1/-2;
}
cite {
  font-weight: normal;
  white-space: nowrap;
}
/**Mooncan -START**/
/**Aja LineHeight*/
div.res_top_banner #foot,
#pag #res .r {
  line-height: 1.3;
}
#res {
  padding: 0;
}
/**Google ConnectionBox*/
#rs,
#rso div[two-child],
div[data-micp-id="rso"] div[two-child] {
  font-family: -webkit-body;
  -webkit-locale: "zh-CN";
  /*force CN shape*/
  margin-bottom: 20px;
  border-radius: 10px;
}
#rso div.r,
div[data-micp-id="rso"] div.r {
  border-radius: 10px 10px 0px 0px;
}
#rso .r > a > div,
div[data-micp-id="rso"] .r > a > div {
  width: 35rem;
}
#rso .card-section,
div[data-micp-id="rso"] .card-section {
  width: 100% !important;
}
/**Rewrite main page -> web summary*/
.c2xzTb div[two-child],
.ruTcId div[two-child],
.fm06If div[two-child],
.cUnQKe div[two-child],
.HanQmf div[two-child] {
  width: 758px;
  padding-left: 20px !important;
  padding-right: 20px !important;
  box-shadow: 0 0 0px 0px #000000;
  /*remove the shadow*/
}
div .xfxx5d {
  margin-bottom: -18px !important;
  margin-top: -25px !important;
}
div .xaqJzf.xfxx5d .kno-ftr {
  margin-top: 10px !important;
}
div .kno-ftr a {
  position: sticky;
}
/**Thanks to Mooncan -END**/
#rcnt #res h3,
#rcnt #extrares h3,
div[two-child] h3 {
  /**reset font size**/
  font-size: 18px;
  display: block;
}
#rcnt #extrares h3 div {
  display: inline-block;
}
div.rc[ac-needhide] {
  margin-top: 5px;
  margin-bottom: -15px;
}
/*reset logo position at drop */
.logo.baidu {
  top: -5px;
  margin-left: unset;
}
body[google] .big .baidu {
  transform: unset !important;
  margin-top: -10px;
  margin-left: -2rem;
}
body[google] .big .baidu #logo img {
  margin-top: -15px;
}
body[google] .big.minidiv .baidu #logo img {
  height: 59px;
  width: unset;
  margin-top: -18px;
}
.minidiv .logo {
  top: 0px;
}
body[google] .A8SBwf {
  width: 50vw;
  max-width: 50vw;
  transform: translateX(0px);
  margin-left: unset;
}
.jOAHU,
#LUqzrb {
  min-width: calc(7.84vw + 193px);
  margin-left: calc(3.61vw + 140px);
  border: 1px solid #dedede;
  border-radius: 10px;
  padding: 20px;
}
.LGwnxb {
  max-width: unset;
}
.RNNXgb {
  max-width: unset;
}
.NJjxre {
  width: calc(27vw + 120px);
}
.AC.sp-separator {
  margin-top: -10px;
}
div[jscontroller] a,
div[jsname] a {
  position: relative;
}
@media (prefers-color-scheme: dark) {
  div[two-father] div[two-child] {
    background-color: unset;
    border: 2px solid #707070;
  }
  div[two-father] div[two-child]:hover {
    border: 2px solid white;
  }
}
`;

  // 谷歌单列居中
  const CSS_googleOnePage = `/**Store GoogleOnePageStyle**/
div[two-father] {
  position: relative;
  float: unset;
  margin: 0 auto;
  align-items: stretch;
  justify-items: stretch;
  grid-gap: 20px;
}
#rso .jUmkFb:hover {
  margin-bottom: 30px;
  margin-left: 20px;
}
div[two-child],
.A6K0A,
.Wm5I1e {
  width: 100% !important;
  margin-left: calc(33.44vw - 491.69px);
  /** 1366=-40px；1920=160px；2560=360px **/
  height: 100%;
  overflow: hidden;
  padding: 0px 20px 15px;
  margin-top: 0px;
  border-radius: 5px;
  background-color: #fff;
  box-sizing: border-box;
  transition: all 0.25s cubic-bezier(0.23, 1, 0.32, 1) 0s;
}
.search > #ires #rso > div[two-child] {
  max-width: unset;
}
div[two-child] {
  width: 100% !important;
  overflow: hidden;
  margin-bottom: 10px;
}
#main #rcnt {
  max-width: unset;
}
body #appbar,
body .rhscol,
body #top_nav,
body #fbar {
  min-width: unset;
}
#rso g-scrolling-carousel {
  margin: unset;
  margin-left: 20px;
}
.col {
  width: 100% !important;
}
.col #center_col {
  width: 100% !important;
  margin-left: unset !important;
}
.srp .big #tsf {
  width: 833px;
}
/**search box align center**/
.srp form {
  margin: 0 auto;
}
#top_nav {
  min-width: unset;
}
/**video box align center**/
g-section-with-header {
  text-align: center;
}
#hdtb #hdtb-msb {
  justify-content: center;
  width: 100%;
}
#hdtb #hdtb-msb-vis {
  margin-left: -169px;
}
.AC.sp-separator {
  width: 800px;
  margin-left: auto;
  margin-right: auto;
}
.FxLDp {
  padding: unset;
}
#main #cnt,
#cnt #center_col,
#cnt #foot {
  width: calc(36.1vw + 306.86px);
  transition: all 1.2s ease-in-out;
  animation-name: ani_hideToShow;
  animation-duration: 0.2s;
  animation-timing-function: ease;
}
.UFQ0Gb {
  grid-column: 10 / span 12;
}
.bzXtMb {
  grid-column: 6 / span 12;
}
body[google] .A8SBwf {
  max-width: unset;
  width: unset;
}
body[google] .rZj61 {
  margin-left: 40%;
}
@media screen and (max-width: 1440px) {
  .RNNXgb {
    width: 80% !important;
  }
}
@media (min-width: 1301px) {
  .A8SBwf {
    margin-left: 80px;
  }
}
@media screen and (min-width: 1675px) {
  .srp {
    --center-abs-margin: 22vw;
  }
  .YNk70c .sBbkle {
    margin-left: 35%;
  }
}
`;

  // 谷歌双列
  const CSS_googleTwoPage = `/**Store GoogleTwoPageStyle**/
div[two-father] {
  position: relative;
  float: unset;
  width: unset;
  min-width: 800px;
}
div[two-child] {
  width: 100% !important;
  height: 100%;
  overflow: hidden;
  padding: 10px 20px 15px;
  margin-top: 0;
  margin-bottom: 0;
  border-radius: 5px;
  background-color: #fff;
  box-sizing: border-box;
  transition: all 0.1s ease-in;
}
div[two-child] div[two-child] {
  width: unset !important;
}
div[two-child]:only-child {
  grid-column: 1 / -1;
}
div[two-child]:last-child:nth-child(odd) {
  grid-column: 1 / -1;
}
.search > #ires #rso div[two-child] {
  max-width: unset;
}
.XqFnDf {
  display: none;
}
#main #rcnt #rhs {
  display: none !important;
}
#main #rcnt {
  display: grid;
  max-width: unset;
}
.f6F9Be {
  position: relative;
}
#main #cnt,
#cnt #center_col,
#cnt #foot,
.HdCKGe {
  width: calc(54vw + 360px);
  margin: 0 auto;
  grid-column: unset;
}
body #appbar,
body .rhscol,
body #top_nav,
body #fbar {
  min-width: unset;
}
#rso .COEoid,
#kp-wp-tab-overview > div {
  margin: unset;
}
.col {
  width: 100% !important;
}
.col #center_col {
  width: 100% !important;
  margin-left: unset !important;
}
div[two-father],
#kp-wp-tab-overview {
  display: grid;
  grid-template-columns: repeat(2, 50%);
  grid-template-areas: "xmain xmain";
  grid-gap: 20px !important;
  margin-bottom: 20px;
  justify-items: stretch;
  align-items: stretch;
  width: 100%;
}
div[two-father] div[two-father],
#kp-wp-tab-overview div[two-father] {
  min-width: unset;
  display: unset;
}
div[two-father] div[two-father] div[two-child],
#kp-wp-tab-overview div[two-father] div[two-child] {
  height: unset;
}
#rso > div[two-child] ~ div:not(div[two-child]),
#rcnt #botstuff > div[two-child] ~ div:not(div[two-child]) {
  margin-bottom: 10px;
}
.AC.sp-separator {
  margin-top: 10px;
  margin-left: auto;
  margin-right: auto;
}
/**search box align center**/
.srp form {
  margin: 0 auto;
}
g-section-with-header {
  text-align: center;
}
#hdtb #hdtb-msb {
  justify-content: center;
  width: 100%;
}
#hdtb #hdtb-msb-vis {
  margin-left: -169px;
}
body[google] .rZj61 {
  margin-left: 40%;
}
/* 修复 Google 本地知识面板（A6K0A.z4oRIf）被双列宽度限制挤压到 41px */
.A6K0A.z4oRIf {
  width: 100% !important;
  min-width: unset !important;
  max-width: unset !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  box-sizing: border-box !important;
}
`;

  // 必应通用样式
  const CSS_bingCommon = `/*Store BingCommonStyle*/
body {
  background-color: #fAfAfA;
}
.sh_favicon {
  margin-left: 16px;
}
.sh_favicon .wr_fav {
  left: -18px !important;
}
.sh_favicon .siteicon img {
  width: 16px !important;
  height: 16px !important;
}
main #b_mcw {
  --wideansw: unset !important;
}
.b_dark #b_content #b_results > li:not(#mfa_root) {
  background-color: #292929;
}
.b_dark .AC.sp-separator {
  background-color: #292929 !important;
}
.b_dark .AC.sp-separator a {
  text-shadow: #858585 0 1px 0 !important;
  color: #858585 !important;
}
.gs_caphead {
  width: unset;
}
#b_content #b_results > li:not(#mfa_root) {
  z-index: 1;
  width: 670px;
  padding: 12px 20px !important;
  margin-top: 0;
  margin-bottom: 25px;
  border-radius: 5px;
  background-color: #fff;
  box-sizing: border-box;
  border: 1px solid rgba(0, 0, 0, 0.1);
  transition: all 0.25s cubic-bezier(0.23, 1, 0.32, 1) 0s;
  overflow: hidden;
}
#b_content #b_results > li:not(#mfa_root):hover {
  border: 1px solid rgba(0, 0, 0, 0.3);
  box-shadow: 0 0 1px grey;
}
#b_content #b_results a,
#b_content #b_results h2 a {
  position: relative;
  color: #4f91de;
}
#b_content #b_results h2 a,
#b_results h2 strong {
  font-weight: bold;
  font-size: medium;
}
#b_content #b_results > li:hover {
  border: 1px solid rgba(0, 0, 0, 0.3);
  box-shadow: 0 0 1px grey;
  -webkit-box-shadow: 0 0 1px grey;
  -moz-box-shadow: 0 0 1px gray;
}
#b_content > #b_results li:not(#mfa_root) h2 {
  background-color: #f8f8f8;
  margin: -12px -20px 10px -20px;
  padding: 8px 20px 5px;
  border-radius: 5px 5px 0px 0px;
}
a,
a strong {
  text-decoration: none;
}
#b_content #b_results a strong,
#b_content #b_results h2 a strong {
  text-decoration: none;
}
.b_algo:first-child:hover h2 a {
  text-decoration: none !important;
}
.lgw-slide-in {
  display: none;
}
#b_content #b_results a:hover:after,
#b_content #b_results h2 a:hover:after {
  left: 0;
  width: 100%;
  -webkit-transition: width 350ms;
  -moz-transition: width 350ms;
  transition: width 350ms;
}
#b_content #b_results a:hover,
#b_content #b_results h2 a:hover {
  text-decoration: none;
}
#b_content #b_results a:after,
#b_content #b_results h2 a:after {
  content: "";
  position: absolute;
  border-bottom: 2px solid #4f91de;
  bottom: -2px;
  left: 100%;
  width: 0;
  -webkit-transition: width 350ms, left 350ms;
  -moz-transition: width 350ms, left 350ms;
  transition: width 350ms, left 350ms;
}
#b_content #b_results h2 a:visited,
#b_content #b_results h2 a:visited strong,
#b_content #b_results h2 h2 a:visited,
#b_content #b_results h2 h2 a:visited strong {
  color: #660099;
}
#b_content #b_results h2 a:visited:hover:after,
#b_content #b_results h2 h2 a:visited:hover:after {
  left: 0;
  width: 100%;
  -webkit-transition: width 350ms;
  -moz-transition: width 350ms;
  transition: width 350ms;
}
#b_content > ol#b_context,
#b_content #relatedSearchesLGWContainer {
  display: none;
}
body #b_header {
  background-color: #fAfAfA;
}
#b_content .b_underSearchbox {
  margin-top: 10px;
}
#b_header .b_scopebar {
  margin: unset;
}
/*search engine jump*/
.tsf-p > .logocont,
#sej-container {
  margin-right: 350px;
  text-align: center;
}
.tsf-p > .sfibbbc {
  margin-right: 350px;
  text-align: center;
}
.b_searchboxForm .sa_tm {
  text-align: left;
  /* SearchBox text Center */
}
body #b_header #est_switch {
  margin: 0 auto;
  padding-right: 10%;
  /**TODO***/
}
body #est_cn::after,
body #est_en::after {
  top: -4px !important;
  transform: scale(1.2, 1.3) perspective(0.5em) rotateX(0deg);
  -webkit-transform: scale(1.2, 1.3) perspective(0.5em) rotateX(0deg);
}
#est_switch .est_unselected {
  line-height: 8px;
  color: #2c2c2c;
}
#est_switch .est_unselected::after {
  background-color: #ffffff;
}
#est_switch .est_selected {
  line-height: 8px;
  color: white;
  font-weight: bold;
  font-size: 16px;
  padding-left: 20px;
  padding-right: 10px;
}
#est_switch .est_selected::after {
  background-color: #007AFF;
}
@media (max-width: 1100px) {
  body #b_header #est_switch {
    transform: translateX(1.2rem);
  }
}
/* SearchItmes Bottom to Top ani */
#b_content {
  animation-name: ani_topTobuttom;
  animation-duration: 0.6s;
  animation-timing-function: ease;
}
/* SearchBar Left to Right ani */
body #b_header {
  animation-name: ani_topTobuttom;
  animation-duration: 0.6s;
  animation-timing-function: ease-out;
}
body {
  animation-name: ani_hideToShow;
  animation-duration: 0.6s;
  animation-timing-function: ease-out;
}
.AC.sp-separator {
  margin-top: -15px;
}
body {
  --bminwidth: 600px !important;
}
`;

  // 必应单列居中
  const CSS_bingOnePage = `/*Store BingOnePageStyle*/
#b_content aside {
  display: none;
}
#b_content #b_results {
  width: 73vw;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 1000px;
}
#b_content #b_pole {
  width: 73vw;
  max-width: 980px;
  margin: 0 auto;
}
body #b_header {
  width: 72vw;
  text-align: center;
  margin: 0 auto;
}
#b_header #sb_form {
  margin-left: 10vw;
}
body #b_content {
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  margin-left: unset;
  padding-left: unset;
}
#b_content #b_results > li:not(#mfa_root) {
  width: 98%;
}
/* 修复翻页栏显示（单列居中模式） */
.b_pag {
  width: 73vw;
  max-width: 1000px;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  padding: 8px 0;
  box-sizing: border-box;
}
.b_pag a.sb_pagP,
.b_pag a.sb_pagN {
  display: inline-flex !important;
  align-items: center;
  padding: 6px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  color: #4f91de;
  text-decoration: none;
  white-space: nowrap;
}
/* 修复 Bing 图文混合卡片（如百科缩略图）Flex 布局 — 对抗 CSS_bingCommon 的 overflow:hidden 副作用 */
#b_results .b_imgcap_altitle {
  display: flex !important;
  align-items: center !important;
}
#b_results .b_imgcap_altitle .b_imgcap_img {
  flex-shrink: 0 !important;
  margin-right: 16px !important;
  width: auto !important;
}
#b_results .b_imgcap_altitle .b_imgcap_main h2 {
  margin: 0 !important;
  padding: 0 !important;
}
/* 移除 BFC 压制：+ #b_content 前缀提升 specificity → (0,3,1,1) 击败 CSS_bingCommon 的 (0,3,0,1) */
#b_content #b_results > li:not(#mfa_root):has(.b_imgcap_altitle) {
  overflow: visible;
}
`;

  // 必应双列
  const CSS_bingTwoPage = `/*Store BingTwoPageStyle*/
#b_content aside,
#b_results #mfa_root,
#b_results #adstop_gradiant_separator,
.b_bza_pole {
  display: none !important;
}
#b_content #b_results {
  width: 73vw;
  grid-template-columns: repeat(2, 50%);
  grid-template-areas: "xmain xmain";
  display: grid;
}
.carousel .items {
  max-width: 72vw;
  overflow-x: scroll;
  padding: 0 0 10px 0 !important;
}
#b_content #b_results > li:not(#mfa_root) {
  width: 98%;
  margin-left: 1%;
}
#b_results li:nth-child(even)[class*="b_ans"] {
  grid-column: 1 / -1;
}
#b_content #b_pole {
  max-width: 72vw;
  margin: 0 auto;
}
#b_results .b_algo .b_deep ul {
  width: 50%;
}
#b_msg,
.b_pag {
  grid-column-end: xmain-end;
  grid-column-start: 1;
  background-color: #FFFFFF;
}
body #b_content {
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  margin-left: unset;
  padding-left: unset;
}
body #b_header {
  width: 72vw;
  text-align: center;
  margin: 0 auto;
}
/* 修复翻页按钮可见性（双列模式） */
.b_pag a.sb_pagP,
.b_pag a.sb_pagN {
  display: inline-flex !important;
  align-items: center;
  padding: 6px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  color: #4f91de;
}
`;

  // 鸭鸭通用样式
  const CSS_duckCommon = `/*Store: DuckDuckGoCommonStyle*/
body {
  background-color: #fAfAfA;
}
#react-layout .react-results--main {
  max-width: 95%;
}
#react-layout li {
  width: 95%;
  overflow: hidden;
  margin-top: 0px;
  margin-bottom: 25px;
  border-radius: 5px;
  box-sizing: border-box;
  border: 1px solid rgba(0, 0, 0, 0.1);
  transition: all 0.25s cubic-bezier(0.23, 1, 0.32, 1) 0s;
}
.dark-bg #react-layout li article {
  background-color: #333;
}
.dark-bg #react-layout li article h2 {
  background-color: #345;
}
.dark-bg #react-layout li article h2 a {
  color: #CCCCCC;
}
.dark-bg #react-layout li article h2 a:visited {
  color: #b7663e;
}
#react-layout li article article {
  padding: 18px;
}
#react-layout li article h2 a {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 640px;
  color: #006bff;
  font-size: smaller;
  display: inline-flex;
}
#react-layout li article .result__body {
  padding: 12px 20px !important;
}
#react-layout li:hover {
  border: 1px solid rgba(0, 0, 0, 0.3);
  box-shadow: 0 0 1px grey;
  -webkit-box-shadow: 0 0 1px grey;
  -moz-box-shadow: 0 0 1px gray;
}
#react-layout li article h2 a:hover:after {
  left: 0;
  width: 100%;
  transition: width 350ms;
}
#react-layout li article h2 a:after {
  content: "";
  position: absolute;
  border-bottom: 2px solid #4f91de;
  bottom: 1px;
  left: 100%;
  width: 0;
  transition: width 350ms, left 350ms;
}
#react-layout li article h2 a:visited,
#react-layout li article h2 a:visited strong {
  color: #660099;
}
#react-layout li article h2 a:visited:hover:after,
#react-layout li article h2 a:visited:hover:after {
  left: 0;
  width: 100%;
  -webkit-transition: width 350ms;
  -moz-transition: width 350ms;
  transition: width 350ms;
}
/* SearchItmes Bottom to Top ani */
#react-layout li {
  animation-name: ani_topTobuttom;
  animation-duration: 0.3s;
  animation-timing-function: ease;
}
/* SearchBar Left to Right ani */
#header_wrapper .header__search-wrap {
  animation-name: ani_leftToright;
  animation-duration: 0.3s;
  animation-timing-function: ease-out;
}
body {
  /**replace Duck font**/
  font-family: unset;
}
li article h2,
li article h3 {
  font-weight: bold;
}
li article h2::before,
li article h3::before {
  display: none;
}
`;

  // 鸭鸭单列居中
  const CSS_duckOnePage = `/*Store: DuckDuckGoOnePageStyle*/
.js-sidebar-ads,
#organic-module,
.pinned-to-bottom {
  display: none;
}
.js-result-hidden-el {
  display: none !important;
}
.site-wrapper #web_content_wrapper .cw {
  justify-content: center;
  display: flex;
  max-width: unset;
  margin-left: -150px;
}
#header_wrapper #header,
#web_content_wrapper #react-layout.search-filters-wrap,
#web_content_wrapper #react-layout.results--message {
  justify-content: center;
  display: grid;
}
#header_wrapper #header {
  max-width: unset;
}
#header_wrapper #header .header__search-wrap {
  width: 500px;
}
#react-layout {
  display: inline-flex;
  justify-content: center;
}
#react-layout.react-results--main {
  float: unset;
}
.body--serp .footer {
  display: flex;
  justify-content: center;
  padding-left: unset;
}
`;

  // 鸭鸭双列
  const CSS_duckTwoPage = `/*Store: DuckDuckGoTwoPageStyle*/
.js-sidebar-ads,
#react-layout .results--sidebar,
#organic-module,
.pinned-to-bottom {
  display: none;
}
.js-result-hidden-el {
  display: none !important;
}
.site-wrapper #web_content_wrapper .cw {
  justify-content: center;
  display: flex;
  max-width: unset;
  margin-left: -150px;
}
#header_wrapper #header,
#web_content_wrapper #react-layout .search-filters-wrap,
#web_content_wrapper #react-layout .results--message {
  justify-content: center;
  display: grid;
}
#header_wrapper #header {
  max-width: unset;
}
#header_wrapper #header .header__search-wrap {
  width: 500px;
}
#react-layout {
  display: inline-flex;
  justify-content: center;
}
#react-layout .react-results--main {
  float: unset;
  max-width: unset;
}
#react-layout .results--sidebar {
  min-width: unset;
  margin: unset;
}
section[data-area="sidebar"] {
  display: none;
}
#react-layout .react-results--main {
  width: 80vw;
  /* This may cause Page failed */
  display: grid;
  grid-template-columns: repeat(2, 50%);
  grid-template-areas: "xmain xmain";
}
#react-layout .react-results--main li {
  width: unset;
  margin-right: 15px;
}
#react-layout .react-results--main li:only-child {
  grid-column: 1 / -1;
}
.body--serp .footer {
  display: flex;
  justify-content: center;
  padding-left: unset;
}
`;

  // 好搜通用样式
  const CSS_haosouCommon = `body {
  background-color: #fAfAfA;
}
#container .result > li {
  z-index: 1;
  width: 670px;
  padding: 12px 20px !important;
  margin-top: 0;
  margin-bottom: 25px;
  border-radius: 5px;
  background-color: #fff;
  box-sizing: border-box;
  border: 1px solid rgba(0, 0, 0, 0.1);
  transition: all 0.25s cubic-bezier(0.23, 1, 0.32, 1) 0s;
  overflow: hidden;
}
#container .result > li:hover {
  border: 1px solid rgba(0, 0, 0, 0.3);
  box-shadow: 0 0 1px grey;
}
#container #side {
  left: 200px;
  padding: 20px;
  background-color: white;
}
`;

  // 好搜单列居中
  const CSS_haosouOnePage = `#header #g-hd-nav {
  display: flex;
  justify-content: center;
  float: unset;
  margin-left: -150px;
}
#tabs-wrap {
  display: flex;
  justify-content: center;
  margin-right: 420px;
}
#container {
  display: flex;
  justify-content: center;
  padding-left: unset;
}
#container #main {
  width: 650px;
}
#container #main .result > li {
  width: 770px;
}
#container #side {
  left: 200px;
  padding: 20px;
  background-color: white;
}
#warper .mod-relation {
  padding-left: unset;
  position: relative;
}
#warper .mod-relation #rs {
  width: 770px;
  position: relative;
  left: 50%;
  transform: translateX(-68%);
}
#warper #page {
  display: flex;
  justify-content: center;
  margin-left: -200px;
}
#footer {
  display: flex;
  justify-content: center;
  margin-left: -200px;
}
`;

  // 好搜双列
  const CSS_haosouTwoPage = `#header #g-hd-nav {
  display: flex;
  justify-content: center;
  float: unset;
  margin-left: -150px;
}
#tabs-wrap {
  display: flex;
  justify-content: center;
  margin-right: 420px;
}
#container {
  display: flex;
  justify-content: center;
  padding-left: unset;
}
#container #main {
  width: 78vw;
}
#container #main .result {
  display: grid;
  grid-template-columns: repeat(2, 50%);
  grid-template-areas: "xmain xmain";
  grid-column-gap: 20px;
}
#container #main .result > li {
  width: 100%;
}
#container #side {
  display: none;
}
#warper .mod-relation {
  padding-left: unset;
  position: relative;
}
#warper .mod-relation #rs {
  width: 770px;
  position: relative;
  left: 50%;
  transform: translateX(-68%);
}
#warper #page {
  display: flex;
  justify-content: center;
  margin-left: -200px;
}
#footer {
  display: flex;
  justify-content: center;
  margin-left: -200px;
}
`;

  // Doge通用样式
  const CSS_dogeCommon = `/*Store: DogeCommonStyle*/
body {
  background-color: #fAfAfA;
}
.results_links_deep .result__icon {
  display: none;
}
#links_wrapper #links .results_links_deep h2 {
  font-weight: 600;
}
#links_wrapper .results--main {
  max-width: 670px;
}
#links_wrapper #links .results_links_deep {
  width: 670px;
  overflow: hidden;
  margin-top: 0px;
  margin-bottom: 25px;
  border-radius: 5px;
  background-color: #fff;
  box-sizing: border-box;
  border: 1px solid rgba(0, 0, 0, 0.1);
  transition: all 0.25s cubic-bezier(0.23, 1, 0.32, 1) 0s;
}
#links_wrapper #links .results_links_deep .result__title a {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 640px;
  color: #4f91de;
  font-size: smaller;
}
#links_wrapper #links .results_links_deep .result__body {
  padding: 12px 20px !important;
}
#links_wrapper #links .results_links_deep:hover {
  border: 1px solid rgba(0, 0, 0, 0.3);
  box-shadow: 0 0 1px grey;
  -webkit-box-shadow: 0 0 1px grey;
  -moz-box-shadow: 0 0 1px gray;
}
#links_wrapper #links .results_links_deep h2 {
  background-color: #f8f8f8;
  margin: -12px -20px 0px -20px;
  padding: 8px 20px 5px;
  border-radius: 5px 5px 0px 0px;
}
#links_wrapper #links .results_links_deep h2 a:hover:after {
  left: 0;
  width: 100%;
  -webkit-transition: width 350ms;
  -moz-transition: width 350ms;
  transition: width 350ms;
}
#links_wrapper #links .results_links_deep h2 a:after {
  content: "";
  position: absolute;
  border-bottom: 2px solid #4f91de;
  bottom: 1px;
  left: 100%;
  width: 0;
  -webkit-transition: width 350ms, left 350ms;
  -moz-transition: width 350ms, left 350ms;
  transition: width 350ms, left 350ms;
}
#links_wrapper #links .results_links_deep h2 a:visited,
#links_wrapper #links .results_links_deep h2 a:visited strong {
  color: #660099;
}
#links_wrapper #links .results_links_deep h2 a:visited:hover:after,
#links_wrapper #links .results_links_deep h2 a:visited:hover:after {
  left: 0;
  width: 100%;
  -webkit-transition: width 350ms;
  -moz-transition: width 350ms;
  transition: width 350ms;
}
/* SearchItmes Bottom to Top ani */
#links_wrapper #links {
  animation-name: ani_topTobuttom;
  animation-duration: 0.3s;
  animation-timing-function: ease;
}
/* SearchBar Left to Right ani */
#header_wrapper .header__search-wrap {
  animation-name: ani_leftToright;
  animation-duration: 0.3s;
  animation-timing-function: ease-out;
}
.AC.sp-separator {
  margin-top: -15px;
}
`;

  // Doge单列居中
  const CSS_dogeOnePage = `/*Store: DogeOnePageStyle*/
.js-sidebar-ads,
#organic-module,
.pinned-to-bottom {
  display: none;
}
.js-result-hidden-el {
  display: none !important;
}
.site-wrapper #web_content_wrapper .cw {
  justify-content: center;
  display: flex;
  max-width: unset;
}
@media screen and (min-width: 1000px) {
  #links_wrapper #links .results_links_deep {
    width: 100%;
  }
}
#header_wrapper #header,
#web_content_wrapper #links_wrapper .search-filters-wrap,
#web_content_wrapper #links_wrapper .results--message {
  justify-content: center;
  display: grid;
}
#header_wrapper #header {
  max-width: unset;
}
#header_wrapper #header .header__search-wrap {
  width: 500px;
}
#links_wrapper {
  display: inline-flex;
  justify-content: center;
  padding-left: 0;
}
#links_wrapper .results--main {
  float: unset;
  max-width: 860px;
}
#links_wrapper .results--sidebar {
  min-width: unset;
  margin: unset;
}
.body--serp .footer {
  display: flex;
  justify-content: center;
  padding-left: unset;
}
`;

  // Doge双列
  const CSS_dogeTwoPage = `/*Store: DogeTwoPageStyle*/
.js-sidebar-ads,
#links_wrapper .results--sidebar,
#organic-module,
.pinned-to-bottom {
  display: none;
}
.js-result-hidden-el {
  display: none !important;
}
.site-wrapper #web_content_wrapper .cw {
  justify-content: center;
  display: flex;
  max-width: unset;
  margin-left: -150px;
}
#header_wrapper #header,
#web_content_wrapper #links_wrapper .search-filters-wrap,
#web_content_wrapper #links_wrapper .results--message {
  justify-content: center;
  display: grid;
}
#header_wrapper #header {
  max-width: unset;
}
#header_wrapper #header .header__search-wrap {
  width: 500px;
}
#links_wrapper {
  display: inline-flex;
  justify-content: center;
}
#links_wrapper .results--main {
  float: unset;
  max-width: unset;
}
#links_wrapper .results--sidebar {
  min-width: unset;
  margin: unset;
}
#links_wrapper .results--main #links {
  width: 80vw;
  /* This may cause Page failed */
  display: grid;
  grid-template-columns: repeat(2, 50%);
  grid-template-areas: "xmain xmain";
}
#links_wrapper .results--main #links .results_links_deep {
  width: unset;
  margin-right: 15px;
}
#links .result--more,
#links .result--sep {
  grid-column-start: 1;
  grid-column-end: xmain-end;
  width: unset !important;
  padding: 0;
  padding-right: 15px;
}
#links .result--sep {
  margin-bottom: 2em;
}
.body--serp .footer {
  display: flex;
  justify-content: center;
  padding-left: unset;
}
`;



  // 暗黑模式
  const CSS_DarkMode = `/*** DarkMode Color Val ***/
:root {
  --huahua-bg: #1f1f1f;
  --huahua-bg-dark: #121212;
  --huahua-bg-light: #4f4f4f;
  --huahua-color: #c8c8c8;
  --huahua-color-highlight: #fcfcfc;
  --huahua-color-secondary: #707070;
  --huahua-red: #dc4f4f;
  --huahua-blue: #5972d8;
  --huahua-bg-blue: #1d3a8a;
}
/*** Google Dark Mode ****/
body[google],
body[google] .g {
  background-color: transparent !important;
}
/*** Bing Dark Mode ****/
body[bing].b_dark #b_content #b_results > li:not(#mfa_root) {
  background-color: #ffffff1f !important;
}
/*** Baidu Dark Mode ****/
body[baidu] {
  background-color: var(--huahua-bg-dark) !important;
}
body[baidu] #head,
body[baidu] span.c-gap-left-small {
  background-color: var(--huahua-bg) !important;
}
body[baidu] .wrapper_new #s_tab {
  background-color: var(--huahua-bg) !important;
}
body[baidu] .wrapper_new #s_tab .s-tab-item:hover {
  color: var(--huahua-color-highlight) !important;
}
body[baidu] .wrapper_new #s_tab .cur-tab {
  color: var(--huahua-color) !important;
}
body[baidu] .wrapper_new #searchTag {
  background-color: var(--huahua-bg) !important;
  padding-bottom: 8px !important;
}
body[baidu] .wrapper_new #searchTag [class^="search-tag"] {
  background: transparent !important;
}
body[baidu] .wrapper_new #searchTag [class^="search-tag"] > span {
  background-color: var(--huahua-bg-light) !important;
}
body[baidu] .wrapper_new #searchTag > div > div {
  padding-bottom: 2px !important;
}
body[baidu] .wrapper_new #searchTag > div > div a {
  color: var(--huahua-color) !important;
  background-color: transparent !important;
  border: 1px var(--huahua-bg-light) solid;
}
body[baidu] .wrapper_new #u > a {
  color: var(--huahua-color) !important;
}
body[baidu] .wrapper_new .bdpfmenu,
body[baidu] .wrapper_new .usermenu,
body[baidu] .wrapper_new .bdpfmenu a,
body[baidu] .wrapper_new .usermenu a {
  color: var(--huahua-color) !important;
  background-color: var(--huahua-bg) !important;
}
body[baidu] .wrapper_new .bdpfmenu a:hover,
body[baidu] .wrapper_new .usermenu a:hover {
  color: var(--huahua-blue) !important;
}
body[baidu] .wrapper_new #form > span {
  background-color: transparent !important;
}
body[baidu] .wrapper_new #form > span > input {
  color: var(--huahua-color) !important;
}
body[baidu] .wrapper_new #form .s_btn_wr .s_btn {
  background-color: var(--huahua-bg-blue) !important;
}
body[baidu] .wrapper_new #form .bdsug {
  background-color: var(--huahua-bg) !important;
}
body[baidu] .wrapper_new #form .bdsug ul li[data-key] {
  color: var(--huahua-color) !important;
}
body[baidu] .wrapper_new #form .bdsug ul li[data-key].bdsug-s {
  background-color: var(--huahua-bg-light) !important;
}
body[baidu] .wrapper_new #form .bdsug ul li[data-key] b {
  color: var(--huahua-color-secondary) !important;
}
body[baidu] .wrapper_new div[class|="result"]:not(.result-molecule),
body[baidu] .wrapper_new .result {
  color: var(--huahua-color-secondary) !important;
  background-color: var(--huahua-bg) !important;
  padding: 8px;
  border: 1px var(--huahua-bg-light) solid !important;
  border-radius: 10px !important;
}
body[baidu] .wrapper_new div[class|="result"]:not(.result-molecule) a,
body[baidu] .wrapper_new .result a {
  color: var(--huahua-blue) !important;
  background-color: transparent !important;
}
body[baidu] .wrapper_new div[class|="result"]:not(.result-molecule) em,
body[baidu] .wrapper_new .result em {
  color: var(--huahua-red) !important;
}
body[baidu] .wrapper_new div[class|="result"]:not(.result-molecule) h3[class*="title"],
body[baidu] .wrapper_new .result h3[class*="title"] {
  background-color: transparent !important;
}
body[baidu] .wrapper_new div[class|="result"]:not(.result-molecule) [class^="pag-wrap"] span,
body[baidu] .wrapper_new .result [class^="pag-wrap"] span {
  background-color: var(--huahua-bg-light) !important;
  color: var(--huahua-color) !important;
}
body[baidu] .wrapper_new div[class|="result"]:not(.result-molecule) .cu-color-text,
body[baidu] .wrapper_new .result .cu-color-text,
body[baidu] .wrapper_new div[class|="result"]:not(.result-molecule) .c-color-text,
body[baidu] .wrapper_new .result .c-color-text,
body[baidu] .wrapper_new div[class|="result"]:not(.result-molecule) div[class|="group-sub"],
body[baidu] .wrapper_new .result div[class|="group-sub"] {
  color: var(--huahua-color-secondary) !important;
}
body[baidu] .wrapper_new div[class|="result"]:not(.result-molecule) button[rl-node],
body[baidu] .wrapper_new .result button[rl-node] {
  background-color: transparent !important;
}
body[baidu] .wrapper_new div[class|="result"]:not(.result-molecule) .cu-border,
body[baidu] .wrapper_new .result .cu-border,
body[baidu] .wrapper_new div[class|="result"]:not(.result-molecule) [class^="single-card-wrapper"],
body[baidu] .wrapper_new .result [class^="single-card-wrapper"] {
  box-shadow: none !important;
}
body[baidu] .wrapper_new div[class|="result"]:not(.result-molecule) [class^="title-instance"],
body[baidu] .wrapper_new .result [class^="title-instance"] {
  color: var(--huahua-color) !important;
}
body[baidu] .wrapper_new .sp-separator.AC {
  background-color: var(--huahua-bg) !important;
}
body[baidu] .wrapper_new .sp-separator.AC b {
  color: var(--huahua-color) !important;
  text-shadow: none !important;
}
body[baidu] .c-color-t {
  color: var(--huahua-color) !important;
}
body[baidu] .result-molecule > div {
  background: transparent !important;
}
body[baidu] .result-molecule a[title] {
  color: var(--huahua-color) !important;
  background-color: var(--huahua-bg) !important;
}
body[baidu] #page {
  background-color: var(--huahua-bg-dark) !important;
}
body[baidu] #page a {
  background-color: var(--huahua-bg-light) !important;
  color: var(--huahua-color) !important;
}
body[baidu] #foot {
  background-color: var(--huahua-bg-dark) !important;
}
body[baidu] #foot a:hover {
  color: var(--huahua-color-highlight) !important;
}
/*** Dark Mode fix ****/
@media (prefers-color-scheme: dark) {
  #rso .g,
  .vk_c {
    background-color: var(--huahua-bg-light);
  }
  img {
    filter: brightness(0.8);
  }
}
`;


  // ===================== CSS 注入管理 =====================
  const CSS_MAP = {
    baidu: { common: CSS_baiduCommon, one: CSS_baiduOnePage, two: CSS_baiduTwoPage },
    google: { common: CSS_googleCommon, one: CSS_googleOnePage, two: CSS_googleTwoPage },
    bing: { common: CSS_bingCommon, one: CSS_bingOnePage, two: CSS_bingTwoPage },
    duck: { common: CSS_duckCommon, one: CSS_duckOnePage, two: CSS_duckTwoPage },
    haosou: { common: CSS_haosouCommon, one: CSS_haosouOnePage, two: CSS_haosouTwoPage },
    doge: { common: CSS_dogeCommon, one: CSS_dogeOnePage, two: CSS_dogeTwoPage },
  };

  const STYLE_ELEMENTS = {};

  function injectStyle(id, css) {
    if (!css) return;
    removeStyle(id);
    const style = document.createElement('style');
    style.id = 'ac-' + id;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
    STYLE_ELEMENTS[id] = style;
  }

  function removeStyle(id) {
    if (STYLE_ELEMENTS[id]) {
      STYLE_ELEMENTS[id].remove();
      delete STYLE_ELEMENTS[id];
    }
    const el = document.getElementById('ac-' + id);
    if (el) el.remove();
  }

  function getSiteCSS(site, mode) {
    const map = CSS_MAP[site];
    if (!map) return '';
    const m = +mode;
    if (m === 0) return ''; // 不启用CSS

    let css = map.common || '';

    if (m === 1) {
      // 单列靠左: 只加common，不加居中样式
    } else if (m === 2) {
      // 单列居中
      if (map.one && site !== 'baidu') css += '\n' + map.one;
      // Google 额外居中覆盖
      if (site === 'google') {
        css += '\n' + '#main #cnt,#cnt #center_col,#cnt #foot{margin:0 auto !important;transform:translateX(-2.5%);}' +
          '#rso{display:flex!important;flex-direction:column!important;align-items:stretch!important;}' +
          '#rso>*{width:100%!important;max-width:100%!important;}' +
          '.A6K0A,div[two-child],.Wm5I1e,.vt6azd,.A6K0A.z4oRIf{margin-left:0!important;margin-right:0!important;max-width:unset!important;}';
      }
    } else if (m === 3) {
      // 双列
      if (map.two) css += '\n' + map.two;
      // Google的双列CSS已自带grid (依赖[two-father]标记)，其他引擎加通用grid
      if (site !== 'google') css += '\n' + multiColGridCSS(site, 2);
    } else if (m === 4 || m === 5) {
      // 三列/四列
      const cols = m === 4 ? 3 : 4;
      if (site === 'google') {
        // Google: 用twoPage CSS + 覆盖grid列数
        if (map.two) css += '\n' + map.two;
        css += '\n' + googleMultiColOverride(cols);
      } else {
        if (map.two) css += '\n' + map.two;
        css += '\n' + multiColGridCSS(site, cols);
      }
    }

    // Google blocked-item 空隙补位修复
    if (site === 'google' && config.isBlockEnable) {
      css += '\n' + GOOGLE_BLOCK_GAP_FIX;
    }

    return css;
  }

  function googleMultiColOverride(cols) {
    const pct = (100 / cols).toFixed(1) + '%';
    return `
      div[two-father], #kp-wp-tab-overview {
        grid-template-columns: repeat(${cols}, ${pct}) !important;
      }
      div[two-father] > div[two-child] {
        min-width: 0 !important;
        max-width: 100% !important;
      }
      /* 确保结果区域容器宽度足够 */
      #main #cnt, #cnt #center_col, #cnt #foot, .HdCKGe {
        width: calc(${cols * 27}vw + 360px) !important;
        margin: 0 auto !important;
      }
    `;
  }

  // Google 拦截留白修复CSS (来自原脚本补丁)
  const GOOGLE_BLOCK_GAP_FIX = `
    .A6K0A:not(:has(a[href])), .A6K0A:empty {
      display: none !important;
    }
    body .MjjYud:not(:has(a[href])) {
      display: none !important;
      grid-column: unset !important;
      grid-row: unset !important;
      grid-area: unset !important;
      width: 0 !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      position: absolute !important;
    }
    body .vt6azd:not(:has(a[href])) {
      display: none !important;
      position: absolute !important;
      height: 0 !important;
      margin: 0 !important;
      overflow: hidden !important;
    }
    .EyBRub.kp-wholepage-osrp, .XqFnDf, .SLPe5b {
      display: none !important;
    }
    .ULSxyf:empty, .s6JM6d:empty { display: none !important; }
  `;

  function multiColGridCSS(site, cols) {
    const mc = siteCfg ? siteCfg.multiCol : '';
    if (!mc) return '';
    const pct = (100 / cols).toFixed(1) + '%';
    // 只取简单CSS选择器，跳过函数选择器
    const selectors = mc.split(',').map(s => s.trim()).filter(s => s && s !== 'div[two-father]' && !s.includes('not(.vt6azd)')).join(',\n');
    if (!selectors) return '';
    return selectors + ' {\n' +
      '  display: grid !important;\n' +
      '  grid-template-columns: repeat(' + cols + ', ' + pct + ') !important;\n' +
      '  gap: 12px 16px !important;\n' +
      '  align-items: start !important;\n' +
      '}\n' +
      selectors + ' > * {\n' +
      '  min-width: 0 !important;\n' +
      '  max-width: 100% !important;\n' +
      '  width: auto !important;\n' +
      '  overflow: hidden !important;\n' +
      '  word-break: break-word !important;\n' +
      '}\n' +
      selectors + ' .ac-sp-separator,\n' +
      selectors + ' .sp-separator {\n' +
      '  grid-column: 1 / -1 !important;\n' +
      '}';
  }

  // 单列/居中模式宽度+对齐覆盖
  function getSingleColOverride(site, mode) {
    const w = '70vw';
    switch (site) {
      case 'baidu':
        return '#wrapper_wrapper #container,#wrapper #container{width:60vw !important;margin:0 auto !important}' +
          '#wrapper #content_left{width:100% !important;max-width:unset !important;min-width:unset !important;float:none !important;display:block !important}' +
          '.result.c-container,#content_left>.c-container,#content_left>.result{width:100% !important;max-width:unset !important;min-width:unset !important;margin-left:0 !important;margin-right:0 !important}' +
          '#wrapper .head_nums_cont_outer,.hint_common_restop,#header_top_bar{position:relative !important;left:10% !important;width:80% !important}' +
          '.s_form>.s_form_wrapper{margin-left:0 !important;display:flex !important;justify-content:center !important}' +
          '.wrapper_new .head_wrapper #result_logo{margin-left:0 !important}' +
          'form.fm .s_ipt_wr.bg{width:66% !important;min-width:500px !important}' +
          '#wrapper #page{width:100% !important}' +
          '.result-molecule.new-pmd:has(#s_tab){transform:none !important;margin-left:auto !important;margin-right:auto !important}' +
          '#wrapper #s_tab{flex-direction:row !important}';
      case 'google':
        return '#main #cnt,#cnt #center_col,#cnt #foot{width:' + w + ' !important;max-width:1200px !important;margin:0 auto !important}' +
          '#rso{max-width:unset !important}' +
          '.A6K0A,.vt6azd,div[two-child],.A6K0A.z4oRIf{margin-left:auto !important;margin-right:auto !important}';
      case 'bing':
        return '#b_content #b_results{width:' + w + ' !important;max-width:1200px !important}' +
          '#b_content #b_pole{width:' + w + ' !important;max-width:1200px !important;margin:0 auto !important}';
      case 'duck':
        return '#react-layout{width:' + w + ' !important;min-width:600px !important;max-width:1200px !important;margin:0 auto !important;display:block !important}' +
          '#react-layout>div>div{margin-left:0!important}' +
          '#react-layout section{width:100%!important;max-width:100%!important;box-sizing:border-box!important}' +
          '#react-layout ol{width:100%!important;max-width:100%!important}' +
          '#react-layout li{width:100%!important;max-width:100%!important}' +
          '#web_content_wrapper .cw{margin-left:0 !important}';
      case 'haosou':
        return '#container{width:' + w + ' !important;max-width:1200px !important;margin:0 auto !important}' +
          '.result{width:100% !important}';
      case 'doge':
        return '#results{width:' + w + ' !important;max-width:1200px !important;margin:0 auto !important}';
      default: return '';
    }
  }

  function updateRightDisplay() {
    if (!document.body) return;
    if (+config.adsStyleMode >= 3 || !config.isRightDisplayEnable) {
      document.body.classList.remove('showRight');
    } else {
      document.body.classList.add('showRight');
    }
  }

  function reloadAllCSS() {
    const site = currentSite;
    if (!site || !CSS_MAP[site]) return;

    const mode = config.adsStyleMode;
    const css = getSiteCSS(site, mode);
    injectStyle('site-main', css);

    // 百度移动端特殊处理
    if (site === 'baidu' && location.host.includes('m.baidu')) {
      injectStyle('site-main', CSS_baiduCommon);
    }

    // 暗黑模式 - 自动跟随系统
    if (config.isDarkModeEnable && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      injectStyle('dark', CSS_DarkMode);
    } else {
      removeStyle('dark');
    }

    // 下划线
    if (config.isALineDisable) {
      injectStyle('noline', 'a,a em{text-decoration:none !important}');
    } else {
      removeStyle('noline');
    }

    // 隐藏广告容器
    if (config.isAdsEnable) {
      injectStyle('hide-ads', '#bottomads{display:none} #content_left div:not([id]) div[c-matchid], #content_left div[id="300"]:not([class="result"]), #content_right td div:not([id]), #content_right br{position:absolute;top:-6666px;}');
    } else {
      removeStyle('hide-ads');
    }

    // 特殊百度隐藏
    if (site === 'baidu') {
      injectStyle('baidu-special', '.opr-recommends-merge-imgtext{display:none!important;}.res_top_banner{display:none!important;}.headBlock, body div.result-op{display:none;}' +
        '#wrapper #s_tab{flex-direction:row !important;}' +
        '.result.c-container[ac-needhide]{display:none!important;position:absolute!important;height:0!important;overflow:hidden!important;}');
    }

    // 单列/居中模式宽度+对齐覆盖（mode 1 / 2）
    if (+config.adsStyleMode === 1 || +config.adsStyleMode === 2) {
      injectStyle('single-col-fix', getSingleColOverride(site, +config.adsStyleMode));
    } else {
      removeStyle('single-col-fix');
    }

    // Bing 杂项清理：People Also Ask + 侧栏推荐 + 摘要卡片
    if (site === 'bing') {
      injectStyle('bing-cleanup',
        '.rqnaContainerwithfeedback,acf-accordion{display:none !important;}' +
        '.b_rs.rsExplr,.b_suggestionIcon{display:none !important;}' +
        '#b_results .b_ans.b_top{display:none !important;}' +
        '.b_footnote .linkBtn{display:none !important;}' +
        '#b_results li.b_algo[ac-needhide]{display:none!important;position:absolute!important;height:0!important;overflow:hidden!important;}'
      );
    } else {
      removeStyle('bing-cleanup');
    }

    // DDG 拦截补位修复
    if (site === 'duck') {
      injectStyle('duck-blockfix',
        '#react-layout li[ac-needhide]{display:none!important;position:absolute!important;height:0!important;overflow:hidden!important;}'
      );
    } else {
      removeStyle('duck-blockfix');
    }

    // 通用自定义CSS
    if (config.commonStyleEnable && config.commonStyleLess) {
      injectStyle('common-custom', config.commonStyleLess);
    } else {
      removeStyle('common-custom');
    }

    // 站点自定义CSS
    if (config.customStyleEnable && config.customStyleLess) {
      injectStyle('site-custom', config.customStyleLess);
    } else {
      removeStyle('site-custom');
    }
    fixDuckAlignment();
    updateRightDisplay();
  }

  // DDG: JS margin 归零 + 宽度内联 !important 兜底（仅改 observer 目标为 documentElement）
  let _duckObserver = null;
  let _duckInterval = null;

  function fixDuckAlignment() {
    if (currentSite !== 'duck') return;
    if (+config.adsStyleMode !== 2) return;

    // 清理上次调用残留的 observer 和 interval
    if (_duckObserver) { _duckObserver.disconnect(); _duckObserver = null; }
    if (_duckInterval) { clearInterval(_duckInterval); _duckInterval = null; }

    function applyFix() {
      const layout = document.getElementById('react-layout');
      if (!layout) return;
      // 宽度 — 内联 !important 完胜 DDG 后加载 stylesheet
      layout.style.setProperty('width', '70vw', 'important');
      layout.style.setProperty('min-width', '600px', 'important');
      layout.style.setProperty('max-width', '1200px', 'important');
      layout.style.setProperty('margin-left', 'auto', 'important');
      layout.style.setProperty('margin-right', 'auto', 'important');
      // 动态找偏移层（不依赖 class 名）
      layout.querySelectorAll('div').forEach(el => {
        const ml = getComputedStyle(el).marginLeft;
        if (ml && parseInt(ml) > 50 && parseInt(ml) < 200) {
          el.style.setProperty('margin-left', '0', 'important');
        }
      });
    }

    applyFix();

    // 仅此一处改动: observer 挂 documentElement (备份版本用的是 $.waitEl)
    _duckObserver = new MutationObserver(() => applyFix());
    _duckObserver.observe(document.documentElement, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['style']
    });

    // 兜底轮询 + observer 10 秒后清理（避免 DDG 页面终身运行）
    _duckInterval = setInterval(applyFix, 100);
    setTimeout(() => {
      if (_duckInterval) { clearInterval(_duckInterval); _duckInterval = null; }
      if (_duckObserver) { _duckObserver.disconnect(); _duckObserver = null; }
    }, 10000);
  }

  // ===================== 去广告 =====================
  function removeBaiduAd() {
    $.safeRemoveXpath('id("content_right")/div[./a[starts-with(text(),"广告")]]');
    $.safeRemoveXpath('id("content_left")/div[./span[contains(@class,"tuiguang") or contains(@class,"brand")][contains(text(),"广告")]]');
    $.safeRemoveXpath('id("content_left")/div[./a[text()="广告"]]');
    $.safeRemoveXpath('id("content_right")/br');
    $.safeRemoveXpath('id("content_right")/div[not(@id)]');
    $.safeRemoveXpath('id("content_left")/div[contains(@class,"_rs")]');
    $.safeRemoveXpath('id("page-bd")/div[not(contains(@class,"result"))]');
    $.safeRemoveXpath('id("page-bd")/div[not(@class)]');
    $.safeRemoveXpath('div[@class="na-like-container"]');
  }

  function removeGoogleAd() {
    $.safeRemoveAd('#bottomads');
    $.safeRemoveAd('div[aria-label="广告"]');
    $.safeRemoveAd('div[aria-label="Ads"]');
  }

  function removeBingAd() {
    $.safeRemoveAd('.b_ad');
    $.safeRemoveXpath('id("b_results")/li[./div[@class="ad_fls"]]');
    // 新版Bing: 通过 ::before 伪元素 content 匹配广告URL标记
    const checkUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADoAAAALCAYAAAAunZ4gAAAAAXNSR0IArs4c6QAAAl5JREFUSEvlVrtuE0EUPXdW8lqWgA8A8QHJByBBTZDShiiUSMmu3FhRSB9IPgAKd7t2T2SgjAw9rz5AD/kBQLLWtnYOuquZ1cTYMpQGV+ur2fs459wzK/hPfuLnTJJkS0ReBHOfZln2YJVw6HQ6V4uiOAPwLM/zl2Hv1aDtdvu6tfYdyUd6IPjfz/P8ZFWGXTpomqa3RGRAcjvLso/hYDo0ySHJ1wAOAXwHcE/P+cQicsfH4zj+MplMzkheANjRXCTvK4BaB4DmuRbm8cACuAngqzHmtntP634DsK4xkrskj11/teLSNH2utUTknKTWezKXUX0xSZIjEamSkHzsmQyaeK9S1nMANprN5uZ4PM70vIur9J8qCCR7InIx7zzJz5rb1VuL4zh1cnvj45pfRPYUFJKVqnS1ABxoXa3pJarPWleBsNbecO/sLhzUsxiiq0xEUfTBMbqnLDr2e8q+iPSstdU+eOZFZJ/kibXWN75ljDloNBqbRVHcdT5QqyJQzKX8xpiHZVm+8usUEhH6iH9WUJdKd94OesSNMYfW2iGAuhEAPQDbypxffAfQ0BizX5al7nU9qGei2+3+CNVD8q1jbjCbP4qieYOuzRqkk22lqqWDOsft+93zzRhjVBZ9Z1ReQkfGmA1laJF0HdO/MarnSQ5UAVpTmW61Wjuj0eg0UECVn6SXbmWQYY/eBxRMa+2nv5Kul4Yus0hlxtWyBw78U0TW/8SMZnau3q3pdHpFQXOmc0m+Qbw2o/Am8OADOA7707g3IwDnzmMWm9GiK2T26lmVq2a2z/qD4V8f9BciyTQqHtmLjAAAAABJRU5ErkJggg==';
    const adList = [...document.querySelectorAll('#b_results p')].filter(p => {
      const url = getComputedStyle(p, '::before').getPropertyValue('content');
      return url && url.includes(checkUrl);
    });
    adList.forEach(p => p.closest('li')?.remove());
  }

  function removeHaosouAd() {
    $.safeRemoveAd('#so_kw-ad');
    $.safeRemoveAd('#m-spread-left');
    $.safeRemoveAd('#m-spread-bottom');
    $.safeRemoveXpath('id("righttop_box")/li[./span[contains(text(),"广告")]]');
  }

  const AD_REMOVERS = {
    baidu: removeBaiduAd,
    google: removeGoogleAd,
    bing: removeBingAd,
    haosou: removeHaosouAd,
  };

  // ===================== 重定向处理 =====================
  function getHostFromText(text) {
    if (!text) return null;
    text = text.trim().replace(/\s-\d{4}-\d{1,2}-\d{1,2}/, '');
    // 搜狗百度 - 如果第一个是中文，地址是第二个
    const parts = text.split('-');
    if (parts.length > 1 && /[\u4E00-\u9FFF]+/.test(text) && currentSite === 'baidu') {
      // 连字符域名保护：跳过含点的 parts（如 www.my-site.com → my-site.com）
      const domainPart = parts.find(p => /\.\w{2,}$/.test(p.trim()) && !/\s/.test(p));
      if (domainPart) text = domainPart;
    }
    const res = /(https?:\/\/)?([^\s/]+)/i.exec(text);
    const host = (res && res[2]) ? res[2].trim() : '';
    if (!host || host.indexOf('.') < 0) return null;
    return host;
  }

  function getNodeHost(node) {
    if (!node) return { host: '', url: '' };
    if (node instanceof HTMLAnchorElement) {
      return { host: node.host, url: node.href };
    }
    const text = node.innerText || node.textContent || '';
    return { host: getHostFromText(text), url: text };
  }

  function dealRedirect(request, curHref, respText, regText) {
    if (!respText) return;
    let realUrl = '';
    if (regText) {
      realUrl = $.regGet(respText, regText);
    } else {
      realUrl = respText;
    }
    if (realUrl && !realUrl.includes('www.baidu.com/link')) {
      $.safeFn(() => {
        document.querySelectorAll('[href="' + curHref + '"]').forEach(el => {
          el.setAttribute('ac-redirect', '2');
          el.href = realUrl;
        });
        if (request) request.abort();
      });
    }
  }

  async function handleRedirect() {
    if (!config.isRedirectEnable || !siteCfg || !siteCfg.linkSel) return;

    const mainNodes = document.querySelectorAll(siteCfg.main + ':not([ac-redirect])');
    if (!mainNodes.length) return;
    const seen = new Set();

    for (const curNode of mainNodes) {
      if (curNode.getAttribute('ac-redirect')) continue;
      curNode.setAttribute('ac-redirect', '0');

      const linkNode = curNode.querySelector(siteCfg.linkSel);
      if (!linkNode) continue;

      // 跳过特殊链接
      if (linkNode.href && (linkNode.href.startsWith('javascript') || linkNode.href.startsWith('#'))) continue;

      let linkHref = linkNode.href || '';
      if (!linkHref) continue;

      const before = seen.size;
      seen.add(linkHref);
      if (seen.size === before) continue; // 已处理

      // 检测mu/data-mdurl直接链接
      const directLink = curNode.getAttribute('mu') || linkNode.getAttribute('data-mdurl');
      if (directLink && !directLink.includes('nourl')) {
        dealRedirect(null, linkHref, directLink);
        continue;
      }

      // 需要通过接口获取真实URL
      if (linkHref.includes('www.baidu.com/link') ||
          linkHref.includes('m.baidu.com/from') ||
          linkHref.includes('www.sogou.com/link') ||
          linkHref.includes('so.com/link') ||
          linkHref.search(/bing\.com\/ck[aa]click/) >= 0 ||
          linkHref.search(/e\.so\.com\/search\/eclk/) >= 0) {
        ((async (node, href) => {
          let url = href.replace(/^http:/, 'https:');
          if (currentSite === 'baidu' && !url.includes('eqid')) {
            url += '&wd=&eqid=';
          }
          const req = GM.xhr({
            url,
            method: 'GET',
            headers: { Accept: '', Referer: href.replace(/^http:/, 'https:') },
            timeout: 8000,
            onload: function (resp) {
              if (resp.responseText || resp.responseHeaders) {
                dealRedirect(req, href, resp.responseText, "URL='([^']+)'");
                if (resp.responseHeaders && resp.responseHeaders.includes('tm-finalurl')) {
                  const finalUrl = $.regGet(resp.responseHeaders, 'tm-finalurl\\w+ ([^\\s]+)');
                  if (finalUrl) dealRedirect(req, href, finalUrl);
                }
              }
            },
            ontimeout: function () { /* fire-and-forget: link stays as original redirect */ },
          });
        })(curNode, linkHref));
      }
    }
  }

  // 谷歌去 onmousedown
  function removeGoogleMouseDown() {
    if (currentSite !== 'google') return;
    $.safeFn(() => {
      document.querySelectorAll('.g .rc a:not([data-fixed]), #rs, #rso .g a:not([data-fixed])').forEach(el => {
        el.setAttribute('onmousedown', '');
        el.setAttribute('target', '_blank');
        el.setAttribute('data-jsarwt', '0');
        el.setAttribute('data-fixed', '1');
      });
    });
  }

  // 百度学术重定向
  function handleScholarRedirect() {
    if (currentSite !== 'baidu_xueshu') return;
    document.querySelectorAll('a[href*="sc_vurl=http"]').forEach(el => {
      el.href = $.getUrlParam(el.href, 'sc_vurl', true);
    });
  }

  // 百度手机版重定向
  function handleMobileBaidu() {
    if (!location.host.includes('m.baidu.com')) return;
    document.querySelectorAll('#page #page-bd #results .result:not([ac_redirectStatus])').forEach(node => {
      $.safeFn(() => {
        const logData = JSON.parse(node.dataset.log.replace(/'/g, '"'));
        const trueLink = logData.mu;
        node.querySelector('article')?.setAttribute('rl-link-href', trueLink);
        node.querySelectorAll('a').forEach(a => a.setAttribute('href', trueLink));
      });
      node.setAttribute('ac_redirectStatus', '1');
    });
  }

  // ===================== Favicon 管理 =====================
  let faviconList = [];

  function addFavicons() {
    if (!config.isFaviconEnable || !siteCfg || !siteCfg.faviconSel) return;

    const cites = document.querySelectorAll(siteCfg.faviconSel + ':not([ac-favicon])');
    if (!cites.length) return;
    const batchSize = 10;
    let idx = 0;
    const seenHosts = new Set(); // 去重

    function processBatch() {
      const limit = Math.min(idx + batchSize, cites.length);
      for (; idx < limit; idx++) {
        const cite = cites[idx];
        if (cite.hasAttribute('ac-favicon')) continue;

        let target = cite;
        let { host } = getNodeHost(target);

        // 验证host有效性
        if (!host || host.length < 3 || !/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(host)) {
          cite.setAttribute('ac-favicon', '-1');
          continue;
        }

        // 去重
        if (seenHosts.has(host)) {
          cite.setAttribute('ac-favicon', '-1');
          continue;
        }
        seenHosts.add(host);

        // 向上找插入点
        for (let i = 0; i < 5; i++) {
          target = target.parentNode;
          if (target && target.querySelector(siteCfg.faviconInsertTo)) break;
        }

        // 检查是否已有favicon
        if (target && target.innerHTML) {
          const html = target.innerHTML;
          if (/fav-url|wr_fav|favurl|tit-ico|img_fav|c-tool-|c-icon|xA33Gc|XNo5Ab/i.test(html)) {
            cite.setAttribute('ac-favicon', '-2');
            continue;
          }
        }

        target = target ? target.querySelector(siteCfg.faviconInsertTo) : null;
        if (!target) {
          cite.setAttribute('ac-favicon', '-1');
          continue;
        }

        // 简化host为主域名
        const shortHost = host.replace(/[^.]+\.([^.]+)\.([^.]+)/, '$1.$2');

        if (!target.hasAttribute('data-favicon-t')) {
          target.setAttribute('data-favicon-t', shortHost);
          // 限制列表大小，避免长时间搜索后内存无限增长
          if (faviconList.length < 500) {
            faviconList.push({ tag: target.tagName.toLowerCase(), url: shortHost });
          }
        }
        cite.setAttribute('ac-favicon', '1');
      }
      if (idx < cites.length) {
        requestAnimationFrame(processBatch);
      } else {
        updateFaviconCSS();
      }
    }
    requestAnimationFrame(processBatch);
  }

  let _faviconCssVersion = -1;

  function updateFaviconCSS() {
    // 列表未变则跳过 CSS 重建
    if (_faviconCssVersion === faviconList.length) return;
    _faviconCssVersion = faviconList.length;
    const base = 'h3::before, h2::before {content:"";display:inline-block} [data-favicon-t]::before{width:16px;height:16px;margin-right:4px;background-size:100% 100%;vertical-align:text-top;}';
    const seen = new Set();
    const rules = faviconList.reduce((css, { tag, url }) => {
      if (!url || !tag || seen.has(url)) return css;
      seen.add(url);
      const imgUrl = 'https://favicon.yandex.net/favicon/v2/' + encodeURIComponent(url) + '?size=32';
      return css + tag + '[data-favicon-t="' + url + '"]::before{background-image:url(' + imgUrl + ');}';
    }, base);
    injectStyle('favicon', rules);
  }

  // ===================== 计数器 =====================
  let sortIndex = 1;

  function addCounter() {
    if (!config.isCounterEnable || !siteCfg || !siteCfg.counterSel) return;

    const items = document.querySelectorAll(siteCfg.counterSel);
    const batchSize = 20;
    let idx = 0;

    function processBatch() {
      const limit = Math.min(idx + batchSize, items.length);
      for (; idx < limit; idx++) {
        const item = items[idx];
        if (item.hasAttribute('sort-index')) continue;

        item.setAttribute('sort-index', sortIndex);
        const em = document.createElement('em');
        em.className = 'ac-counter';
        em.style.cssText = 'font-style:normal;position:relative;z-index:1;margin-right:4px;display:inline-block;color:white;font-family:Arial;font-size:16px;text-align:center;width:22px;line-height:22px;border-radius:50%;background:#FD9999;';
        em.textContent = sortIndex;
        item.insertAdjacentElement('afterbegin', em);
        sortIndex++;
      }
      if (idx < items.length) requestAnimationFrame(processBatch);
    }
    requestAnimationFrame(processBatch);
  }

  function removeCounters() {
    document.querySelectorAll('.ac-counter').forEach(el => el.remove());
    document.querySelectorAll('[sort-index]').forEach(el => el.removeAttribute('sort-index'));
    sortIndex = 1;
  }

  // ===================== 域名拦截 =====================
  function getBlockRegList() {
    return blockList.filter(Boolean).map(rule => {
      try { return new RegExp(rule.replace(/\*/g, '.*')); } catch (e) { return rule; }
    });
  }

  function addBlockButtons() {
    if (!config.isBlockEnable || !siteCfg || !siteCfg.blockSel) return;

    const nodes = document.querySelectorAll(siteCfg.main + ':not([bhandle])');
    if (!nodes.length) return;
    nodes.forEach(node => {
      if (node.hasAttribute('bhandle')) return;
      node.classList.add('ac-entry-ani');

      // 用 faviconSel 提取真实域名（cite/url文本），blockSel 仅用于按钮插入位置
      const favNode = node.querySelector(siteCfg.faviconSel);
      const blockNode = node.querySelector(siteCfg.blockSel);
      const { host } = getNodeHost(favNode || blockNode);
      if (!host || host.length < 3) return;

      if (blockNode && !blockNode.hasAttribute('has-insert')) {
        blockNode.setAttribute('has-insert', '1');
        const insertTo = currentSite === 'google' ? blockNode : blockNode.parentNode;
        const display = config.isBlockBtnDisplay ? '' : 'display:none;';
        const btn = document.createElement('button');
        btn.className = 'ghhider ghhb';
        btn.dataset.host = host;
        btn.title = '\u70B9\u51FB\u5C4F\u853D ' + host;
        btn.textContent = 'block';
        btn.style.cssText = display + 'color:#555;background:#fcfcfc;font-size:11px;border:1px solid #ccc;border-radius:3px;padding:1px 4px;cursor:pointer;margin-left:4px;vertical-align:middle;';
        btn.addEventListener('mouseenter', () => { btn.style.color = '#006aff'; btn.style.borderColor = '#006aff'; });
        btn.addEventListener('mouseleave', () => { btn.style.color = '#555'; btn.style.borderColor = '#ccc'; });
        insertTo.appendChild(btn);
      }
      node.setAttribute('bhandle', '1');
    });

    applyBlockFilter();
  }

  // 拦截检查并发锁 + 全量完成标记
  let isBlockChecking = false;
  let _blockFilterDone = false;

  function applyBlockFilter() {
    if (!siteCfg) return;
    if (isBlockChecking) return;
    isBlockChecking = true;

    const allNodes = [...document.querySelectorAll(siteCfg.main)];
    const regList = getBlockRegList();

    // 全量已检查过则跳过
    if (_blockFilterDone && allNodes.every(n => n.dataset.checked)) {
      isBlockChecking = false;
      return;
    }

    let idx = 0;
    const batchSize = 25;
    const batch = () => {
      const end = Math.min(idx + batchSize, allNodes.length);
      for (; idx < end; idx++) {
        const node = allNodes[idx];
        // 已检查过且未手动干预则跳过
        if (node.dataset.checked && !node.querySelector('button[ac-user-alter]')) continue;
        if (node.querySelector('button[ac-user-alter]')) continue;
        const favNode = node.querySelector(siteCfg.faviconSel);
        const blockNode = node.querySelector(siteCfg.blockSel);
        const { host, url } = getNodeHost(favNode || blockNode);
        if (!host || host.length < 3) { node.dataset.checked = '1'; continue; }

        const isBlocked = regList.some(r => {
          try { return r.test(host || url); } catch (e) { return r === host; }
        });

        if (isBlocked) {
          if (config.isBlockResultDisplay) {
            node.remove();
          } else {
            if (!node.hasAttribute('ac-needhide')) {
              node.setAttribute('ac-needhide', '1');
              node.insertAdjacentHTML('afterbegin', '<span class="ac-block-show" style="display:block;cursor:pointer;color:#999;padding:4px 0;" title="\u70B9\u51FB\u663E\u793A">blocked: ' + host + '</span>');
              node.addEventListener('click', function(ev) {
                const btn = node.querySelector('.ghhider.ghhb');
                if (btn) btn.setAttribute('ac-user-alter', '1');
                node.removeAttribute('ac-needhide');
                const bs = node.querySelector('.ac-block-show');
                if (bs) bs.remove();
                ev.stopPropagation();
                ev.preventDefault();
              });
            }
          }
        } else {
          node.removeAttribute('ac-needhide');
        }
        node.dataset.checked = '1';
      }
      if (idx < allNodes.length) {
        requestAnimationFrame(batch);
      } else {
        _blockFilterDone = true;
        isBlockChecking = false;
        if (currentSite === 'bing') fixBingImgCapLayout();
      }
    };
    requestAnimationFrame(batch);
  }

  // 全局block按钮事件委托（只绑定一次）
  if (!window._acBlockListenerInited) {
    window._acBlockListenerInited = true;
    document.addEventListener('click', function (e) {
      const btn = e.target.closest('.ghhider.ghhb');
      if (!btn) return;
      e.stopPropagation();
      e.preventDefault();
      const host = btn.dataset.host;
      if (btn.hasAttribute('ac-user-alter')) {
        btn.removeAttribute('ac-user-alter');
        blockList = blockList.filter(h => h !== host);
      } else {
        btn.setAttribute('ac-user-alter', '1');
        blockList.push(host);
      }
      saveBlocks();
      applyBlockFilter();
    });
  }

  // ===================== 可拖拽浮动设置按钮 =====================
  const BTN_POS_KEY = 'acSearchBtnPos';

  function insertMenuButton() {
    if (document.getElementById('ac-float-btn')) return;

    // 加载保存的位置（兼容 Tampermonkey/Violentmonkey）
    let savedPos = null;
    (async () => {
      try { const raw = await GM.getValue(BTN_POS_KEY, null); savedPos = (raw && typeof raw === 'string') ? JSON.parse(raw) : raw; } catch (e) { /* ignore */ }
      tryRestorePos();
    })();

    const container = document.createElement('div');
    container.id = 'ac-float-btn';
    // 默认右下角用 CSS，不是 JS — 避免 offsetWidth=0 竞态
    container.style.cssText = 'position:fixed;z-index:10000000;cursor:grab;user-select:none;right:20px;bottom:80px;';
    document.body.appendChild(container);

    // 拖拽手柄（hover 显示）
    const grip = document.createElement('div');
    grip.className = 'ac-btn-grip';
    grip.style.cssText = 'width:100%;height:8px;display:flex;justify-content:center;align-items:center;gap:3px;opacity:0;transition:opacity 0.2s;padding:4px 0 2px;';
    grip.innerHTML = '<span style="display:block;width:4px;height:4px;border-radius:50%;background:#fff;"></span>'.repeat(3);
    container.appendChild(grip);

    // 按钮
    const btn = document.createElement('button');
    btn.className = 'ac-btn-config';
    btn.textContent = '\u2699';
    btn.style.cssText = 'display:block;width:42px;height:42px;background:#4e6ef2;color:#fff;font-size:20px;font-weight:700;border:none;border-radius:50%;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);line-height:42px;text-align:center;padding:0;transition:transform 0.15s,background 0.2s;';
    btn.title = 'AC-Search 设置';
    btn.addEventListener('click', (e) => {
      if (moved) return; // 拖拽过则不打开设置
      e.preventDefault(); e.stopPropagation();
      toggleSettings();
    });
    btn.addEventListener('mouseenter', () => { btn.style.background = '#3d5bd9'; btn.style.transform = 'scale(1.1)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#4e6ef2'; btn.style.transform = 'scale(1)'; });
    container.appendChild(btn);

    // hover 显示拖拽手柄
    container.addEventListener('mouseenter', () => { grip.style.opacity = '1'; });
    container.addEventListener('mouseleave', () => { if (!dragging) grip.style.opacity = '0'; });

    // === 拖拽逻辑 ===
    let dragging = false, moved = false;
    let startX = 0, startY = 0, origLeft = 0, origTop = 0;
    const THRESHOLD = 3;
    const SNAP = 20;

    function clampAndSnap(l, t, w, h) {
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      l = Math.max(0, Math.min(l, winW - w));
      t = Math.max(0, Math.min(t, winH - h));
      if (l <= SNAP) l = 0;
      else if (l >= winW - w - SNAP) l = winW - w;
      if (t <= SNAP) t = 0;
      else if (t >= winH - h - SNAP) t = winH - h;
      return { left: l, top: t };
    }

    function onMove(e) {
      if (!moved) {
        if (Math.abs(e.clientX - startX) <= THRESHOLD && Math.abs(e.clientY - startY) <= THRESHOLD) return;
        moved = true;
        container.style.cursor = 'grabbing';
        container.style.right = '';
        container.style.bottom = '';
        container.style.left = origLeft + 'px';
        container.style.top = origTop + 'px';
      }
      const w = container.offsetWidth;
      const h = container.offsetHeight;
      const pos = clampAndSnap(origLeft + (e.clientX - startX), origTop + (e.clientY - startY), w, h);
      container.style.left = pos.left + 'px';
      container.style.top = pos.top + 'px';
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      container.style.cursor = 'grab';
      if (moved) {
        const rect = container.getBoundingClientRect();
        const right = Math.round(window.innerWidth - rect.right);
        const bottom = Math.round(window.innerHeight - rect.bottom);
        container.style.right = right + 'px';
        container.style.bottom = bottom + 'px';
        container.style.left = '';
        container.style.top = '';
        GM.setValue(BTN_POS_KEY, JSON.stringify({ right, bottom }));
      }
      grip.style.opacity = '0';
      // 延迟清零：让同步 click 事件能读到 moved=true 从而跳过
      setTimeout(() => { moved = false; dragging = false; }, 0);
    }

    container.addEventListener('mousedown', function (e) {
      e.preventDefault();
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = container.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    function tryRestorePos() {
      if (!container.offsetWidth) { setTimeout(tryRestorePos, 50); return; } // 未 layout
      if (!savedPos || typeof savedPos.right !== 'number' || typeof savedPos.bottom !== 'number') return; // 无保存位置=保持默认CSS
      container.style.right = Math.max(0, savedPos.right) + 'px';
      container.style.bottom = Math.max(0, savedPos.bottom) + 'px';
      container.style.left = '';
      container.style.top = '';
    }
  }

  // ===================== 自动翻页 =====================
  let pageNum = 1;
  let pageUrl = '';
  let isPageLoading = false;

  function getFullHref(el) {
    if (!el) return '';
    if (typeof el === 'string') return el;
    try { return new URL(el.getAttribute('href') || el.href || '', location.href).href; } catch (e) { return ''; }
  }

  // Pager分隔符图标 (base64)
  const PAGER_ICONS = {
    top: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAWtJREFUeNrclE0rRGEUx8c1GUpRJIVIZGdhZCVr38GGhaI0ZXwCkiglShZEcvJxhdgYWOjLEUpmEyiLzze+o8dTzdO3PljoVTv7rPc85d+6555xYrEhWop6boda5+6l9wjWcWpF+WIbqCJJ9hFRcDr3QAIkIhKugz5PDfkSixkphz5aiAnqgE8rgWRxGoSOPyBkswQuUwyscw4HrmFCZL8KtJAg7mEFPEmo4FdPwk0BUcsdzIap0TQ8qMAPuICcEjLnd+VjSjcfJNgIcDkZGSymYGsnK9EZMrxe4MFaNGiZjC2fT5zQ3p7QDK1dR2GSljziclAvRUe8nHYVA4jjvC43NfAuksmB2QNqcsWxKcLbAKTFnS0hWD6n27Fd6FLqiDI5iQmQ9jpiVT0sNJ6aYd7dAE3QHBbinSAX5JWWaxuLo8F35jhbBK9Y+rCl6pLcnna8NvuDGMnslpbZRpXZYT3r4EGACZL3ZL2afNFAAAAABJRU5ErkJggg==',
  };

  async function loadNextPage() {
    if (!config.isAutopage || !siteCfg || !siteCfg.pager) return;

    // DOM 查找下一页链接
    let el = null;
    if (siteCfg.pager.nextLinkFn) el = siteCfg.pager.nextLinkFn();
    if (!el && siteCfg.pager.nextLink) {
      const sel = siteCfg.pager.nextLink;
      try { el = document.querySelector(sel); } catch (e) {}
      if (!el) el = $.xpath(sel);
    }
    if (!el) return;
    const url = getFullHref(el);
    if (!url || url === pageUrl) return;
    pageUrl = url;
    isPageLoading = true;

    // 加载指示器
    const loader = document.createElement('div');
    loader.id = 'ac-pager-loader';
    loader.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:8px 16px;background:rgba(0,0,0,0.7);color:white;border-radius:20px;font-size:12px;z-index:99999;';
    loader.textContent = 'Loading...';
    document.body.appendChild(loader);

    GM.xhr({
      url,
      method: 'GET',
      timeout: 5000,
      onload: function (resp) {
        try {
          loader.remove();
          if (!resp.responseText) { isPageLoading = false; return; }

          const parser = new DOMParser();
          const doc = parser.parseFromString(resp.responseText, 'text/html');

          let pageItems = $.getAll(siteCfg.pager.pageElement, doc);
          // XPath 选择器在 DOMParser doc 里可能失效，转 CSS 重试
          if (!pageItems.length) {
            const cssSel = siteCfg.pager.pageElement.replace(/id\(["']([^"']+)["']\)/g, '#$1');
            try { pageItems = [...doc.querySelectorAll(cssSel)]; } catch (e) { /* ignore */ }
          }
          if (!pageItems.length) { isPageLoading = false; return; }

          const [insertTo, insertMode = 2] = siteCfg.pager.insertTo || [];
          let targetEl;
          if (insertTo) {
            targetEl = $.getAll(insertTo, document)[0];
          }
          if (!targetEl) {
            const curItems = $.getAll(siteCfg.pager.pageElement, document);
            targetEl = curItems[curItems.length - 1]?.parentNode;
          }
          if (!targetEl) { isPageLoading = false; return; }

          pageNum++;
          const sep = document.createElement('div');
          sep.className = 'ac-sp-separator';
          sep.style.cssText = 'margin:0;padding:0;height:0;';
          sep.innerHTML = '';

          if (insertMode === 1) {
            targetEl.parentNode?.insertBefore(sep, targetEl);
            pageItems.forEach(item => targetEl.parentNode?.insertBefore(item, targetEl));
          } else {
            targetEl.appendChild(sep);
            pageItems.forEach((item, i) => {
              item.classList.add('ac-entry-ani');
              item.style.animationDelay = (i * 0.04) + 's';
              targetEl.appendChild(item);
            });
            if (currentSite === 'bing') fixBingImgCapLayout();
          }

          // 替换翻页元素（只替换第一个匹配，不要求长度相等）
          if (siteCfg.pager.replaceE) {
            try {
              const repEl = $.getAll(siteCfg.pager.replaceE, doc);
              const oriEl = $.getAll(siteCfg.pager.replaceE, document);
              if (repEl.length && oriEl.length) {
                oriEl[0].outerHTML = repEl[0].outerHTML;
              }
            } catch (e) { /* ignore */ }
          } else {
            // replaceE 为 null 时，手动更新翻页链接（Bing/Google 依赖此逻辑推进页码）
            try {
              const oldEl = siteCfg.pager.nextLinkFn ? siteCfg.pager.nextLinkFn() : null;
              if (oldEl) {
                let newEl = null;
                if (currentSite === 'bing') newEl = doc.querySelector('a.sb_pagN');
                else if (currentSite === 'google') newEl = doc.getElementById('pnnext');
                if (newEl) {
                  const nextUrl = getFullHref(newEl);
                  if (nextUrl && nextUrl !== url) oldEl.href = nextUrl;
                } else {
                  oldEl.remove();
                }
              }
            } catch (e) { /* ignore */ }
          }

          if (siteCfg.pager.stylish) {
            injectStyle('pager-css', siteCfg.pager.stylish);
          }
        } catch (e) {
          /* ignore */
        }
        isPageLoading = false;
      },
      ontimeout: function () {
        loader.remove();
        isPageLoading = false;
        pageUrl = '';
      },
      onerror: function () {
        loader.remove();
        isPageLoading = false;
        pageUrl = '';
      },
    });
  }

  function fixBingImgCapLayout() {
    if (currentSite !== 'bing') return;
    // 转换 rms_iac → img
    document.querySelectorAll('div.rms_iac').forEach(el => {
      const imgSrc = el.dataset.src;
      if (!imgSrc) return;
      const img = document.createElement('img');
      img.src = imgSrc;
      if (el.dataset.height) img.height = el.dataset.height;
      if (el.dataset.width) img.width = el.dataset.width;
      if (el.dataset.class) img.className = el.dataset.class;
      if (el.dataset.bm) img.setAttribute('data-bm', el.dataset.bm);
      img.setAttribute('data-priority', '2');
      img.setAttribute('role', 'presentation');
      el.replaceWith(img);
    });
    // 强制恢复 b_imgcap_altitle flex 布局（内联 !important 完胜 Bing JS）
    document.querySelectorAll('#b_results .b_imgcap_altitle').forEach(el => {
      el.style.setProperty('display', 'flex', 'important');
      el.style.setProperty('align-items', 'center', 'important');
      const imgCap = el.querySelector('.b_imgcap_img');
      if (imgCap) {
        imgCap.style.setProperty('flex-shrink', '0', 'important');
        imgCap.style.setProperty('margin-right', '16px', 'important');
        imgCap.style.setProperty('width', 'auto', 'important');
      }
      const h2 = el.querySelector('.b_imgcap_main h2');
      if (h2) {
        h2.style.setProperty('margin', '0', 'important');
        h2.style.setProperty('padding', '0', 'important');
      }
    });
  }

  // 监听 Bing JS 初始化 DOM 变更，实时修复图文卡片布局
  function watchBingInitialization() {
    if (currentSite !== 'bing') return;
    const observer = new MutationObserver(() => {
      if (document.querySelector('#b_results div.rms_iac') || document.querySelector('#b_results .b_imgcap_altitle')) {
        fixBingImgCapLayout();
      }
    });
    observer.observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['style']
    });
    // 5 秒后首次初始化应已完成，断开 observer 降为纯主循环兜底
    setTimeout(() => observer.disconnect(), 5000);
  }

  // 预隐层: 结果元素出现即处理，不等主循环 500ms — 用户看不到未处理状态
  function watchResultsReady() {
    const observer = new MutationObserver(() => {
      if (!document.querySelector(siteCfg.main)) return;
      observer.disconnect();

      applyBlockFilter();
      if (currentSite === 'google') markGoogleTwoLine();
      if (currentSite === 'bing') fixBingImgCapLayout();

      // 双 rAF 确保 rAF 分批全部完成后再移除隐层
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.documentElement.classList.remove('ac-loading');
        });
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function bindPagerScroll() {
    let lastScroll = window.scrollY || document.documentElement.scrollTop;
    window.addEventListener('scroll', $.throttle(function () {
      const st = window.scrollY || document.documentElement.scrollTop;
      const delta = st - lastScroll;
      lastScroll = st;
      if (delta <= 0) return; // 只在下滑时触发
      if (!config.isAutopage || isPageLoading) return;

      const scrollDelta = 888;
      const docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      if (docH <= window.innerHeight + st + scrollDelta) {
        loadNextPage();
      }
    }, 200));
  }

  // ===================== Google 双列标记 =====================
  // 移植自原脚本 findAndMarkP2Line —— 通过 offsetHeight 高度比值
  // 遍历 DOM 树，标记同行并排的两个结果为 [two-father]/[two-child]
  function markGoogleTwoLine() {
    if (currentSite !== 'google') return;
    const mode = +config.adsStyleMode;
    if (mode < 2) return; // mode 0/1 不需要标记，mode 2+ 需要居中/多列

    const rso = document.getElementById('rso');
    if (!rso) return;

    // mode 2 单列居中：简化标记，所有 .A6K0A 都标记
    if (mode === 2) {
      const allCards = rso.querySelectorAll('.A6K0A');
      if (allCards.length > 0) {
        rso.setAttribute('two-father', '1');
        allCards.forEach(card => card.setAttribute('two-child', '1'));
      }
      return;
    }

    // markFatherChild: 找到子元素中的 .A6K0A 并标记
    function markFatherChild(child, father) {
      const childChecked = +(child.getAttribute('two-checked') || 0);
      const fatherChecked = +(father.getAttribute('two-checked') || 0);

      const trueChild = child.querySelector('.A6K0A');
      if (trueChild) {
        trueChild.setAttribute('two-child', '1');
        trueChild.setAttribute('two-checked', childChecked + 1);
        father.setAttribute('two-father', '1');
        father.setAttribute('two-checked', fatherChecked + 1);
        return father;
      }
      return null;
    }

    // getTrueFatherChild: 通过高度比判断是否为合法双列容器
    function getTrueFatherChild(preNode, curNode, fatherNode) {
      const minItemHeight = 60;
      const fatherCurPossible = curNode.offsetHeight > minItemHeight
        && fatherNode.offsetHeight / curNode.offsetHeight > 1.5;
      const fatherAnotherPossible = [...fatherNode.children].some(one =>
        one !== curNode && one.offsetHeight > minItemHeight
        && fatherNode.offsetHeight / one.offsetHeight > 5
      );
      const fatherNotMain = fatherNode.id === 'cnt';

      if (!fatherNotMain && fatherCurPossible && fatherAnotherPossible) {
        return markFatherChild(curNode, fatherNode);
      }

      const nowCurPossible = preNode.offsetHeight > minItemHeight
        && curNode.offsetHeight / preNode.offsetHeight > 1.5;
      const nowAnotherPossible = [...curNode.children].some(one =>
        one !== preNode && one.offsetHeight > minItemHeight
        && curNode.offsetHeight / one.offsetHeight > 5
      );

      if (nowCurPossible && nowAnotherPossible) {
        return markFatherChild(preNode, curNode);
      }
      return null;
    }

    // MarkMine: 从结果项起点向上爬 DOM，最多 9 层
    function MarkMine(curItem) {
      const maxHeight = 9;
      let curHeight = 1;
      let preNode = curItem;
      while (curHeight < maxHeight) {
        const fatherNode = curItem.parentNode;
        const attrV = +(curItem.getAttribute('two-checked') || 0);
        if (!curItem.hasAttribute('two-checked') || attrV < 8) {
          const node = getTrueFatherChild(preNode, curItem, fatherNode);
          if (node) return node;
        }
        curItem.setAttribute('two-checked', attrV + 1);
        preNode = curItem;
        curItem = fatherNode;
        curHeight++;
      }
      return null;
    }

    // 从 Google 结果项出发
    const gList = document.querySelectorAll(
      '.g:not([two-checked*="8"]), .cUnQKe:not([two-checked*="8"]), .Ww4FFb:not([two-checked*="8"])'
    );
    [...gList].filter(one => MarkMine(one));
  }

  // ===================== 搜索引擎特殊处理 =====================
  function handleSpecialCases() {
    // DuckDuckGo: 自动设置连续显示+新窗口
    if (currentSite === 'duck' && config.duck_optimizeDuck) {
      setTimeout(() => {
        $.safeFn(() => {
          if (typeof DDG !== 'undefined') {
            DDG.settings.set('kn', '1', { saveToCloud: true, forceTheme: true });
            DDG.settings.set('kav', '1', { saveToCloud: true, forceTheme: true });
          }
        });
      }, 3000);
    }

    // 百度: 禁用搜索建议cookie（已设置则跳过）
    if (currentSite === 'baidu' && config.baidu_doRemoveSug && !document.cookie.includes('ISSW=1')) {
      $.safeFn(() => {
        const d = new Date();
        d.setTime(d.getTime() + 30 * 24 * 60 * 60 * 1000);
        document.cookie = 'ORIGIN=2; domain=.baidu.com; expires=' + d.toUTCString() + '; path=/; SameSite=None; Secure';
        document.cookie = 'ISSW=1; path=/; SameSite=None; Secure';
        document.cookie = 'ISSW=1; domain=.baidu.com; expires=' + d.toUTCString() + '; path=/; SameSite=None; Secure';
      });
    }
  }

  // ===================== 主循环 =====================
  let mainLoopTimer = null;

  function startMainLoop() {
    if (mainLoopTimer) clearInterval(mainLoopTimer);

    mainLoopTimer = setInterval(() => {
      // Google双列标记
      if (currentSite === 'google') markGoogleTwoLine();

      // 重定向处理
      handleRedirect();
      handleScholarRedirect();
      handleMobileBaidu();
      if (currentSite === 'google') removeGoogleMouseDown();

      // 去广告
      if (config.isAdsEnable) {
        const remover = AD_REMOVERS[currentSite];
        if (remover) remover();
      }

      // Favicon
      if (config.isFaviconEnable && siteCfg) {
        addFavicons();
      }

      // 计数器
      if (config.isCounterEnable && siteCfg) {
        addCounter();
      } else {
        removeCounters();
      }

      // 域名拦截
      if (config.isBlockEnable && config.isRedirectEnable && siteCfg) {
        addBlockButtons();
        applyBlockFilter();
      }
      if (currentSite === 'bing') fixBingImgCapLayout();
    }, 500);

    // 30秒后降低频率，但保留全部功能
    setTimeout(() => {
      if (mainLoopTimer) clearInterval(mainLoopTimer);
      mainLoopTimer = setInterval(() => {
        if (currentSite === 'google') markGoogleTwoLine();
        handleRedirect();
        handleScholarRedirect();
        handleMobileBaidu();
        if (currentSite === 'google') removeGoogleMouseDown();
        if (config.isAdsEnable) {
          const remover = AD_REMOVERS[currentSite];
          if (remover) remover();
        }
        if (config.isFaviconEnable && siteCfg) addFavicons();
        if (config.isCounterEnable && siteCfg) addCounter();
        if (config.isBlockEnable && config.isRedirectEnable && siteCfg) {
          addBlockButtons();
          applyBlockFilter();
        }
        if (currentSite === 'bing') fixBingImgCapLayout();
      }, 3000);
    }, 30000);
    window.addEventListener('beforeunload', () => { if (mainLoopTimer) clearInterval(mainLoopTimer); });
  }

  // ===================== Vue 3 设置面板 =====================
  let settingsPanel = null;
  let vueApp = null;

  const { createApp, reactive, ref, computed, watch, onMounted, nextTick, h, defineComponent } = Vue;

  // 简单的 Panel 组件
  const PanelComp = defineComponent({
    props: ['title'],
    emits: ['close'],
    setup(props, { emit, slots }) {
      const panel = ref(null);
      const bar = ref(null);
      const pos = reactive({ x: 200, y: 100 });
      let dragging = false;
      let startX = 0, startY = 0;

      function onMouseDown(e) {
        if (e.target.closest('button, input, select, textarea')) return;
        dragging = true;
        startX = e.clientX - pos.x;
        startY = e.clientY - pos.y;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      }

      function onMouseMove(e) {
        if (!dragging) return;
        pos.x = Math.max(0, Math.min(window.innerWidth - 400, e.clientX - startX));
        pos.y = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - startY));
      }

      function onMouseUp() {
        dragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }

      return () => h('div', {
        ref: panel,
        style: {
          position: 'fixed',
          left: pos.x + 'px',
          top: pos.y + 'px',
          width: '440px',
          maxHeight: '80vh',
          zIndex: 10000001,
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          overflow: 'hidden',
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
        },
      }, [
        h('div', {
          ref: bar,
          onMousedown: onMouseDown,
          style: {
            cursor: 'move',
            background: 'linear-gradient(135deg, #4e6ef2, #6c3ce0)',
            color: 'white',
            padding: '10px 16px',
            fontWeight: 'bold',
            fontSize: '15px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            userSelect: 'none',
          },
        }, [
          h('span', props.title),
          h('button', {
            onClick: () => emit('close'),
            style: {
              background: 'none',
              border: 'none',
              color: 'white',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '0 4px',
            },
          }, '×'),
        ]),
        h('div', {
          style: {
            padding: '12px 16px',
            maxHeight: 'calc(80vh - 50px)',
            overflowY: 'auto',
          },
        }, slots.default ? slots.default() : []),
      ]);
    },
  });

  // 标签页
  const TABS = [
    { key: 'general', label: '通用' },
    { key: 'baidu', label: '百度' },
    { key: 'google', label: '谷歌' },
    { key: 'bing', label: '必应' },
    { key: 'duck', label: '鸭鸭' },
    { key: 'haosou', label: '好搜' },
  ];

  const SettingsPanel = defineComponent({
    setup() {
      const activeTab = ref('general');

      // 响应式配置镜像
      const cfg = reactive(JSON.parse(JSON.stringify(config)));

      // 拦截域名列表（响应式）
      const blockInput = ref('');
      const blockListReactive = ref([...blockList]);

      let debounceTimer = null;
      function debouncedSave() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          Object.assign(config, JSON.parse(JSON.stringify(cfg)));
          saveConfig();
          reloadAllCSS();
        }, 400);
      }

      watch(cfg, () => { debouncedSave(); }, { deep: true });

      function addBlockDomain() {
        const domain = blockInput.value.trim();
        if (domain && !blockListReactive.value.includes(domain)) {
          blockListReactive.value.push(domain);
          blockList = [...blockListReactive.value];
          saveBlocks();
          blockInput.value = '';
        }
      }

      function removeBlockDomain(domain) {
        blockListReactive.value = blockListReactive.value.filter(d => d !== domain);
        blockList = [...blockListReactive.value];
        saveBlocks();
      }

      function resetAll() {
        Object.assign(cfg, JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
        debouncedSave();
      }

      // CSS textarea 样式
      const textareaStyle = {
        width: '100%', minHeight: '80px', padding: '6px 8px',
        border: '1px solid #ccc', borderRadius: '4px',
        fontSize: '12px', fontFamily: 'monospace', resize: 'vertical',
      };

      return () => [
        // 标签栏
        h('div', { style: { display: 'flex', borderBottom: '2px solid #e0e0e0', marginBottom: '12px', gap: '4px', flexWrap: 'wrap' } },
          TABS.map(tab => h('div', {
            key: tab.key,
            onClick: () => activeTab.value = tab.key,
            style: {
              padding: '6px 12px', cursor: 'pointer',
              borderBottom: activeTab.value === tab.key ? '2px solid #4e6ef2' : '2px solid transparent',
              color: activeTab.value === tab.key ? '#4e6ef2' : '#666',
              fontWeight: activeTab.value === tab.key ? 'bold' : 'normal',
              marginBottom: '-2px', fontSize: '13px',
            },
          }, tab.label))
        ),

        // 通用设置
        activeTab.value === 'general' ? h('div', {}, [
          h('div', { style: { fontSize: '13px', fontWeight: 'bold', color: '#4e6ef2', margin: '12px 0 8px', borderBottom: '1px solid #eee', paddingBottom: '4px' } }, '核心功能'),
          toggleItem('启用重定向去除', 'isRedirectEnable', cfg),
          toggleItem('启用去广告', 'isAdsEnable', cfg),
          toggleItem('启用Favicon图标', 'isFaviconEnable', cfg),
          toggleItem('启用自动翻页', 'isAutopage', cfg),
          toggleItem('启用计数器', 'isCounterEnable', cfg),

          h('div', { style: { fontSize: '13px', fontWeight: 'bold', color: '#4e6ef2', margin: '12px 0 8px', borderBottom: '1px solid #eee', paddingBottom: '4px' } }, '显示设置'),
          h('div', { style: { margin: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, [
            h('label', { style: { fontWeight: 'bold', fontSize: '13px' } }, '显示模式: '),
            h('select', {
              value: String(cfg.adsStyleMode),
              onChange: (e) => { cfg.adsStyleMode = +e.target.value; },
              style: { padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px' },
            }, [
              h('option', { value: '0' }, '0 - 不使用CSS'),
              h('option', { value: '1' }, '1 - 单列靠左'),
              h('option', { value: '2' }, '2 - 单列居中'),
              h('option', { value: '3' }, '3 - 双列居中'),
              h('option', { value: '4' }, '4 - 三列'),
              h('option', { value: '5' }, '5 - 四列'),
            ]),
          ]),
          toggleItem('移除下划线', 'isALineDisable', cfg),

          h('div', { style: { fontSize: '13px', fontWeight: 'bold', color: '#4e6ef2', margin: '12px 0 8px', borderBottom: '1px solid #eee', paddingBottom: '4px' } }, '域名拦截'),
          toggleItem('启用域名拦截', 'isBlockEnable', cfg),
          toggleItem('直接删除已拦截', 'isBlockResultDisplay', cfg),
          toggleItem('显示拦截按钮', 'isBlockBtnDisplay', cfg),
          h('div', { style: { margin: '8px 0', display: 'flex', gap: '6px' } }, [
            h('input', {
              value: blockInput.value,
              onInput: (e) => blockInput.value = e.target.value,
              onKeydown: (e) => { if (e.key === 'Enter') addBlockDomain(); },
              placeholder: '输入域名 (如 csdn.net)',
              style: { flex: 1, padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px' },
            }),
            h('button', { onClick: addBlockDomain, style: { padding: '4px 12px', background: '#4e6ef2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' } }, '添加'),
          ]),
          h('div', { style: { maxHeight: '120px', overflowY: 'auto', margin: '4px 0' } },
            blockListReactive.value.map(d => h('div', {
              key: d,
              style: { display: 'flex', justifyContent: 'space-between', padding: '3px 6px', background: '#f5f5f5', margin: '2px 0', borderRadius: '3px', fontSize: '12px' },
            }, [
              h('span', d),
              h('span', { onClick: () => removeBlockDomain(d), style: { cursor: 'pointer', color: '#e74c3c', fontWeight: 'bold' } }, '×'),
            ]))
          ),

          h('div', { style: { fontSize: '13px', fontWeight: 'bold', color: '#4e6ef2', margin: '12px 0 8px', borderBottom: '1px solid #eee', paddingBottom: '4px' } }, '自定义CSS'),
          toggleItem('启用通用自定义CSS', 'commonStyleEnable', cfg),
          cfg.commonStyleEnable ? h('textarea', {
            value: cfg.commonStyleLess,
            onInput: (e) => cfg.commonStyleLess = e.target.value,
            placeholder: '/* 对所有搜索引擎生效的CSS */',
            style: { ...textareaStyle, marginBottom: '8px' },
          }) : null,
          toggleItem('启用站点自定义CSS', 'customStyleEnable', cfg),
          cfg.customStyleEnable ? h('textarea', {
            value: cfg.customStyleLess,
            onInput: (e) => cfg.customStyleLess = e.target.value,
            placeholder: '/* 对当前搜索引擎生效的CSS */',
            style: textareaStyle,
          }) : null,

          h('div', { style: { marginTop: '16px', display: 'flex', gap: '10px' } }, [
            h('button', { onClick: resetAll, style: { padding: '6px 16px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' } }, '重置默认'),
          ]),
        ]) : null,

        // 引擎特定设置
        activeTab.value === 'baidu' ? h('div', {}, [
          toggleItem('移除搜索建议', 'baidu_doRemoveSug', cfg),
        ]) : null,
        activeTab.value === 'google' ? h('div', {}, [
          toggleItem('使用百度Logo', 'google_useBaiduLogo', cfg),
        ]) : null,
        activeTab.value === 'duck' ? h('div', {}, [
          toggleItem('优化鸭鸭', 'duck_optimizeDuck', cfg),
        ]) : null,
      ];
    },
  });

  function toggleItem(label, key, cfg) {
    return h('label', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 0',
        cursor: 'pointer',
        borderBottom: '1px solid #f0f0f0',
      },
    }, [
      h('span', { style: { fontSize: '13px' } }, label),
      h('div', {
        onClick: (e) => {
          e.preventDefault();
          cfg[key] = !cfg[key];
        },
        style: {
          width: '44px',
          height: '24px',
          borderRadius: '12px',
          background: cfg[key] ? '#4e6ef2' : '#ccc',
          transition: 'background 0.2s',
          position: 'relative',
          cursor: 'pointer',
        },
      }, [
        h('div', {
          style: {
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: 'white',
            position: 'absolute',
            top: '2px',
            left: cfg[key] ? '22px' : '2px',
            transition: 'left 0.2s',
          },
        }),
      ]),
    ]);
  }

  function openSettings() {
    if (settingsPanel) {
      settingsPanel.remove();
      settingsPanel = null;
    }
    const mount = document.createElement('div');
    mount.id = 'ac-settings-mount';
    document.body.appendChild(mount);
    settingsPanel = mount;

    vueApp = createApp({
      setup() {
        const show = ref(true);
        return () => show.value ? h(PanelComp, {
          title: 'AC-Search-Local 配置',
          onClose: () => { show.value = false; closeSettings(); },
        }, () => h(SettingsPanel)) : null;
      },
    });
    vueApp.mount(mount);
  }

  function closeSettings() {
    if (settingsPanel) {
      settingsPanel.remove();
      settingsPanel = null;
    }
    if (vueApp) {
      vueApp.unmount();
      vueApp = null;
    }
  }

  function toggleSettings() {
    if (settingsPanel) {
      closeSettings();
    } else {
      openSettings();
    }
  }

  // ===================== 初始化 =====================
  async function init() {
    await loadConfig();

    if (!currentSite || !siteCfg) {
      // 不是搜索引擎页面，不执行
      return;
    }
    document.documentElement.classList.add('ac-loading');

    // 注入CSS
    $.waitEl('head', () => {
      // 加载动画
      $.addStyleEl(`
        @keyframes ac-fade-in { 0%{opacity:0;transform:translateY(8px);} 100%{opacity:1;transform:translateY(0);} }
        .ac-entry-ani { animation: ac-fade-in 0.3s ease both; }
        .ghhider.ghhb { color:#555;background:#fcfcfc;font-size:12px;border:1px solid #ccc;border-radius:4px;padding:2px 4px;cursor:pointer;vertical-align:middle; }
        .ghhider.ghhb:hover { color:#006aff;background:#fff;border-color:#006aff; }
        body[google] .ghhider.ghhb { vertical-align: top; }
        body[haosou] .ghhider.ghhb { vertical-align: super; }
        *[ac-needhide] { display:none !important; position:absolute !important; height:0 !important; margin:0 !important; padding:0 !important; overflow:hidden !important; }
        [ac-needhide] .ac-block-show { display:block;cursor:pointer;color:#999;padding:4px 0; }
        [ac-needhide] > :not(.ac-block-show) { display:none; }
        .ac-counter { background:#FD9999 !important; }
        .ac-loading #rso,
        .ac-loading #b_results,
        .ac-loading #content_left,
        .ac-loading .react-results--main { content-visibility: hidden; }
      `, 'ac-global');

      reloadAllCSS();

      // 插入设置菜单
      $.waitEl('body', () => {
        setTimeout(() => {
          insertMenuButton();
          bindPagerScroll();
        }, 1000);
      });
    });

    // 注册菜单
    GM.registerMenu('AC-Search-Local 设置', openSettings);
    GM.registerMenu('AC-Search-Local 重置', () => {
      Object.assign(config, DEFAULT_CONFIG);
      saveConfig();
      reloadAllCSS();
      location.reload();
    });

    // 启动主循环
    startMainLoop();

    // 特殊处理
    handleSpecialCases();
    watchBingInitialization();
    watchResultsReady();

    // 监听跨标签同步
    GM.addChangeListener(STORAGE_KEY, async () => {
      await loadConfig();
      reloadAllCSS();
    });

    // 监听系统暗黑模式切换
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        reloadAllCSS();
      });
    }
  }

  // Google: 清除 .vt6azd 内联 max-width，让卡片自然撑满容器
  function watchGoogleVt6azd() {
    if (currentSite !== 'google') return;
    const mo = new MutationObserver(() => {
      document.querySelectorAll('.vt6azd[style*="max-width"], .vt6azd[style*="width:inherit"]').forEach(el => {
        el.style.maxWidth = '';
        el.style.width = '';
      });
    });
    const rso = document.getElementById('rso');
    if (rso) mo.observe(rso, { childList: true, subtree: true, attributes: false });
    setTimeout(() => mo.disconnect(), 10000);
  }
  setTimeout(watchGoogleVt6azd, 500);

  // 处理谷歌使用百度Logo
  function handleGoogleBaiduLogo() {
    if (currentSite !== 'google' || !config.google_useBaiduLogo) return;
    $.waitEl('#logo img, a#logo', (node) => {
      if (node.hasAttribute('xchanged')) return;
      node.setAttribute('xchanged', '1');
      node.src = 'https://www.baidu.com/img/flexible/logo/pc/result.png';
      node.width = 125;
    }, 2000, false, 10000);
  }

  // 启动
  init();
  setTimeout(handleGoogleBaiduLogo, 2000);

})();
