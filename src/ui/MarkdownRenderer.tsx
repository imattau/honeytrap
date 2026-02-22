import React, { useMemo } from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content]);
  return <div className={`longform-markdown ${className}`}>{blocks}</div>;
};

function parseMarkdownBlocks(content: string): React.ReactNode[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const out: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let codeFence: string[] | null = null;
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(' ').trim();
    if (text) {
      out.push(<p key={`p-${out.length}`}>{renderInlineMarkdown(text)}</p>);
    }
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    out.push(
      <ul key={`ul-${out.length}`}>
        {listItems.map((item, idx) => (
          <li key={`li-${idx}`}>{renderInlineMarkdown(item)}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const line = rawLine.trimEnd();

    // Code blocks
    if (line.startsWith('```')) {
      flushParagraph();
      flushList();
      if (codeFence) {
        out.push(
          <pre key={`code-${out.length}`}>
            <code>{codeFence.join('\n')}</code>
          </pre>
        );
        codeFence = null;
      } else {
        codeFence = [];
      }
      continue;
    }

    if (codeFence) {
      codeFence.push(rawLine);
      continue;
    }

    // Empty line (flush current paragraph or list)
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    // Headings
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const text = heading[2].trim();
      out.push(renderHeading(Math.min(level, 6), text, `h-${out.length}`));
      continue;
    }

    // Unordered lists
    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      listItems.push(line.replace(/^[-*]\s+/, '').trim());
      continue;
    }

    // Blockquotes
    if (line.startsWith('>')) {
      flushParagraph();
      flushList();
      out.push(
        <blockquote key={`q-${out.length}`}>
          {renderInlineMarkdown(line.replace(/^>\s?/, ''))}
        </blockquote>
      );
      continue;
    }

    // Horizontal Rule
    if (/^---+$/.test(line)) {
      flushParagraph();
      flushList();
      out.push(<hr key={`hr-${out.length}`} />);
      continue;
    }

    // Default: collect as paragraph
    paragraph.push(line);
  }

  flushParagraph();
  flushList();

  return out;
}

function renderHeading(level: number, text: string, key: string) {
  const content = renderInlineMarkdown(text);
  switch (level) {
    case 1: return <h1 key={key}>{content}</h1>;
    case 2: return <h2 key={key}>{content}</h2>;
    case 3: return <h3 key={key}>{content}</h3>;
    case 4: return <h4 key={key}>{content}</h4>;
    case 5: return <h5 key={key}>{content}</h5>;
    default: return <h6 key={key}>{content}</h6>;
  }
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  // Simple regex for inline code, bold, and links
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^\)]+\))/g);
  return tokens.map((token, idx) => {
    if (!token) return null;

    if (/^`[^`]+`$/.test(token)) {
      return <code key={`code-${idx}`}>{token.slice(1, -1)}</code>;
    }

    if (/^\*\*[^*]+\*\*$/.test(token)) {
      return <strong key={`strong-${idx}`}>{token.slice(2, -2)}</strong>;
    }

    const link = token.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
    if (link) {
      const [, label, href] = link;
      return (
        <a key={`link-${idx}`} href={href} target="_blank" rel="noreferrer">
          {label}
        </a>
      );
    }

    return <React.Fragment key={`txt-${idx}`}>{token}</React.Fragment>;
  });
}
