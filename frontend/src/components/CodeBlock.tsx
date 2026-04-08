"use client";

import { useState, useCallback, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

interface CodeBlockProps {
  className?: string;
  children?: ReactNode;
}

export function CodeBlock({ className, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const language = className?.replace(/^language-/, "") ?? "";

  const extractText = useCallback((node: ReactNode): string => {
    if (typeof node === "string") return node;
    if (typeof node === "number") return String(node);
    if (!node) return "";
    if (Array.isArray(node)) return node.map(extractText).join("");
    if (typeof node === "object" && "props" in node) {
      return extractText((node as { props: { children?: ReactNode } }).props.children);
    }
    return "";
  }, []);

  const handleCopy = useCallback(async () => {
    const text = extractText(children);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [children, extractText]);

  return (
    <div className="code-block-wrapper group relative">
      {language && (
        <div className="code-block-header flex items-center justify-between px-4 py-1.5 text-xs text-gray-400 bg-gray-800 rounded-t-lg border-b border-gray-700">
          <span>{language}</span>
        </div>
      )}

      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy code"}
        className="absolute right-2 top-1.5 z-10 flex items-center gap-1 rounded-md px-2 py-1 text-xs
                   text-gray-400 opacity-0 transition-opacity group-hover:opacity-100
                   hover:bg-gray-700 hover:text-gray-200 focus:opacity-100 focus:outline-none
                   focus:ring-1 focus:ring-gray-500"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5" />
            <span>Copied!</span>
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" />
            <span>Copy</span>
          </>
        )}
      </button>

      <code className={className}>{children}</code>
    </div>
  );
}
