import type { ReactNode } from "react";

export type RichTextBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] };

function expandInlineLists(value: string) {
  return value
    .replace(/\s+([•*-])\s+/g, "\n$1 ")
    .replace(/\s+(?=\d+[.)]\s+)/g, "\n");
}

export function parseRichText(value: string): RichTextBlock[] {
  const source = expandInlineLists(value.replace(/\r\n?/g, "\n").trim());
  if (!source) return [];

  const blocks: RichTextBlock[] = [];
  let paragraph: string[] = [];
  let unordered: string[] = [];
  let ordered: string[] = [];

  const flushParagraph = () => {
    const text = paragraph.join(" ").trim();
    if (text) blocks.push({ type: "paragraph", text });
    paragraph = [];
  };
  const flushLists = () => {
    if (unordered.length) blocks.push({ type: "unordered-list", items: unordered });
    if (ordered.length) blocks.push({ type: "ordered-list", items: ordered });
    unordered = [];
    ordered = [];
  };

  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushLists();
      continue;
    }

    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushLists();
      blocks.push({ type: "heading", text: heading[1].trim() });
      continue;
    }

    const bullet = line.match(/^[-*•]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      if (ordered.length) {
        blocks.push({ type: "ordered-list", items: ordered });
        ordered = [];
      }
      unordered.push(bullet[1].trim());
      continue;
    }

    const number = line.match(/^\d+[.)]\s+(.+)$/);
    if (number) {
      flushParagraph();
      if (unordered.length) {
        blocks.push({ type: "unordered-list", items: unordered });
        unordered = [];
      }
      ordered.push(number[1].trim());
      continue;
    }

    flushLists();
    paragraph.push(line);
  }

  flushParagraph();
  flushLists();
  return blocks;
}

export function stripListMarker(value: string) {
  return value.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim();
}

export function RichText({ value, className = "" }: { value: string; className?: string }) {
  const blocks = parseRichText(value);
  return (
    <div className={`space-y-5 ${className}`}>
      {blocks.map((block, index) => {
        if (block.type === "heading") return <h3 key={`${block.type}-${index}`} className="pt-3 text-xl font-semibold leading-tight text-white sm:text-2xl">{block.text}</h3>;
        if (block.type === "unordered-list") return <ul key={`${block.type}-${index}`} className="space-y-3 pl-6 text-base leading-8 text-[#BFC6D4] marker:text-cyan-300 list-disc">{block.items.map((item, itemIndex) => <li key={`${index}-${itemIndex}`}>{item}</li>)}</ul>;
        if (block.type === "ordered-list") return <ol key={`${block.type}-${index}`} className="space-y-3 pl-7 text-base leading-8 text-[#BFC6D4] marker:font-semibold marker:text-cyan-300 list-decimal">{block.items.map((item, itemIndex) => <li key={`${index}-${itemIndex}`}>{item}</li>)}</ol>;
        return <p key={`${block.type}-${index}`} className="text-base leading-8 text-[#BFC6D4]">{block.text}</p>;
      })}
    </div>
  );
}

export function RichTextPreview({ value }: { value: string }): ReactNode {
  return <RichText value={value} />;
}
