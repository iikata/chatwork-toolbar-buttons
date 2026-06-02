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
