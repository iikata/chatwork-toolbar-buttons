'use strict';

// Reactのvalue setterをキャッシュ（nativeValueSetterハック）
const nativeSetter = Object.getOwnPropertyDescriptor(
  window.HTMLTextAreaElement.prototype,
  'value'
).set;

/**
 * ChatWorkのtextareaにテキストをカーソル位置へ挿入し、
 * ReactのonChangeも発火させてUIを同期する。
 * 選択範囲がある場合は選択テキストが before+after に置換される。
 *
 * @param {HTMLTextAreaElement} textarea
 * @param {string} before - カーソル前に挿入するテキスト
 * @param {string} after  - カーソル後に挿入するテキスト（省略可）
 * @param {number} cursorOffset - beforeの末尾から左に戻すステップ数（0=afterの直前）
 */
function insertAtCursor(textarea, before, after = '', cursorOffset = 0) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;

  const newValue = value.slice(0, start) + before + after + value.slice(end);
  const newCursor = start + before.length - cursorOffset;

  // Reactの内部stateも更新するためnativeValueSetterを使う
  nativeSetter.call(textarea, newValue);

  // setSelectionRangeはReact再レンダリング後に適用するためdispatch後にdeferする
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  Promise.resolve().then(() => {
    textarea.setSelectionRange(newCursor, newCursor);
    textarea.focus();
  });
}

/**
 * ChatWorkのメッセージ入力textareaを返す。
 * 見つからない場合はnullを返す。
 */
function findTextarea() {
  // ChatWorkのメッセージ入力エリア（2024年以降のDOM）
  return (
    document.querySelector('#_chatText') ||
    document.querySelector('textarea[name="message"]') ||
    document.querySelector('[data-testid="message-input"] textarea')
  );
}

/** 挿入するボタンの定義 */
const BUTTONS = [
  {
    id: 'cwt-btn-info-title',
    label: 'ボックス+',
    title: 'タイトルありボックス [info][title][/title][/info]',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/>
    </svg>`,
    insert: (textarea) => {
      // [info][title]█[/title][/info] — カーソルを[title]と[/title]の間に置く
      insertAtCursor(textarea, '[info][title]', '[/title][/info]', 0);
    },
  },
  {
    id: 'cwt-btn-info',
    label: 'ボックス',
    title: 'ボックス [info][/info]',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
    </svg>`,
    insert: (textarea) => {
      // [info]█[/info] — カーソルを[info]と[/info]の間に置く
      insertAtCursor(textarea, '[info]', '[/info]', 0);
    },
  },
  {
    id: 'cwt-btn-hr',
    label: '罫線',
    title: '罫線 [hr]',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="3" y1="12" x2="21" y2="12"/>
    </svg>`,
    insert: (textarea) => {
      // [hr] — カーソルはタグ末尾
      insertAtCursor(textarea, '[hr]', '', 0);
    },
  },
];

/**
 * ボタンDOM要素を生成して返す。
 */
function createButton(def) {
  const btn = document.createElement('button');
  btn.id = def.id;
  btn.type = 'button';
  btn.title = def.title;
  const iconWrapper = document.createElement('span');
  iconWrapper.innerHTML = def.icon;
  const labelSpan = document.createElement('span');
  labelSpan.style.cssText = 'margin-left:3px;font-size:11px;';
  labelSpan.textContent = def.label;
  btn.append(...iconWrapper.childNodes, labelSpan);
  btn.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'padding:4px 6px',
    'margin:0 2px',
    'border:none',
    'border-radius:4px',
    'background:transparent',
    'color:#666',
    'cursor:pointer',
    'font-size:12px',
    'line-height:1',
    'vertical-align:middle',
  ].join(';');

  btn.addEventListener('mouseenter', () => {
    btn.style.background = '#e8e8e8';
    btn.style.color = '#333';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'transparent';
    btn.style.color = '#666';
  });

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const textarea = findTextarea();
    if (textarea) def.insert(textarea);
  });

  return btn;
}

/** ボタンを包むコンテナのID（重複注入防止用） */
const CONTAINER_ID = 'cwt-toolbar-container';

/**
 * ツールバーにボタンを注入する。
 * 既に注入済みの場合は何もしない。
 *
 * @param {Element} toolbar - ボタンを挿入するツールバー要素
 */
function injectButtons(toolbar) {
  // toolbarスコープで確認することでSPA遷移後の新しいtoolbarへの再注入も正しく機能する
  if (toolbar.querySelector(`#${CONTAINER_ID}`)) return;

  const container = document.createElement('span');
  container.id = CONTAINER_ID;
  container.style.cssText = 'display:inline-flex;align-items:center;';

  BUTTONS.forEach((def) => container.appendChild(createButton(def)));

  // ツールバーの先頭に挿入（絵文字ボタンの前）
  toolbar.insertBefore(container, toolbar.firstChild);
}

/**
 * ChatWorkのツールバー要素を探す。
 * 見つかればinjectButtonsを呼ぶ。
 */
function tryInject() {
  // ChatWorkのツールバー（絵文字・ファイルボタンを含むUL要素）
  // #_chatSendArea ul が最も安定したセレクタ（2024年以降のReact版ChatWork）
  const toolbar =
    document.querySelector('#_chatSendArea ul') ||
    document.querySelector('#_sendTool') ||
    document.querySelector('._sendTool') ||
    null;

  if (toolbar) injectButtons(toolbar);
}

/** MutationObserverでSPA遷移・DOM変化を監視して再注入 */
let injectTimer = null;
const observer = new MutationObserver(() => {
  if (document.getElementById(CONTAINER_ID)) return;
  // 連続DOM変化によるselector多重発火をデバウンスで抑制
  if (injectTimer) return;
  injectTimer = setTimeout(() => {
    injectTimer = null;
    tryInject();
  }, 50);
});

observer.observe(document.body, { childList: true, subtree: true });

// 初回実行
tryInject();
