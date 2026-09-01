"use client";

import { useMemo, useRef } from "react";
import styles from "./HtmlCodeEditor.module.css";

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function replaceSelection(textarea, value, onChange, replacement, caretOffset) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const nextValue =
    value.slice(0, start) + replacement + value.slice(end);

  onChange(nextValue);

  requestAnimationFrame(() => {
    const nextCaret = start + caretOffset;
    textarea.focus();
    textarea.setSelectionRange(nextCaret, nextCaret);
  });
}

export default function HtmlCodeEditor({
  value,
  onChange,
  placeholder = "",
  disabled = false,
}) {
  const textareaRef = useRef(null);
  const gutterRef = useRef(null);

  const lineNumbers = useMemo(() => {
    const count = Math.max(1, value.split("\n").length);
    return Array.from({ length: count }, (_, index) => index + 1);
  }, [value]);

  function handleKeyDown(event) {
    const textarea = textareaRef.current;
    if (!textarea || disabled) return;

    if (event.key === "Tab") {
      event.preventDefault();
      replaceSelection(textarea, value, onChange, "  ", 2);
      return;
    }

    if (event.key === "Enter") {
      const start = textarea.selectionStart;
      const beforeCaret = value.slice(0, start);
      const currentLine = beforeCaret.slice(beforeCaret.lastIndexOf("\n") + 1);
      const indent = currentLine.match(/^\s*/)?.[0] || "";

      if (indent) {
        event.preventDefault();
        replaceSelection(
          textarea,
          value,
          onChange,
          "\n" + indent,
          1 + indent.length,
        );
      }
      return;
    }

    if (event.key !== ">") return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start !== end) return;

    const beforeCaret = value.slice(0, start);
    const tagStart = beforeCaret.lastIndexOf("<");

    if (tagStart < 0) return;

    const openFragment = beforeCaret.slice(tagStart);

    if (
      openFragment.startsWith("</") ||
      openFragment.startsWith("<!") ||
      openFragment.startsWith("<?") ||
      openFragment.endsWith("/")
    ) {
      return;
    }

    const match = openFragment.match(/^<([A-Za-z][\w:-]*)(?:\s[^<>]*)?$/);
    if (!match) return;

    const tagName = match[1];
    const lowerTagName = tagName.toLowerCase();

    event.preventDefault();

    if (VOID_TAGS.has(lowerTagName)) {
      replaceSelection(textarea, value, onChange, ">", 1);
      return;
    }

    const insertion = `></${tagName}>`;
    replaceSelection(textarea, value, onChange, insertion, 1);
  }

  function handleScroll(event) {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  }

  return (
    <div className={styles.editorShell}>
      <div className={styles.toolbar} aria-hidden="true">
        <span>HTML</span>
        <span>Tab = indent · tags close automatically</span>
      </div>

      <div className={styles.editorBody}>
        <div className={styles.gutter} ref={gutterRef} aria-hidden="true">
          {lineNumbers.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          rows={20}
        />
      </div>
    </div>
  );
}
